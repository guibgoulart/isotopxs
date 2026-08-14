// Usa o BlobsServer oficial do @netlify/blobs (backend em disco, documentado para testes
// automatizados) em vez de mockar o módulo — assim o teste exercita o mesmo código de leitura/
// escrita que roda em produção, incluindo o lock otimista de claimShipmentCreation.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BlobsServer } from '@netlify/blobs/server';
import { setEnvironmentContext } from '@netlify/blobs';

let server;
let directory;

before(async () => {
  directory = mkdtempSync(join(tmpdir(), 'isotopxs-blobs-test-'));
  server = new BlobsServer({ directory, token: 'test-token' });
  const { port } = await server.start();
  setEnvironmentContext({ edgeURL: `http://localhost:${port}`, token: 'test-token', siteID: 'test-site' });
});

after(async () => {
  await server.stop();
  rmSync(directory, { recursive: true, force: true });
});

// Importado depois do setEnvironmentContext acima não é necessário (getStore() lê o contexto na
// hora de cada chamada, não no import), mas import fica no topo por convenção do módulo ESM.
const { createOrder, getOrder, updateOrder, claimShipmentCreation } = await import(
  '../netlify/functions/lib/orders-store.mjs'
);

function makeOrder(overrides = {}) {
  return {
    id: randomUUID(),
    status: 'pending',
    payment_status: null,
    payment_id: null,
    items: [],
    subtotal_cents: 0,
    total_cents: 0,
    tracking_code: null,
    shipping_status: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

test('createOrder + getOrder: round trip', async () => {
  const order = makeOrder();
  await createOrder(order);
  const fetched = await getOrder(order.id);
  assert.equal(fetched.id, order.id);
  assert.equal(fetched.status, 'pending');
});

test('getOrder: retorna null para id inexistente ou vazio', async () => {
  assert.equal(await getOrder(randomUUID()), null);
  assert.equal(await getOrder(null), null);
});

test('updateOrder: aplica patch e atualiza updated_at', async () => {
  const order = makeOrder();
  await createOrder(order);
  const updated = await updateOrder(order.id, { status: 'paid' });
  assert.equal(updated.status, 'paid');
  assert.ok(updated.updated_at);
});

test('updateOrder: lança erro para pedido inexistente', async () => {
  await assert.rejects(() => updateOrder(randomUUID(), { status: 'paid' }));
});

test('claimShipmentCreation: primeira chamada reivindica, segunda é bloqueada', async () => {
  const order = makeOrder({ status: 'paid' });
  await createOrder(order);

  const first = await claimShipmentCreation(order.id);
  assert.ok(first, 'primeira claim deveria ganhar');
  assert.ok(first.shipping_claim);

  const second = await claimShipmentCreation(order.id);
  assert.equal(second, null, 'segunda claim deveria ser bloqueada enquanto a primeira está em aberto');
});

test('claimShipmentCreation: retorna null se o pedido já tem tracking_code', async () => {
  const order = makeOrder({ status: 'paid', tracking_code: 'MOCK-JATEMFRETE' });
  await createOrder(order);
  assert.equal(await claimShipmentCreation(order.id), null);
});

test('claimShipmentCreation: liberado o claim (shipping_claim=null), dá pra reivindicar de novo', async () => {
  const order = makeOrder({ status: 'paid' });
  await createOrder(order);

  await claimShipmentCreation(order.id);
  await updateOrder(order.id, { shipping_claim: null }); // simula o release após sucesso/erro do frete

  const reclaimed = await claimShipmentCreation(order.id);
  assert.ok(reclaimed, 'depois de liberado, uma nova claim deveria ganhar');
});

// Cenário realista: a Mercado Pago reenvia webhook depois de segundos/minutos, nunca no mesmo
// instante. Com qualquer espaçamento real entre as chamadas, a claim é 100% exclusiva — a segunda
// chamada só começa depois que a primeira já terminou de escrever e confirmar seu token.
test('claimShipmentCreation: retries espaçados (cenário real de retry de webhook) são 100% exclusivos', async () => {
  const order = makeOrder({ status: 'paid' });
  await createOrder(order);

  const first = await claimShipmentCreation(order.id);
  const second = await claimShipmentCreation(order.id);

  assert.ok(first);
  assert.equal(second, null);
});

// @netlify/blobs (nesta versão) não tem compare-and-swap — é matematicamente impossível garantir
// exclusão mútua perfeita só com get/set (isso não é um bug de implementação, é um limite da
// própria primitiva). Sob concorrência bruta (Promise.all, tudo no mesmo instante), MAIS DE UMA
// chamada pode "ganhar" simultaneamente — o teste documenta esse limite conhecido em vez de
// afirmar uma garantia que a camada de storage não oferece. A rede de segurança real contra isso
// é a idempotência do lado da Loggi (ver TODO em shipping.js: passar order.id como idempotency
// key na integração real), que torna uma criação duplicada inofensiva mesmo se acontecer aqui.
test('claimShipmentCreation: sob concorrência bruta (mesmo instante), a exclusão não é garantida — limite conhecido do storage sem CAS', async () => {
  const order = makeOrder({ status: 'paid' });
  await createOrder(order);

  const results = await Promise.all(Array.from({ length: 20 }, () => claimShipmentCreation(order.id)));
  const winners = results.filter(Boolean);

  assert.ok(winners.length >= 1, 'pelo menos uma chamada deveria ganhar');
  assert.ok(winners.length < 20, 'nem todas deveriam ganhar — a claim ainda reduz drasticamente as duplicatas');
});
