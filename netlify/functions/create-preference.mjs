// Netlify Functions v2 (ESM) — ver nota em shipping-quote.mjs sobre por que v2 e não v1.
import { randomUUID } from 'node:crypto';
import catalogPkg from './lib/catalog.js';
import shippingPkg from './lib/shipping.js';
import mercadopagoPkg from './lib/mercadopago.js';
import { createOrder } from './lib/orders-store.mjs';
import { captureError, withErrorReporting } from './lib/sentry.mjs';

const { priceCartItems } = catalogPkg;
const shipping = shippingPkg;
const mercadopago = mercadopagoPkg;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function siteUrl() {
  return (process.env.SITE_URL || 'http://localhost:8888').replace(/\/+$/, '');
}

// Cada chamada cria um registro de pedido no Blobs e chama a API da Mercado Pago — mais caro que
// shipping-quote, então o limite é mais apertado. 10/min por IP ainda cobre alguém que erra o
// checkout e tenta de novo várias vezes.
export const config = {
  rateLimit: {
    action: 'block',
    windowLimit: 10,
    windowSize: 60,
    aggregateBy: ['ip'],
  },
};

export default withErrorReporting(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);

  let payload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'JSON inválido' }, 400);
  }

  const { lineItems, subtotalCents, totalWeightG, errors } = priceCartItems(payload.items);
  if (errors.length || lineItems.length === 0) {
    return json({ error: 'Carrinho inválido', details: errors }, 400);
  }

  const rawDestinationCep = payload.shipping && payload.shipping.destinationCep;
  const optionId = payload.shipping && payload.shipping.optionId;
  if (!shipping.isValidCep(rawDestinationCep) || !optionId) {
    return json({ error: 'Frete não selecionado ou CEP inválido' }, 400);
  }
  const destinationCep = shipping.normalizeCep(rawDestinationCep);

  let shippingOption;
  try {
    const options = await shipping.quote({
      originCep: process.env.ORIGIN_CEP,
      destinationCep,
      weightG: totalWeightG,
    });
    shippingOption = options.find((o) => o.id === optionId);
  } catch (err) {
    console.error('create-preference: falha ao recotar frete:', err);
    await captureError(err, { functionName: 'create-preference', extra: { stage: 'shipping-requote' } });
    return json({ error: 'Falha ao validar frete' }, 502);
  }

  if (!shippingOption) {
    return json({ error: 'Opção de frete inválida ou expirada' }, 400);
  }

  const buyer = payload.buyer || {};
  const orderId = randomUUID();
  const totalCents = subtotalCents + shippingOption.price_cents;

  const order = {
    id: orderId,
    status: 'pending',
    payment_status: null,
    payment_id: null,
    items: lineItems.map(({ product, qty }) => ({
      id: product.id,
      name: product.name,
      qty,
      unit_price_cents: product.price_cents,
    })),
    subtotal_cents: subtotalCents,
    shipping: {
      destination_cep: destinationCep,
      option_id: shippingOption.id,
      label: shippingOption.label,
      price_cents: shippingOption.price_cents,
      eta_business_days: shippingOption.eta_business_days,
    },
    total_cents: totalCents,
    buyer: { email: buyer.email || null, name: buyer.name || null },
    tracking_code: null,
    shipping_status: null,
    created_at: new Date().toISOString(),
  };

  await createOrder(order);

  const base = siteUrl();
  const preference = {
    items: [
      ...lineItems.map(({ product, qty }) => ({
        id: product.id,
        title: product.name,
        quantity: qty,
        unit_price: product.price_cents / 100,
        currency_id: 'BRL',
      })),
      {
        id: `frete-${shippingOption.id}`,
        title: `Frete — ${shippingOption.label}`,
        quantity: 1,
        unit_price: shippingOption.price_cents / 100,
        currency_id: 'BRL',
      },
    ],
    payer: buyer.email ? { email: buyer.email, name: buyer.name || undefined } : undefined,
    external_reference: orderId,
    back_urls: {
      success: `${base}/checkout-status.html?status=success&order=${orderId}`,
      failure: `${base}/checkout-status.html?status=failure&order=${orderId}`,
      pending: `${base}/checkout-status.html?status=pending&order=${orderId}`,
    },
    auto_return: 'approved',
    notification_url: `${base}/.netlify/functions/mp-webhook`,
    statement_descriptor: 'ISOTOPXS',
  };

  try {
    const pref = await mercadopago.createPreference(preference);
    return json({
      order_id: orderId,
      init_point: pref.init_point || pref.sandbox_init_point,
      preference_id: pref.id,
    });
  } catch (err) {
    console.error('create-preference: Mercado Pago falhou:', err);
    await captureError(err, { functionName: 'create-preference', extra: { stage: 'mp-create-preference', orderId } });
    return json({ error: 'Falha ao criar preferência de pagamento' }, 502);
  }
});
