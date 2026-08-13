// Netlify Functions v2 (ESM) — ver nota em shipping-quote.mjs sobre por que v2 e não v1.
import mercadopagoPkg from './lib/mercadopago.js';
import shippingPkg from './lib/shipping.js';
import { getOrder, updateOrder } from './lib/orders-store.mjs';

const mercadopago = mercadopagoPkg;
const shipping = shippingPkg;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

async function extractPaymentId(req) {
  const url = new URL(req.url);
  let body = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const type = body.type || body.topic || url.searchParams.get('type') || url.searchParams.get('topic');
  const id = (body.data && body.data.id) || url.searchParams.get('data.id') || url.searchParams.get('id');
  if (type !== 'payment' || !id) return null;
  return String(id);
}

function mapPaymentStatus(mpStatus) {
  if (mpStatus === 'approved') return 'paid';
  if (mpStatus === 'rejected' || mpStatus === 'cancelled') return 'failed';
  return 'pending'; // in_process, pending, in_mediation, etc.
}

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);

  const paymentId = await extractPaymentId(req);
  if (!paymentId) {
    // Notificação de um tipo que não nos interessa (ex.: merchant_order) — só confirma recebimento.
    return json({ ignored: true });
  }

  // A Mercado Pago envia esse webhook via `notification_url` (IPN) — a documentação oficial deles
  // confirma que o header x-signature do IPN não é validável pela chave secreta (mesmo com a
  // secret certa, o HMAC nunca bate). Por isso não usamos a assinatura como portão de entrada:
  // a validação de verdade é buscar o pagamento na API da Mercado Pago com nosso próprio
  // access token logo abaixo — só nós temos esse token, então não dá pra forjar um pagamento
  // aprovado, no máximo alguém força a gente a reconsultar um pagamento que já existe de verdade.
  const { verified, skipped } = mercadopago.verifyWebhookSignature({
    xSignature: req.headers.get('x-signature'),
    xRequestId: req.headers.get('x-request-id'),
    dataId: paymentId,
  });
  if (!skipped && !verified) {
    console.warn('mp-webhook: assinatura não bateu (esperado para notificações IPN) — seguindo com a consulta na API');
  } else if (skipped) {
    console.warn('mp-webhook: MP_WEBHOOK_SECRET não configurado — seguindo com a consulta na API mesmo assim');
  }

  let payment;
  try {
    payment = await mercadopago.getPayment(paymentId);
  } catch (err) {
    console.error('mp-webhook: falha ao buscar pagamento na Mercado Pago:', err);
    return json({ error: 'Falha ao consultar pagamento' }, 502);
  }

  const orderId = payment.external_reference;
  const order = await getOrder(orderId);
  if (!order) {
    console.warn(`mp-webhook: pedido não encontrado para external_reference=${orderId}`);
    return json({ ignored: true });
  }

  const nextStatus = mapPaymentStatus(payment.status);
  const wasAlreadyPaid = order.status === 'paid';

  let updated = await updateOrder(orderId, {
    status: nextStatus,
    payment_status: payment.status,
    payment_id: String(payment.id),
  });

  if (nextStatus === 'paid' && !wasAlreadyPaid && !updated.tracking_code) {
    try {
      const shipment = await shipping.createShipment(updated);
      updated = await updateOrder(orderId, {
        tracking_code: shipment.trackingCode,
        shipping_status: shipment.status,
        shipping_carrier: shipment.carrier,
      });
    } catch (err) {
      console.error(`mp-webhook: falha ao criar envio para o pedido ${orderId}:`, err);
      await updateOrder(orderId, { shipping_status: 'error', shipping_error: String(err.message || err) });
    }
  }

  return json({ ok: true });
};
