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

test('com MELHOR_ENVIO_TOKEN, cota no Melhor Envio, filtra serviços e soma o prazo de postagem', async (t) => {
  const realFetch = globalThis.fetch;
  let sent;
  globalThis.fetch = async (url, init) => {
    sent = { url, init, body: JSON.parse(init.body) };
    return new Response(JSON.stringify([
      { id: 1, name: 'PAC', price: '22.17', custom_price: '22.17', delivery_time: 5, custom_delivery_time: 5, company: { name: 'Correios' } },
      { id: 2, name: 'SEDEX', price: '34.71', custom_price: '34.71', delivery_time: 2, custom_delivery_time: 2, company: { name: 'Correios' } },
      { id: 17, name: 'Mini Envios', error: 'Dimensões do objeto ultrapassam o limite.', company: { name: 'Correios' } },
      { id: 3, name: '.Package', price: '20.01', custom_price: '20.01', delivery_time: 4, custom_delivery_time: 4, company: { name: 'Jadlog' } },
      { id: 34, name: 'Loggi Ponto', price: '19.70', custom_price: '19.70', delivery_time: 6, custom_delivery_time: 6, company: { name: 'Loggi' } },
    ]), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  process.env.MELHOR_ENVIO_TOKEN = 'token-de-teste';
  process.env.MELHOR_ENVIO_SERVICES = '1,2,17,34';
  t.after(() => {
    globalThis.fetch = realFetch;
    delete process.env.MELHOR_ENVIO_TOKEN;
    delete process.env.MELHOR_ENVIO_SERVICES;
  });

  const cd = { id: 'cd', price_cents: 3500, weight_g: 100, dims_cm: { length: 14, width: 12, height: 1 } };
  const options = await quote({ originCep: '91910-001', destinationCep: '01310-100', weightG: 200, items: [{ product: cd, qty: 2 }] });

  assert.equal(sent.url, 'https://melhorenvio.com.br/api/v2/me/shipment/calculate');
  assert.equal(sent.init.headers.Authorization, 'Bearer token-de-teste');
  assert.deepEqual(sent.body.from, { postal_code: '91910001' });
  assert.deepEqual(sent.body.products[0], { id: 'cd', width: 12, height: 1, length: 14, weight: 0.1, insurance_value: 35, quantity: 2 });
  assert.deepEqual(options, [
    { id: 'me_34', carrier: 'loggi', service: 'Loggi Ponto', label: 'Loggi Ponto', price_cents: 1970, eta_business_days: 8 },
    { id: 'me_1', carrier: 'correios', service: 'PAC', label: 'Correios PAC', price_cents: 2217, eta_business_days: 7 },
    { id: 'me_2', carrier: 'correios', service: 'SEDEX', label: 'Correios SEDEX', price_cents: 3471, eta_business_days: 4 },
  ]);
});

test('Melhor Envio fora do ar vira erro (não cai no mock com preço inventado)', async (t) => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('Unauthenticated.', { status: 401 });
  process.env.MELHOR_ENVIO_TOKEN = 'token-vencido';
  t.after(() => {
    globalThis.fetch = realFetch;
    delete process.env.MELHOR_ENVIO_TOKEN;
  });
  await assert.rejects(() => quote({ originCep: '91910001', destinationCep: '01310100', weightG: 100, items: [] }), /Melhor Envio respondeu 401/);
});
