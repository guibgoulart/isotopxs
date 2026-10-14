// Netlify Functions v2 (ESM) — ver nota em shipping-quote.mjs sobre por que v2 e não v1.
import mercadopagoPkg from './lib/mercadopago.js';
import shippingPkg from './lib/shipping.js';
import { getOrder, updateOrder, claimShipmentCreation, claimPaidNotification } from './lib/orders-store.mjs';
import { notifyOrderPaid } from './lib/notify.mjs';
import { captureError, withErrorReporting } from './lib/sentry.mjs';
import { posthog, flushPostHog } from './lib/posthog.mjs';

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

export function mapPaymentStatus(mpStatus) {
  if (mpStatus === 'approved') return 'paid';
  if (mpStatus === 'rejected' || mpStatus === 'cancelled') return 'failed';
  return 'pending'; // in_process, pending, in_mediation, etc.
}

// Depois que o pedido entra em cumprimento (shipped, delivered, cancelled...), quem decide o status
// é a banda no painel — uma notificação atrasada ou reenviada da Mercado Pago não pode desfazer isso.
// O status cru da MP continua sempre atualizado em payment_status.
const PRE_PAYMENT_STATUSES = new Set(['pending', 'failed']);

export function nextOrderStatus(currentStatus, mpStatus) {
  if (currentStatus && !PRE_PAYMENT_STATUSES.has(currentStatus)) return currentStatus;
  return mapPaymentStatus(mpStatus);
}

// Limite bem folgado: todas as notificações da Mercado Pago saem de um pool pequeno e
// compartilhado de IPs deles, não do cliente final — um limite apertado aqui bloquearia
// pedidos de outras pessoas, recriando o mesmo tipo de falha silenciosa já corrigida antes.
// Isso serve só para conter abuso flagrante, não para throttle normal.
export const config = {
  rateLimit: {
    action: 'block',
    windowLimit: 300,
    windowSize: 60,
    aggregateBy: ['ip'],
  },
};

export default withErrorReporting(async (req) => {
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
    await captureError(err, { functionName: 'mp-webhook', extra: { stage: 'get-payment', paymentId } });
    return json({ error: 'Falha ao consultar pagamento' }, 502);
  }

  const orderId = payment.external_reference;
  const order = await getOrder(orderId);
  if (!order) {
    console.warn(`mp-webhook: pedido não encontrado para external_reference=${orderId}`);
    return json({ ignored: true });
  }

  const nextStatus = nextOrderStatus(order.status, payment.status);
  const becamePaid = nextStatus === 'paid' && order.status !== 'paid';

  let updated = await updateOrder(orderId, {
    status: nextStatus,
    payment_status: payment.status,
    payment_id: String(payment.id),
  });

  // Use buyer email as distinct ID when available so events link to the person
  // identified during checkout; fall back to orderId for anonymous orders.
  const buyerEmail = order.buyer && order.buyer.email;
  const distinctId = buyerEmail || orderId;

  if (nextStatus === 'paid') {
    if (posthog && becamePaid) {
      posthog.capture({
        distinctId,
        event: 'payment_completed',
        properties: {
          order_id: orderId,
          payment_id: String(payment.id),
          payment_method: payment.payment_method_id || null,
          total_cents: order.total_cents,
          item_count: (order.items || []).reduce((sum, i) => sum + (i.qty || 0), 0),
          shipping_option: order.shipping && order.shipping.label,
          shipping_cents: order.shipping && order.shipping.price_cents,
        },
      });
    }

    // Confirmação pro cliente + alerta pra banda. A claim garante uma vez só por pedido mesmo com
    // notificação repetida; notifyOrderPaid nunca lança (falha de aviso não derruba o webhook).
    const toNotify = await claimPaidNotification(orderId);
    if (toNotify) {
      const results = await notifyOrderPaid(toNotify);
      console.log(`mp-webhook: avisos do pedido ${orderId}:`, JSON.stringify(results));
      // Fica no pedido pra banda conseguir responder "o cliente recebeu o e-mail?" pelo painel.
      updated = await updateOrder(orderId, { paid_notifications: results });
    }

    // Sem integração real com a Loggi, o envio é manual (a banda posta e coloca o rastreio no
    // painel) — gerar um código de rastreio simulado aqui só confundiria a banda e o cliente.
    // claimShipmentCreation relê o pedido na hora e só "ganha" quem realmente for o único a
    // reivindicar — protege contra a Mercado Pago reenviar a mesma notificação em paralelo
    // (ver comentário em orders-store.mjs).
    const claimed = shipping.usingRealLoggi() ? await claimShipmentCreation(orderId) : null;
    if (claimed) {
      try {
        const shipment = await shipping.createShipment(claimed);
        updated = await updateOrder(orderId, {
          tracking_code: shipment.trackingCode,
          shipping_status: shipment.status,
          shipping_carrier: shipment.carrier,
          tracking_url: shipment.trackingUrl || null,
          shipping_claim: null,
          shipping_claim_at: null,
        });
        if (posthog) {
          posthog.capture({
            distinctId,
            event: 'shipment_created',
            properties: {
              order_id: orderId,
              tracking_code: shipment.trackingCode,
              carrier: shipment.carrier,
              shipping_status: shipment.status,
            },
          });
        }
      } catch (err) {
        console.error(`mp-webhook: falha ao criar envio para o pedido ${orderId}:`, err);
        await captureError(err, { functionName: 'mp-webhook', extra: { stage: 'create-shipment', orderId } });
        if (posthog) {
          posthog.captureException(err, distinctId, { order_id: orderId, stage: 'create-shipment' });
          posthog.capture({
            distinctId,
            event: 'shipment_creation_failed',
            properties: {
              order_id: orderId,
              error: String(err.message || err),
            },
          });
        }
        await updateOrder(orderId, {
          shipping_status: 'error',
          shipping_error: String(err.message || err),
          shipping_claim: null,
          shipping_claim_at: null,
        });
      }
    }
  } else if (nextStatus === 'failed') {
    if (posthog) {
      posthog.capture({
        distinctId,
        event: 'payment_failed',
        properties: {
          order_id: orderId,
          payment_id: String(payment.id),
          payment_status: payment.status,
          total_cents: order.total_cents,
        },
      });
    }
  }

  if (posthog) await flushPostHog();

  return json({ ok: true });
}, 'mp-webhook');
