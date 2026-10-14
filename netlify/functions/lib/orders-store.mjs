// Persistência dos pedidos via Netlify Blobs — um KV store gerenciado pela própria Netlify,
// sem precisar de banco externo. Funciona automaticamente dentro de `netlify dev` (emulado em
// disco) e em produção (por site), sem configuração extra.
//
// ESM (não CJS): @netlify/blobs é um pacote ESM-nativo. Um require() vindo de um arquivo .js
// (CJS) fazia o bundler das Functions deixar a dependência como "external" em vez de embutí-la
// no bundle, e a function quebrava em produção com "Cannot find module '@netlify/blobs'".
import { randomUUID } from 'node:crypto';
import { withStore as withNamedStore } from './blob-store.mjs';

// Status de cumprimento do pedido. `payment_status` (o status cru da Mercado Pago) fica num campo
// separado — este aqui é o que a banda acompanha e edita no painel.
export const ORDER_STATUSES = ['pending', 'paid', 'shipped', 'delivered', 'failed', 'cancelled'];

// Uma claim de criação de envio que ficou presa (function morreu entre reivindicar e liberar) deixa
// de bloquear depois disso — senão o pedido nunca mais ganharia envio automático.
export const SHIPPING_CLAIM_TTL_MS = 10 * 60 * 1000;

// Leitura strong (ver blob-store.mjs) — sem ela a claim abaixo nunca via o próprio token na
// releitura, e todo pedido pago ficava com shipping_claim preso.
function withStore(fn) {
  return withNamedStore('orders', fn);
}

export async function createOrder(order) {
  await withStore((s) => s.setJSON(order.id, order));
  return order;
}

export async function getOrder(id) {
  if (!id) return null;
  return withStore((s) => s.get(id, { type: 'json' }));
}

export async function updateOrder(id, patch) {
  const current = await getOrder(id);
  if (!current) {
    throw new Error(`Pedido não encontrado: ${id}`);
  }
  const updated = { ...current, ...patch, updated_at: new Date().toISOString() };
  await withStore((s) => s.setJSON(id, updated));
  return updated;
}

// Todos os pedidos, mais recentes primeiro. Busca tudo e ordena em memória — pro volume de uma loja
// de banda (dezenas/centenas de pedidos) isso é simples e rápido o bastante.
export async function listOrders() {
  const { blobs } = await withStore((s) => s.list());
  const orders = [];
  for (let i = 0; i < blobs.length; i += 20) {
    const batch = await Promise.all(blobs.slice(i, i + 20).map((b) => getOrder(b.key)));
    orders.push(...batch.filter(Boolean));
  }
  orders.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  return orders;
}

// @netlify/blobs (nesta versão) não tem escrita condicional (compare-and-swap), então não dá pra
// travar de verdade. Isso aproxima um lock otimista: escreve um token só nosso e relê — como o
// Blobs é last-write-wins, se duas chamadas colidirem, só quem "sobrou" por último vê seu próprio
// token de volta. Reduz a janela de corrida pra "um round-trip de leitura+escrita" (dezenas de ms)
// — não é garantia absoluta, mas cobre o caso real: a Mercado Pago reenviando a mesma notificação
// segundos ou minutos depois.
async function claim(id, canClaim, tokenField, extraPatch = {}) {
  const before = await getOrder(id);
  if (!before || !canClaim(before)) return null;

  const token = randomUUID();
  await updateOrder(id, { [tokenField]: token, ...extraPatch });

  const after = await getOrder(id);
  return after && after[tokenField] === token ? after : null;
}

function claimIsLive(order, now) {
  if (!order.shipping_claim) return false;
  const at = Date.parse(order.shipping_claim_at || '');
  // Claim sem timestamp é de antes do TTL existir — considera vencida.
  return Number.isFinite(at) && now - at < SHIPPING_CLAIM_TTL_MS;
}

// Usado por mp-webhook pra não criar frete duplicado quando a mesma notificação de pagamento chega
// mais de uma vez.
export async function claimShipmentCreation(id, now = Date.now()) {
  return claim(
    id,
    (order) => !order.tracking_code && !claimIsLive(order, now),
    'shipping_claim',
    { shipping_claim_at: new Date(now).toISOString() }
  );
}

// Garante que os avisos de "pedido pago" (e-mail pro cliente, e-mail/WhatsApp pra banda) saiam uma
// vez só por pedido, mesmo com a Mercado Pago mandando a notificação de pagamento repetida. Diferente
// da claim de envio, essa nunca é liberada — avisar duas vezes é pior do que (raramente) não avisar.
export async function claimPaidNotification(id) {
  return claim(id, (order) => !order.paid_notification_claim, 'paid_notification_claim', {
    paid_notified_at: new Date().toISOString(),
  });
}
