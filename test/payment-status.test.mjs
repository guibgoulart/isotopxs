import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapPaymentStatus, nextOrderStatus } from '../netlify/functions/mp-webhook.mjs';

test('mapPaymentStatus: approved vira paid', () => {
  assert.equal(mapPaymentStatus('approved'), 'paid');
});

test('mapPaymentStatus: rejected e cancelled viram failed', () => {
  assert.equal(mapPaymentStatus('rejected'), 'failed');
  assert.equal(mapPaymentStatus('cancelled'), 'failed');
});

test('mapPaymentStatus: qualquer outro status (in_process, pending, in_mediation, ...) vira pending', () => {
  for (const status of ['pending', 'in_process', 'in_mediation', 'refunded', 'algo-novo-que-a-mp-inventar']) {
    assert.equal(mapPaymentStatus(status), 'pending');
  }
});

test('nextOrderStatus: antes do pagamento, segue o status da Mercado Pago', () => {
  assert.equal(nextOrderStatus('pending', 'approved'), 'paid');
  assert.equal(nextOrderStatus('failed', 'approved'), 'paid');
  assert.equal(nextOrderStatus('pending', 'rejected'), 'failed');
  assert.equal(nextOrderStatus(undefined, 'approved'), 'paid');
});

test('nextOrderStatus: notificação atrasada/reenviada não desfaz o status marcado pela banda', () => {
  assert.equal(nextOrderStatus('shipped', 'approved'), 'shipped');
  assert.equal(nextOrderStatus('delivered', 'approved'), 'delivered');
  assert.equal(nextOrderStatus('cancelled', 'approved'), 'cancelled');
  assert.equal(nextOrderStatus('paid', 'refunded'), 'paid', 'reembolso aparece em payment_status, a banda decide o resto');
});
