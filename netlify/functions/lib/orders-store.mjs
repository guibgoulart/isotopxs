// Persistência dos pedidos via Netlify Blobs — um KV store gerenciado pela própria Netlify,
// sem precisar de banco externo. Funciona automaticamente dentro de `netlify dev` (emulado em
// disco) e em produção (por site), sem configuração extra.
//
// ESM (não CJS): @netlify/blobs é um pacote ESM-nativo. Um require() vindo de um arquivo .js
// (CJS) fazia o bundler das Functions deixar a dependência como "external" em vez de embutí-la
// no bundle, e a function quebrava em produção com "Cannot find module '@netlify/blobs'".
import { getStore } from '@netlify/blobs';

function store() {
  return getStore('orders');
}

export async function createOrder(order) {
  await store().setJSON(order.id, order);
  return order;
}

export async function getOrder(id) {
  if (!id) return null;
  return store().get(id, { type: 'json' });
}

export async function updateOrder(id, patch) {
  const current = await getOrder(id);
  if (!current) {
    throw new Error(`Pedido não encontrado: ${id}`);
  }
  const updated = { ...current, ...patch, updated_at: new Date().toISOString() };
  await store().setJSON(id, updated);
  return updated;
}
