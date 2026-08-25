// Netlify Functions v2 (ESM) — ver nota em shipping-quote.mjs sobre por que v2 e não v1.
import { getOrder } from './lib/orders-store.mjs';
import { withErrorReporting } from './lib/sentry.mjs';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

// checkout-status.js faz no máximo 6 chamadas por pedido (poll a cada 2.5s) — 30/min por IP
// cobre isso várias vezes seguidas (ex.: abas abertas, retries manuais) sem sobrar margem pra abuso.
export const config = {
  rateLimit: {
    action: 'block',
    windowLimit: 30,
    windowSize: 60,
    aggregateBy: ['ip'],
  },
};

export default withErrorReporting(async (req) => {
  if (req.method !== 'GET') return json({ error: 'Método não permitido' }, 405);

  const orderId = new URL(req.url).searchParams.get('order');
  if (!orderId) return json({ error: 'Parâmetro "order" obrigatório' }, 400);

  const order = await getOrder(orderId);
  if (!order) return json({ error: 'Pedido não encontrado' }, 404);

  return json({
    id: order.id,
    status: order.status,
    payment_status: order.payment_status,
    items: order.items,
    subtotal_cents: order.subtotal_cents,
    shipping: order.shipping,
    total_cents: order.total_cents,
    tracking_code: order.tracking_code,
    shipping_status: order.shipping_status,
    created_at: order.created_at,
    updated_at: order.updated_at,
  });
});
