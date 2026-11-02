import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAdminPatch, shipmentCreatedEvent } from '../netlify/functions/lib/order-admin.mjs';

const paid = { id: 'x', status: 'paid', tracking_code: null };

test('buildAdminPatch: status válido passa, inválido vira erro', () => {
  assert.deepEqual(buildAdminPatch(paid, { status: 'delivered' }).patch, { status: 'delivered' });
  assert.match(buildAdminPatch(paid, { status: 'enviado-ontem' }).errors[0], /status inválido/);
});

test('buildAdminPatch: colocar rastreio num pedido pago marca como enviado', () => {
  const { patch, errors } = buildAdminPatch(paid, { status: 'paid', tracking_code: ' AA 123456789 BR ' });
  assert.deepEqual(errors, []);
  assert.equal(patch.tracking_code, 'AA123456789BR');
  assert.equal(patch.status, 'shipped');
});

test('buildAdminPatch: não força "enviado" se a banda escolheu outro status', () => {
  const { patch } = buildAdminPatch(paid, { status: 'cancelled', tracking_code: 'AA123' });
  assert.equal(patch.status, 'cancelled');
});

test('buildAdminPatch: link de rastreio só https', () => {
  assert.equal(buildAdminPatch(paid, { tracking_url: 'https://rastreio.example/AA1' }).patch.tracking_url, 'https://rastreio.example/AA1');
  for (const bad of ['javascript:alert(1)', 'http://rastreio.example', 'não é url']) {
    assert.match(buildAdminPatch(paid, { tracking_url: bad }).errors[0], /https/);
  }
  assert.equal(buildAdminPatch(paid, { tracking_url: '' }).patch.tracking_url, null);
});

test('buildAdminPatch: campos vazios viram null, notas mantêm quebra de linha', () => {
  const { patch } = buildAdminPatch(paid, { shipping_carrier: '  ', tracking_code: '', admin_notes: 'linha 1\nlinha 2\u0000' });
  assert.equal(patch.shipping_carrier, null);
  assert.equal(patch.tracking_code, null);
  assert.equal(patch.admin_notes, 'linha 1\nlinha 2');
});

test('buildAdminPatch: liberar claim presa', () => {
  const { patch } = buildAdminPatch(paid, { clear_shipping_claim: true });
  assert.deepEqual(patch, { shipping_claim: null, shipping_claim_at: null });
});

test('buildAdminPatch: corpo vazio ou só com campos desconhecidos é erro', () => {
  assert.deepEqual(buildAdminPatch(paid, {}).errors, ['nada pra atualizar']);
  assert.deepEqual(buildAdminPatch(paid, { buyer: { email: 'hack@example.com' }, total_cents: 1 }).errors, ['nada pra atualizar']);
});

const customer = {
  name: 'Fulana de Tal', email: 'Fulana@Example.com', phone: '(51) 99999-0000', cep: '90010-000',
  address: { street: 'Rua A', number: '10', complement: 'ap 2', district: 'Centro', city: 'Porto Alegre', state: 'rs' },
};

test('buildAdminPatch: corrige cliente e endereço sem perder o resto do frete', () => {
  const order = { ...paid, buyer: { name: 'X', email: 'x@x.com', phone: '51' }, shipping: { label: 'Loggi Ponto', price_cents: 1290, destination_cep: '01001000' } };
  const { patch, errors } = buildAdminPatch(order, { customer });
  assert.deepEqual(errors, []);
  assert.deepEqual(patch.buyer, { name: 'Fulana de Tal', email: 'fulana@example.com', phone: '51999990000' });
  assert.equal(patch.shipping.label, 'Loggi Ponto');
  assert.equal(patch.shipping.price_cents, 1290);
  assert.equal(patch.shipping.destination_cep, '90010000');
  assert.equal(patch.shipping.address.state, 'RS');
});

test('buildAdminPatch: dados do cliente incompletos não salvam nada', () => {
  const { patch, errors } = buildAdminPatch(paid, { customer: { ...customer, cep: '123', address: { ...customer.address, city: '' } } });
  assert.match(errors[0], /cidade.*CEP/);
  assert.equal(patch.buyer, undefined);
});

const paidOrder = { id: 'ord-1', status: 'paid', tracking_code: null, buyer: { email: 'fulana@example.com' } };

test('shipmentCreatedEvent: pedido pago que ganha rastreio vira shipment_created', () => {
  const after = { ...paidOrder, status: 'shipped', tracking_code: 'AA123456789BR', shipping_carrier: 'Correios' };
  assert.deepEqual(shipmentCreatedEvent(paidOrder, after), {
    distinctId: 'fulana@example.com',
    event: 'shipment_created',
    properties: {
      order_id: 'ord-1',
      tracking_code: 'AA123456789BR',
      carrier: 'Correios',
      shipping_status: null,
      order_status: 'shipped',
      source: 'admin',
    },
  });
});

test('shipmentCreatedEvent: sem e-mail do comprador usa o id do pedido', () => {
  const before = { ...paidOrder, buyer: null };
  assert.equal(shipmentCreatedEvent(before, { ...before, status: 'delivered' }).distinctId, 'ord-1');
});

test('shipmentCreatedEvent: uma vez por pedido', () => {
  const shipped = { ...paidOrder, status: 'shipped', tracking_code: 'AA1' };
  assert.equal(shipmentCreatedEvent(shipped, { ...shipped, tracking_code: 'AA2' }), null);
  assert.equal(shipmentCreatedEvent(shipped, { ...shipped, status: 'delivered' }), null);
  const reopened = { ...paidOrder, shipment_captured_at: '2026-11-01T00:00:00.000Z' };
  assert.equal(shipmentCreatedEvent(reopened, { ...reopened, status: 'shipped' }), null);
});

test('shipmentCreatedEvent: nada pra pedido que não foi enviado', () => {
  assert.equal(shipmentCreatedEvent(paidOrder, { ...paidOrder, admin_notes: 'oi' }), null);
  assert.equal(shipmentCreatedEvent(paidOrder, { ...paidOrder, status: 'cancelled', tracking_code: 'AA1' }), null);
});
