// Netlify Functions v2 (ESM, `export default`) — necessário para o Netlify Blobs receber
// contexto automaticamente tanto em produção quanto no `netlify dev` local (v1/CommonJS não
// recebe esse contexto injetado, nem em produção).
import catalogPkg from './lib/catalog.js';
import shippingPkg from './lib/shipping.js';
import { captureError, withErrorReporting } from './lib/sentry.mjs';

const { priceCartItems } = catalogPkg;
const shipping = shippingPkg;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

// Limite de requisições por IP — protege contra script batendo essa rota sem parar (cada chamada
// aciona uma function invocation, que conta no seu uso da Netlify). 20/min é folgado pra alguém
// testando CEPs diferentes de verdade, apertado pra um script.
export const config = {
  rateLimit: {
    action: 'block',
    windowLimit: 20,
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

  if (!shipping.isValidCep(payload.destinationCep)) {
    return json({ error: 'CEP de destino inválido (esperado 8 dígitos)' }, 400);
  }
  const destinationCep = shipping.normalizeCep(payload.destinationCep);

  try {
    const options = await shipping.quote({
      originCep: process.env.ORIGIN_CEP,
      destinationCep,
      weightG: totalWeightG,
    });

    return json({
      subtotal_cents: subtotalCents,
      weight_g: totalWeightG,
      destination_cep: destinationCep,
      options,
    });
  } catch (err) {
    console.error('shipping-quote falhou:', err);
    await captureError(err, { functionName: 'shipping-quote' });
    return json({ error: 'Falha ao cotar frete' }, 502);
  }
});
