import { test } from 'node:test';
import assert from 'node:assert/strict';
import catalogPkg from '../netlify/functions/lib/catalog.js';

const { priceCartItems, getProduct } = catalogPkg;

test('priceCartItems soma subtotal e peso de itens válidos', () => {
  const { lineItems, subtotalCents, totalWeightG, errors } = priceCartItems([
    { id: 'adesivo', qty: 3 },
    { id: 'camiseta', qty: 1 },
  ]);

  const adesivo = getProduct('adesivo');
  const camiseta = getProduct('camiseta');

  assert.equal(errors.length, 0);
  assert.equal(lineItems.length, 2);
  assert.equal(subtotalCents, adesivo.price_cents * 3 + camiseta.price_cents);
  assert.equal(totalWeightG, adesivo.weight_g * 3 + camiseta.weight_g);
});

test('priceCartItems ignora o preço mandado pelo cliente — só usa o do catálogo', () => {
  const { lineItems, subtotalCents } = priceCartItems([
    { id: 'adesivo', qty: 1, price_cents: 1 },
  ]);

  assert.equal(lineItems[0].product.price_cents, getProduct('adesivo').price_cents);
  assert.equal(subtotalCents, getProduct('adesivo').price_cents);
});

test('priceCartItems rejeita id de produto inexistente', () => {
  const { lineItems, errors } = priceCartItems([{ id: 'produto-que-nao-existe', qty: 1 }]);
  assert.equal(lineItems.length, 0);
  assert.equal(errors.length, 1);
});

test('priceCartItems rejeita quantidade zero, negativa ou acima do limite', () => {
  for (const qty of [0, -1, 21]) {
    const { lineItems, errors } = priceCartItems([{ id: 'adesivo', qty }]);
    assert.equal(lineItems.length, 0, `qty=${qty} deveria ser rejeitada`);
    assert.equal(errors.length, 1, `qty=${qty} deveria gerar 1 erro`);
  }
});

// Comportamento real (não necessariamente o ideal): Math.floor roda ANTES da validação, então
// qty fracionária não é rejeitada — é truncada silenciosamente. Sem risco financeiro (o preço é
// sempre calculado sobre a qty já truncada), mas documentado aqui pra não virar surpresa.
test('priceCartItems trunca quantidade fracionária em vez de rejeitar', () => {
  const { lineItems, errors, subtotalCents } = priceCartItems([{ id: 'adesivo', qty: 1.9 }]);
  assert.equal(errors.length, 0);
  assert.equal(lineItems[0].qty, 1);
  assert.equal(subtotalCents, getProduct('adesivo').price_cents * 1);
});

test('priceCartItems trata carrinho vazio ou malformado sem lançar', () => {
  assert.deepEqual(priceCartItems([]).lineItems, []);
  assert.deepEqual(priceCartItems(null).lineItems, []);
  assert.deepEqual(priceCartItems(undefined).lineItems, []);
});
