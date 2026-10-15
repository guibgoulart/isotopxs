import { test } from 'node:test';
import assert from 'node:assert/strict';
import { customerConfirmationEmail, bandNewOrderEmail } from '../netlify/functions/lib/notify-templates.mjs';

const pickupOrder = {
  id: 'abcdef12-0000-0000-0000-000000000000',
  items: [{ id: 'cd', name: 'CD Físico', qty: 1, unit_price_cents: 3500 }],
  total_cents: 3500,
  buyer: { name: 'Fulana', email: 'f@example.com', phone: '51999990000' },
  shipping: {
    label: 'Retirada em Porto Alegre (combinar com o Deo)', price_cents: 0, pickup: true, address: null,
    note: 'Grátis. Depois do pagamento, combina dia e lugar com o Deo pelo WhatsApp ou telefone (51) 98145-4073.',
  },
};

test('e-mails de pedido com retirada: contato do Deo pro cliente, sem endereço nem "a gente posta"', () => {
  const customer = customerConfirmationEmail(pickupOrder, 'https://isotopxs.com.br');
  for (const body of [customer.html, customer.text]) {
    assert.match(body, /98145-4073/);
    assert.doesNotMatch(body, /embala e posta/);
  }
  const band = bandNewOrderEmail(pickupOrder, 'https://isotopxs.com.br');
  for (const body of [band.html, band.text]) {
    assert.match(body, /Retirada em Porto Alegre/);
    assert.doesNotMatch(body, /Endereço de entrega/);
  }
});
