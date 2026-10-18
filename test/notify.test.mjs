// Testa e-mail/WhatsApp sem bater em API nenhuma: fetch global é trocado por um stub que grava as
// chamadas e responde o que cada teste mandar.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { sendEmail } from '../netlify/functions/lib/email.mjs';
import { parseWhatsAppRecipients, sendWhatsApp } from '../netlify/functions/lib/whatsapp.mjs';
import { notifyOrderPaid, notifyOrderShipped, shouldSendShippedEmail } from '../netlify/functions/lib/notify.mjs';
import {
  customerConfirmationEmail,
  customerShippedEmail,
  bandNewOrderEmail,
  bandNewOrderWhatsApp,
  addressLines,
} from '../netlify/functions/lib/notify-templates.mjs';

const ENV_KEYS = ['RESEND_API_KEY', 'RESEND_FROM_EMAIL', 'EMAIL_REPLY_TO', 'BAND_NOTIFY_EMAILS', 'BAND_NOTIFY_WHATSAPP', 'SENTRY_DSN', 'SITE_URL'];
const realFetch = globalThis.fetch;
let calls;
let responder;

beforeEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
  process.env.SITE_URL = 'https://isotopxs.com.br';
  calls = [];
  responder = () => new Response('{"id":"ok"}', { status: 200 });
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    return responder(String(url), init);
  };
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

function configureEmail() {
  process.env.RESEND_API_KEY = 're_test_123';
  process.env.RESEND_FROM_EMAIL = 'ISOTOPXS <pedidos@isotopxs.com.br>';
}

function makeOrder(overrides = {}) {
  return {
    id: '2a62bf14-7a1b-45b3-a9e0-3aabc6d888f6',
    status: 'paid',
    items: [{ id: 'cd', name: 'CD Físico - qualquer frase fica melhor com foda-se no final', qty: 1, unit_price_cents: 3500 }],
    shipping: {
      destination_cep: '91910001',
      label: 'Loggi Ponto (retirada em ponto de coleta)',
      price_cents: 1290,
      address: { street: 'Av. Ipiranga', number: '1000', complement: 'ap 2', district: 'Azenha', city: 'Porto Alegre', state: 'RS' },
    },
    total_cents: 4790,
    buyer: { name: 'Luiza Schmidt', email: 'luiza@example.com', phone: '51999990000' },
    ...overrides,
  };
}

// ---------- templates ----------

test('templates: valores do cliente são escapados no HTML e ficam crus no texto', () => {
  const order = makeOrder({ buyer: { name: '<script>alert(1)</script> Silva', email: 'a@b.co', phone: '51999990000' } });
  const { html, text } = customerConfirmationEmail(order, 'https://isotopxs.com.br');
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(text.includes('Oi, <script>alert(1)</script>!'));
});

test('templates: confirmação traz itens, total, endereço e link do pedido', () => {
  const { subject, html, text } = customerConfirmationEmail(makeOrder(), 'https://isotopxs.com.br');
  assert.equal(subject, 'ISOTOPXS - pedido #2A62BF14 confirmado');
  assert.match(html, /R\$\s47,90/);
  assert.match(text, /Total: R\$\s47,90/);
  assert.ok(text.includes('Av. Ipiranga, 1000, ap 2'));
  assert.ok(text.includes('https://isotopxs.com.br/checkout-status.html?order=2a62bf14-7a1b-45b3-a9e0-3aabc6d888f6'));
});

test('templates: e-mail de envio com e sem código de rastreio', () => {
  const withCode = customerShippedEmail(makeOrder({ tracking_code: 'AA123456789BR', shipping_carrier: 'Correios', tracking_url: 'https://rastreio.example/AA1' }), 'https://x');
  assert.ok(withCode.text.includes('Código de rastreio (Correios): AA123456789BR'));
  assert.ok(withCode.html.includes('https://rastreio.example/AA1'));

  const noCode = customerShippedEmail(makeOrder(), 'https://x');
  assert.ok(noCode.text.includes('assim que a transportadora liberar'));
});

test('templates: alerta da banda por e-mail tem dados completos e link do painel', () => {
  const { subject, text } = bandNewOrderEmail(makeOrder(), 'https://isotopxs.com.br');
  assert.match(subject, /Novo pedido pago #2A62BF14/);
  assert.ok(text.includes('luiza@example.com'));
  assert.ok(text.includes('https://isotopxs.com.br/admin.html#pedido=2a62bf14-7a1b-45b3-a9e0-3aabc6d888f6'));
});

test('templates: WhatsApp (serviço de terceiro) não leva e-mail, telefone nem rua do cliente', () => {
  const text = bandNewOrderWhatsApp(makeOrder(), 'https://isotopxs.com.br');
  assert.ok(text.includes('Porto Alegre/RS'));
  assert.ok(text.includes('#2A62BF14'));
  for (const pii of ['luiza@example.com', '51999990000', 'Ipiranga', 'Luiza']) assert.ok(!text.includes(pii), pii);
});

test('templates: pedido antigo sem endereço mostra só o CEP', () => {
  const order = makeOrder();
  delete order.shipping.address;
  assert.deepEqual(addressLines(order), ['CEP 91910-001']);
});

// ---------- e-mail ----------

test('sendEmail: sem RESEND configurado não chama nada', async () => {
  assert.deepEqual(await sendEmail({ to: 'a@b.co', subject: 's', html: 'h', text: 't' }), { status: 'skipped' });
  assert.equal(calls.length, 0);
});

test('sendEmail: monta a chamada pro Resend com idempotência e reply-to', async () => {
  configureEmail();
  process.env.EMAIL_REPLY_TO = 'contato@isotopxs.com.br';
  const result = await sendEmail({ to: 'a@b.co', subject: 's', html: 'h', text: 't', idempotencyKey: 'pedido-1-confirmation' });

  assert.deepEqual(result, { status: 'sent' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.resend.com/emails');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer re_test_123');
  assert.equal(calls[0].init.headers['Idempotency-Key'], 'pedido-1-confirmation');
  const body = JSON.parse(calls[0].init.body);
  assert.deepEqual(body.to, ['a@b.co']);
  assert.equal(body.from, 'ISOTOPXS <pedidos@isotopxs.com.br>');
  assert.equal(body.reply_to, 'contato@isotopxs.com.br');
});

test('sendEmail: erro HTTP do Resend vira exceção', async () => {
  configureEmail();
  responder = () => new Response('{"message":"domain not verified"}', { status: 403 });
  await assert.rejects(() => sendEmail({ to: 'a@b.co', subject: 's', html: 'h', text: 't' }), /HTTP 403/);
});

// ---------- WhatsApp ----------

test('parseWhatsAppRecipients: aceita lista com espaços e ignora entradas quebradas', () => {
  assert.deepEqual(parseWhatsAppRecipients(' 55 51 99999-0000:111 , +5511988887777:222, semchave, :333 '), [
    { phone: '+5551999990000', apikey: '111' },
    { phone: '+5511988887777', apikey: '222' },
  ]);
  assert.deepEqual(parseWhatsAppRecipients(undefined), []);
});

test('sendWhatsApp: manda telefone, apikey e texto na query da CallMeBot', async () => {
  await sendWhatsApp({ phone: '+5551999990000', apikey: '111' }, 'oi & tchau');
  const url = new URL(calls[0].url);
  assert.equal(url.host, 'api.callmebot.com');
  assert.equal(url.searchParams.get('phone'), '+5551999990000');
  assert.equal(url.searchParams.get('apikey'), '111');
  assert.equal(url.searchParams.get('text'), 'oi & tchau');
});

test('sendWhatsApp: erro no corpo com HTTP 200 é falha, e a apikey não vaza na mensagem', async () => {
  responder = () => new Response('<p>APIKey is invalid. Please check</p>', { status: 200 });
  await assert.rejects(
    () => sendWhatsApp({ phone: '+5551999990000', apikey: 'segredo-123' }, 'oi'),
    (err) => /APIKey is invalid/.test(err.message) && !err.message.includes('segredo-123')
  );
});

// ---------- orquestração ----------

test('notifyOrderPaid: cliente, e-mail da banda e um WhatsApp por pessoa', async () => {
  configureEmail();
  process.env.BAND_NOTIFY_EMAILS = 'gui@example.com, deo@example.com';
  process.env.BAND_NOTIFY_WHATSAPP = '5551999990000:111,5551988880000:222';

  const result = await notifyOrderPaid(makeOrder());
  assert.deepEqual(result, { customer_email: 'sent', band_email: 'sent', band_whatsapp: ['sent', 'sent'] });

  const resendBodies = calls.filter((c) => c.url.includes('resend')).map((c) => JSON.parse(c.init.body));
  assert.deepEqual(resendBodies.map((b) => b.to), [['luiza@example.com'], ['gui@example.com', 'deo@example.com']]);
  assert.equal(calls.filter((c) => c.url.includes('callmebot')).length, 2);
});

test('notifyOrderPaid: falha de um canal não derruba os outros nem lança', async () => {
  configureEmail();
  process.env.BAND_NOTIFY_EMAILS = 'gui@example.com';
  process.env.BAND_NOTIFY_WHATSAPP = '5551999990000:111,5551988880000:222';
  responder = (url) => {
    if (url.includes('apikey=222')) return new Response('error', { status: 500 });
    if (url.includes('resend')) throw new TypeError('fetch failed');
    return new Response('Message queued', { status: 200 });
  };

  const result = await notifyOrderPaid(makeOrder());
  assert.deepEqual(result, { customer_email: 'failed', band_email: 'failed', band_whatsapp: ['sent', 'failed'] });
});

test('notifyOrderPaid: nada configurado = tudo skipped, nenhuma chamada', async () => {
  const result = await notifyOrderPaid(makeOrder());
  assert.deepEqual(result, { customer_email: 'skipped', band_email: 'skipped', band_whatsapp: [] });
  assert.equal(calls.length, 0);
});

test('notifyOrderShipped: idempotência por código de rastreio', async () => {
  configureEmail();
  await notifyOrderShipped(makeOrder({ status: 'shipped', tracking_code: 'AA1' }));
  assert.equal(calls[0].init.headers['Idempotency-Key'], '2a62bf14-7a1b-45b3-a9e0-3aabc6d888f6-shipped-AA1');
});

test('shouldSendShippedEmail: entra em enviado → manda; salvar de novo → não; código novo → manda', () => {
  const base = makeOrder({ status: 'shipped', tracking_code: null });
  assert.equal(shouldSendShippedEmail(base), true, 'primeira vez como enviado, mesmo sem código');
  assert.equal(shouldSendShippedEmail({ ...base, shipped_email_key: '' }), false, 'já avisou sem código');
  assert.equal(shouldSendShippedEmail({ ...base, tracking_code: 'AA1', shipped_email_key: '' }), true, 'código chegou depois');
  assert.equal(shouldSendShippedEmail({ ...base, tracking_code: 'AA1', shipped_email_key: 'AA1' }), false);
  assert.equal(shouldSendShippedEmail({ ...base, tracking_code: 'AA2', shipped_email_key: 'AA1' }), true, 'código corrigido');
  assert.equal(shouldSendShippedEmail({ ...base, status: 'paid' }), false);
  assert.equal(shouldSendShippedEmail({ ...base, status: 'delivered' }), false);
  assert.equal(shouldSendShippedEmail({ ...base, buyer: {} }), false, 'sem e-mail do cliente');
});
