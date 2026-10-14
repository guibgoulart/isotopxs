// Validação dos dados do comprador que chegam do formulário da loja. Tudo aqui é texto livre não
// confiável: normaliza, limita tamanho e devolve uma lista de erros legíveis pro cliente.

const UFS = new Set([
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
]);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clean(value, max) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

export function parseBuyer(raw) {
  const input = raw && typeof raw === 'object' ? raw : {};
  const address = input.address && typeof input.address === 'object' ? input.address : {};
  const errors = [];

  const name = clean(input.name, 100);
  const email = clean(input.email, 254).toLowerCase();
  const phone = String(input.phone ?? '').replace(/\D/g, '').slice(0, 13);

  const parsedAddress = {
    street: clean(address.street, 120),
    number: clean(address.number, 20),
    complement: clean(address.complement, 60),
    district: clean(address.district, 60),
    city: clean(address.city, 60),
    state: clean(address.state, 2).toUpperCase(),
  };

  if (name.length < 2) errors.push('nome completo');
  if (!EMAIL_RE.test(email)) errors.push('e-mail válido');
  if (phone.length < 10) errors.push('telefone com DDD');
  if (!parsedAddress.street) errors.push('rua');
  if (!parsedAddress.number) errors.push('número');
  if (!parsedAddress.district) errors.push('bairro');
  if (!parsedAddress.city) errors.push('cidade');
  if (!UFS.has(parsedAddress.state)) errors.push('UF');

  return {
    buyer: { name, email, phone },
    address: parsedAddress,
    errors,
  };
}
