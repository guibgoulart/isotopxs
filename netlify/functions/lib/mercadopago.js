// Cliente fino para a API REST da Mercado Pago (Checkout Pro). Sem SDK oficial de propósito —
// é só duas chamadas HTTP, e assim fica óbvio o que está sendo enviado/recebido.
const crypto = require('crypto');

const DEFAULT_BASE = 'https://api.mercadopago.com';

// MP_API_BASE só deve ser trocado durante teste local, pra apontar para um mock HTTP que imita
// a API da Mercado Pago sem precisar de credenciais reais (ver scripts/mock-mp-server.js).
function config() {
  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error('MP_ACCESS_TOKEN não configurado — copie .env.example para .env e preencha.');
  }
  return { accessToken, base: process.env.MP_API_BASE || DEFAULT_BASE };
}

async function createPreference(preference) {
  const { accessToken, base } = config();
  const res = await fetch(`${base}/checkout/preferences`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(preference),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Mercado Pago recusou a criação da preferência (HTTP ${res.status}): ${JSON.stringify(data)}`);
  }
  return data;
}

async function getPayment(paymentId) {
  const { accessToken, base } = config();
  const res = await fetch(`${base}/v1/payments/${encodeURIComponent(paymentId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Falha ao consultar pagamento ${paymentId} (HTTP ${res.status}): ${JSON.stringify(data)}`);
  }
  return data;
}

// Valida a assinatura HMAC do webhook (header x-signature), conforme o esquema da Mercado Pago:
// manifest = "id:{data.id};request-id:{x-request-id};ts:{ts};" assinado com MP_WEBHOOK_SECRET.
// Sem MP_WEBHOOK_SECRET configurado, a validação é pulada (skipped:true) — útil em dev, mas
// configure o secret assim que possível em produção.
function verifyWebhookSignature({ xSignature, xRequestId, dataId }) {
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) return { verified: false, skipped: true };
  if (!xSignature) return { verified: false, skipped: false };

  const parts = {};
  for (const chunk of xSignature.split(',')) {
    const [key, ...rest] = chunk.split('=');
    if (key) parts[key.trim()] = rest.join('=').trim();
  }
  const { ts, v1 } = parts;
  if (!ts || !v1) return { verified: false, skipped: false };

  const manifest = `id:${dataId};request-id:${xRequestId || ''};ts:${ts};`;
  const expected = crypto.createHmac('sha256', secret).update(manifest).digest('hex');

  let verified = false;
  try {
    verified = crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(v1, 'hex'));
  } catch {
    verified = false;
  }
  // DIAGNÓSTICO TEMPORÁRIO — remover depois de confirmar a causa do 401 recorrente.
  return { verified, skipped: false, debugManifest: manifest, debugExpected: expected, debugV1: v1 };
}

module.exports = { createPreference, getPayment, verifyWebhookSignature };
