import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAdminPatch } from '../netlify/functions/lib/order-admin.mjs';

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
