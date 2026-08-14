import { test } from 'node:test';
import assert from 'node:assert/strict';
import shippingPkg from '../netlify/functions/lib/shipping.js';

const { isValidCep, normalizeCep, quote, createShipment, usingRealLoggi } = shippingPkg;

test('isValidCep aceita só 8 dígitos, com ou sem formatação', () => {
  assert.equal(isValidCep('01310-930'), true);
  assert.equal(isValidCep('01310930'), true);
  assert.equal(isValidCep('123'), false);
  assert.equal(isValidCep(''), false);
  assert.equal(isValidCep(undefined), false);
});

test('normalizeCep remove tudo que não é dígito (defesa contra CEP com HTML/script)', () => {
  assert.equal(normalizeCep('01310-930'), '01310930');
  assert.equal(normalizeCep('<script>01310930'), '01310930');
});

test('sem LOGGI_INTEGRATION_CODE, usingRealLoggi é false e quote roda no mock', async () => {
  assert.equal(usingRealLoggi(), false);

  const options = await quote({ originCep: '01310930', destinationCep: '90000000', weightG: 500 });

  assert.equal(options.length, 2);
  for (const opt of options) {
    assert.ok(opt.price_cents > 0);
    assert.ok(opt.eta_business_days >= 1);
    assert.equal(opt.carrier, 'loggi');
  }
});

test('quote mock rejeita CEP de destino inválido', async () => {
  await assert.rejects(() => quote({ originCep: '01310930', destinationCep: '123', weightG: 100 }));
});

test('quote mock é determinístico para os mesmos parâmetros', async () => {
  const params = { originCep: '01310930', destinationCep: '90000000', weightG: 500 };
  const a = await quote(params);
  const b = await quote(params);
  assert.deepEqual(a, b);
});

test('quote mock cobra sobretaxa de peso acima de 300g', async () => {
  const params = (weightG) => ({ originCep: '01310930', destinationCep: '90000000', weightG });
  const light = await quote(params(100));
  const heavy = await quote(params(2000));
  assert.ok(heavy[0].price_cents > light[0].price_cents);
});

test('createShipment mock gera tracking code baseado no id do pedido', async () => {
  const shipment = await createShipment({ id: 'abc123-def456-0000' });
  assert.match(shipment.trackingCode, /^MOCK-[A-Z0-9]{10}$/);
  assert.equal(shipment.carrier, 'loggi-mock');
  assert.equal(shipment.status, 'label_created');
});
