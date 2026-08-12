// Netlify Functions v2 (ESM) — ver nota em shipping-quote.mjs sobre por que v2 e não v1.
import ordersStorePkg from './lib/orders-store.js';

const { getOrder } = ordersStorePkg;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export default async (req) => {
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
};
