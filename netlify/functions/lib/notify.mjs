// Dispara os avisos de pedido. Regra de ouro: aviso é best-effort — nenhuma falha aqui pode
// derrubar o webhook de pagamento ou o painel. Cada canal roda em paralelo, com timeout próprio
// (ver email.mjs/whatsapp.mjs), e falhas vão pro log + Sentry e voltam como 'failed' no resultado.
import { sendEmail } from './email.mjs';
import { parseWhatsAppRecipients, sendWhatsApp } from './whatsapp.mjs';
import { captureError } from './sentry.mjs';
import {
  customerConfirmationEmail,
  customerShippedEmail,
  bandNewOrderEmail,
  bandNewOrderWhatsApp,
} from './notify-templates.mjs';

function baseUrl() {
  return (process.env.SITE_URL || 'http://localhost:8888').replace(/\/+$/, '');
}

function bandEmails() {
  return String(process.env.BAND_NOTIFY_EMAILS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

async function attempt(channel, orderId, fn) {
  try {
    const result = await fn();
    return result.status;
  } catch (err) {
    console.error(`notify: ${channel} falhou para o pedido ${orderId}:`, err);
    await captureError(err, { functionName: 'notify', extra: { channel, orderId } });
    return 'failed';
  }
}

// Pedido acabou de ser pago: confirmação pro cliente + alerta pra banda (e-mail e WhatsApp).
export async function notifyOrderPaid(order) {
  const base = baseUrl();
  const waText = bandNewOrderWhatsApp(order, base);
  const recipients = parseWhatsAppRecipients(process.env.BAND_NOTIFY_WHATSAPP);

  const [customerEmail, bandEmail, ...whatsapp] = await Promise.all([
    attempt('customer_email', order.id, () =>
      sendEmail({
        to: order.buyer && order.buyer.email,
        ...customerConfirmationEmail(order, base),
        idempotencyKey: `${order.id}-confirmation`,
      })
    ),
    attempt('band_email', order.id, () =>
      sendEmail({
        to: bandEmails(),
        ...bandNewOrderEmail(order, base),
        idempotencyKey: `${order.id}-band-new-order`,
      })
    ),
    ...recipients.map((recipient) => attempt('band_whatsapp', order.id, () => sendWhatsApp(recipient, waText))),
  ]);

  return { customer_email: customerEmail, band_email: bandEmail, band_whatsapp: whatsapp };
}

// O e-mail de "pedido enviado" sai quando o pedido entra em `shipped` e de novo se o código de
// rastreio mudar depois (ex.: código adicionado mais tarde, ou um erro de digitação corrigido).
// Salvar de novo sem mudar nada não reenvia — `shipped_email_key` guarda o que já foi mandado.
export function shouldSendShippedEmail(order) {
  if (!order || order.status !== 'shipped') return false;
  if (!order.buyer || !order.buyer.email) return false;
  return (order.tracking_code || '') !== order.shipped_email_key;
}

export async function notifyOrderShipped(order) {
  const base = baseUrl();
  const customerEmail = await attempt('shipped_email', order.id, () =>
    sendEmail({
      to: order.buyer && order.buyer.email,
      ...customerShippedEmail(order, base),
      idempotencyKey: `${order.id}-shipped-${order.tracking_code || 'sem-codigo'}`,
    })
  );
  return { customer_email: customerEmail };
}
