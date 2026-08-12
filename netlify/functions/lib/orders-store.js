// Persistência dos pedidos via Netlify Blobs — um KV store gerenciado pela própria Netlify,
// sem precisar de banco externo. Funciona automaticamente dentro de `netlify dev` (emulado em
// disco) e em produção (por site), sem configuração extra.
const { getStore } = require('@netlify/blobs');

function store() {
  return getStore('orders');
}

async function createOrder(order) {
  await store().setJSON(order.id, order);
  return order;
}

async function getOrder(id) {
  if (!id) return null;
  return store().get(id, { type: 'json' });
}

async function updateOrder(id, patch) {
  const current = await getOrder(id);
  if (!current) {
    throw new Error(`Pedido não encontrado: ${id}`);
  }
  const updated = { ...current, ...patch, updated_at: new Date().toISOString() };
  await store().setJSON(id, updated);
  return updated;
}

module.exports = { createOrder, getOrder, updateOrder };
