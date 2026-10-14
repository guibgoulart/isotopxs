// Envio de e-mail transacional via API REST do Resend (sem SDK — é uma chamada HTTP só, mesmo
// padrão de lib/mercadopago.js e lib/sentry.mjs). Dorme sem RESEND_API_KEY/RESEND_FROM_EMAIL:
// devolve { status: 'skipped' } e nada quebra — dá pra subir o resto antes de configurar o Resend.

const RESEND_URL = 'https://api.resend.com/emails';
const TIMEOUT_MS = 5000;

export function emailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL);
}

// Lança erro em falha de verdade (HTTP != 2xx, timeout). Quem chama decide se isso importa —
// lib/notify.mjs captura tudo, porque e-mail nunca pode derrubar o fluxo de pagamento.
export async function sendEmail({ to, subject, html, text, idempotencyKey }) {
  const recipients = (Array.isArray(to) ? to : [to]).filter(Boolean);
  if (!emailConfigured() || recipients.length === 0) return { status: 'skipped' };

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
  };
  // O Resend descarta um segundo envio com a mesma chave dentro de 24h — rede de segurança extra
  // contra e-mail duplicado além das claims em orders-store.
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

  const body = {
    from: process.env.RESEND_FROM_EMAIL,
    to: recipients,
    subject,
    html,
    text,
  };
  if (process.env.EMAIL_REPLY_TO) body.reply_to = process.env.EMAIL_REPLY_TO;

  const res = await fetch(RESEND_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Resend recusou o e-mail (HTTP ${res.status}): ${detail.slice(0, 300)}`);
  }
  return { status: 'sent' };
}
