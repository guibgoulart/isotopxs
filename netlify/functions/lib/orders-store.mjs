// Persistência dos pedidos via Netlify Blobs — um KV store gerenciado pela própria Netlify,
// sem precisar de banco externo. Funciona automaticamente dentro de `netlify dev` (emulado em
// disco) e em produção (por site), sem configuração extra.
//
// ESM (não CJS): @netlify/blobs é um pacote ESM-nativo. Um require() vindo de um arquivo .js
// (CJS) fazia o bundler das Functions deixar a dependência como "external" em vez de embutí-la
// no bundle, e a function quebrava em produção com "Cannot find module '@netlify/blobs'".
import { randomUUID } from 'node:crypto';
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

// @netlify/blobs (nesta versão) não tem escrita condicional (compare-and-swap), então não dá pra
// travar de verdade. Isso aproxima um lock otimista: escreve um token só nosso e relê — como o
// Blobs é last-write-wins, se duas chamadas colidirem, só quem "sobrou" por último vê seu próprio
// token de volta. Reduz a janela de corrida de "duração da chamada à transportadora" (segundos)
// para "um round-trip de leitura+escrita" (dezenas de ms) — não é garantia absoluta, mas cobre o
// caso real: retries de webhook da Mercado Pago chegando segundos ou minutos um do outro. Usado
// por mp-webhook para não criar frete duplicado quando a mesma notificação de pagamento chega
// mais de uma vez (a Mercado Pago reenvia webhooks que não respondem rápido o suficiente).
export async function claimShipmentCreation(id) {
  const before = await getOrder(id);
  if (!before || before.tracking_code || before.shipping_claim) return null;

  const token = randomUUID();
  await updateOrder(id, { shipping_claim: token });

  const after = await getOrder(id);
  return after && after.shipping_claim === token ? after : null;
}
