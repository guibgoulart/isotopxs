import { test } from 'node:test';
import assert from 'node:assert/strict';
import catalogPkg from '../netlify/functions/lib/catalog.js';

const { priceCartItems, getProduct, lineItemName } = catalogPkg;

test('priceCartItems soma subtotal e peso de itens válidos', () => {
  const { lineItems, subtotalCents, totalWeightG, errors } = priceCartItems([
    { id: 'cd', qty: 3 },
    { id: 'camiseta', qty: 1, size: 'M' },
  ]);

  const cd = getProduct('cd');
  const camiseta = getProduct('camiseta');

  assert.equal(errors.length, 0);
  assert.equal(lineItems.length, 2);
  assert.equal(subtotalCents, cd.price_cents * 3 + camiseta.price_cents);
  assert.equal(totalWeightG, cd.weight_g * 3 + camiseta.weight_g);
});

test('priceCartItems ignora o preço mandado pelo cliente — só usa o do catálogo', () => {
  const { lineItems, subtotalCents } = priceCartItems([
    { id: 'cd', qty: 1, price_cents: 1 },
  ]);

  assert.equal(lineItems[0].product.price_cents, getProduct('cd').price_cents);
  assert.equal(subtotalCents, getProduct('cd').price_cents);
});

test('priceCartItems rejeita id de produto inexistente', () => {
  const { lineItems, errors } = priceCartItems([{ id: 'produto-que-nao-existe', qty: 1 }]);
  assert.equal(lineItems.length, 0);
  assert.equal(errors.length, 1);
});

test('priceCartItems rejeita quantidade zero, negativa ou acima do limite', () => {
  for (const qty of [0, -1, 21]) {
    const { lineItems, errors } = priceCartItems([{ id: 'cd', qty }]);
    assert.equal(lineItems.length, 0, `qty=${qty} deveria ser rejeitada`);
    assert.equal(errors.length, 1, `qty=${qty} deveria gerar 1 erro`);
  }
});

// Comportamento real (não necessariamente o ideal): Math.floor roda ANTES da validação, então
// qty fracionária não é rejeitada — é truncada silenciosamente. Sem risco financeiro (o preço é
// sempre calculado sobre a qty já truncada), mas documentado aqui pra não virar surpresa.
test('priceCartItems trunca quantidade fracionária em vez de rejeitar', () => {
  const { lineItems, errors, subtotalCents } = priceCartItems([{ id: 'cd', qty: 1.9 }]);
  assert.equal(errors.length, 0);
  assert.equal(lineItems[0].qty, 1);
  assert.equal(subtotalCents, getProduct('cd').price_cents * 1);
});

test('priceCartItems trata carrinho vazio ou malformado sem lançar', () => {
  assert.deepEqual(priceCartItems([]).lineItems, []);
  assert.deepEqual(priceCartItems(null).lineItems, []);
  assert.deepEqual(priceCartItems(undefined).lineItems, []);
});

test('produto desativado no catálogo (active: false) não entra no carrinho', () => {
  const { lineItems, errors } = priceCartItems([{ id: 'adesivo', qty: 1 }]);
  assert.equal(lineItems.length, 0);
  assert.equal(errors.length, 1);
});

test('camiseta exige tamanho do catálogo (P, M, G, GG); CD ignora tamanho', () => {
  for (const size of [undefined, '', 'XG', 'G1']) {
    const { lineItems, errors } = priceCartItems([{ id: 'camiseta', qty: 1, size }]);
    assert.equal(lineItems.length, 0, `size=${size} deveria ser recusado`);
    assert.match(errors[0], /Tamanho inválido/);
  }
  const ok = priceCartItems([{ id: 'camiseta', qty: 2, size: 'gg' }, { id: 'cd', qty: 1, size: 'M' }]);
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.lineItems[0].size, 'GG');
  assert.equal(ok.lineItems[1].size, null);
  assert.equal(lineItemName(ok.lineItems[0]), 'Camiseta ISOTOPXS (tamanho GG)');
  assert.equal(lineItemName(ok.lineItems[1]), getProduct('cd').name);
});
