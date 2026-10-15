import { test } from 'node:test';
import assert from 'node:assert/strict';
import { customerConfirmationEmail, bandNewOrderEmail, pickupWhatsAppUrl } from '../netlify/functions/lib/notify-templates.mjs';

const pickupOrder = {
  id: 'abcdef12-0000-0000-0000-000000000000',
  items: [{ id: 'cd', name: 'CD Físico', qty: 1, unit_price_cents: 3500 }, { id: 'camiseta', name: 'Camiseta ISOTOPXS — tamanho M', size: 'M', qty: 1, unit_price_cents: 9000 }],
  total_cents: 3500,
  buyer: { name: 'Fulana de Tal', email: 'f@example.com', phone: '51999990000' },
  shipping: {
    label: 'Retirada em Porto Alegre (combinar com o Deo)', price_cents: 0, pickup: true, address: null, pickup_whatsapp: '5551981454073',
    note: 'Grátis. Depois do pagamento, combina dia e lugar com o Deo pelo WhatsApp ou telefone (51) 98145-4073.',
  },
};

test('e-mails de pedido com retirada: contato do Deo pro cliente, sem endereço nem "a gente posta"', () => {
  const customer = customerConfirmationEmail(pickupOrder, 'https://isotopxs.com.br');
  for (const body of [customer.html, customer.text]) {
    assert.match(body, /wa\.me\/5551981454073/);
    assert.doesNotMatch(body, /embala e posta/);
  }
  const band = bandNewOrderEmail(pickupOrder, 'https://isotopxs.com.br');
  for (const body of [band.html, band.text]) {
    assert.match(body, /Retirada em Porto Alegre/);
    assert.doesNotMatch(body, /Endereço de entrega/);
  }
});

test('mensagem pronta do WhatsApp da retirada leva pedido, itens com tamanho e primeiro nome', () => {
  const url = new URL(pickupWhatsAppUrl(pickupOrder));
  assert.equal(url.origin + url.pathname, 'https://wa.me/5551981454073');
  const text = url.searchParams.get('text');
  assert.match(text, /^Oi, Deo! Aqui é Fulana\. /);
  assert.match(text, /pedido #ABCDEF12/);
  assert.match(text, /1× Camiseta ISOTOPXS — tamanho M/);
  assert.equal(pickupWhatsAppUrl({ ...pickupOrder, shipping: { pickup: true } }), null);
});
