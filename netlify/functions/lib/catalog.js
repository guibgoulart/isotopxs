// Catálogo é sempre lido do servidor — o front-end nunca manda preço, só id + quantidade.
// require() de JSON é inlinado pelo esbuild no bundle da function, então não precisa de
// `included_files` no netlify.toml nem de leitura via fs em runtime.
const { products } = require('../../../data/products.json');

const MAX_QTY_PER_ITEM = 20;

function getProduct(id) {
  return products.find((p) => p.id === id && p.active !== false) || null;
}

// items: [{id, qty}] — vindo do cliente, portanto não confiável.
// Retorna { lineItems, subtotalCents, totalWeightG, errors }.
function priceCartItems(items) {
  const lineItems = [];
  const errors = [];
  let subtotalCents = 0;
  let totalWeightG = 0;

  for (const raw of Array.isArray(items) ? items : []) {
    const product = getProduct(raw && raw.id);
    if (!product) {
      errors.push(`Produto inválido: ${raw && raw.id}`);
      continue;
    }
    const qty = Math.floor(Number(raw.qty));
    if (!Number.isFinite(qty) || qty < 1 || qty > MAX_QTY_PER_ITEM) {
      errors.push(`Quantidade inválida para ${product.id}`);
      continue;
    }
    subtotalCents += product.price_cents * qty;
    totalWeightG += product.weight_g * qty;
    lineItems.push({ product, qty });
  }

  return { lineItems, subtotalCents, totalWeightG, errors };
}

module.exports = { products, getProduct, priceCartItems };
