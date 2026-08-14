import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapPaymentStatus } from '../netlify/functions/mp-webhook.mjs';

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
