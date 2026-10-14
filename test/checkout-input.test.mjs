import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBuyer } from '../netlify/functions/lib/checkout-input.mjs';

const valid = {
  name: '  Luiza   Schmidt ',
  email: 'Luiza@Example.com ',
  phone: '(51) 99999-0000',
  address: {
    street: 'Av. Ipiranga',
    number: '1000',
    complement: '',
    district: 'Azenha',
    city: 'Porto Alegre',
    state: 'rs',
  },
};

test('parseBuyer: normaliza um comprador válido', () => {
  const { buyer, address, errors } = parseBuyer(valid);
  assert.deepEqual(errors, []);
  assert.deepEqual(buyer, { name: 'Luiza Schmidt', email: 'luiza@example.com', phone: '51999990000' });
  assert.equal(address.state, 'RS');
  assert.equal(address.complement, '');
});

test('parseBuyer: lista tudo que falta, em português', () => {
  const { errors } = parseBuyer({});
  assert.deepEqual(errors, ['nome completo', 'e-mail válido', 'telefone com DDD', 'rua', 'número', 'bairro', 'cidade', 'UF']);
});

test('parseBuyer: rejeita UF inexistente e telefone sem DDD', () => {
  const { errors } = parseBuyer({ ...valid, phone: '99999-0000', address: { ...valid.address, state: 'XX' } });
  assert.deepEqual(errors, ['telefone com DDD', 'UF']);
});

test('parseBuyer: limita tamanho e remove caracteres de controle', () => {
  const { buyer, address } = parseBuyer({
    ...valid,
    name: `Nome\u0000com\nquebra ${'a'.repeat(500)}`,
    address: { ...valid.address, street: 'x'.repeat(1000) },
  });
  assert.ok(!/[\u0000-\u001f]/.test(buyer.name));
  assert.equal(buyer.name.length, 100);
  assert.equal(address.street.length, 120);
});

test('parseBuyer: entrada malformada não lança', () => {
  for (const input of [null, undefined, 'texto', 42, { address: 'texto' }]) {
    assert.ok(parseBuyer(input).errors.length > 0);
  }
});
