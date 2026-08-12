// Camada de frete — interface estável (quote / createShipment / track) que o resto do código
// usa sem saber se por trás tem um mock ou a Loggi de verdade.
//
// Hoje: sem LOGGI_INTEGRATION_CODE configurado, tudo roda no mock abaixo (determinístico e
// realista o bastante pra testar o carrinho: varia por peso e por distância aproximada entre
// os CEPs). Quando vocês tiverem um integration_code de homologação da Loggi, defina
// LOGGI_INTEGRATION_CODE no ambiente e preencha as três funções `*ViaLoggiApi` conforme a
// documentação oficial (staging.loggi.com) — elas hoje só lançam erro explicando isso, de
// propósito: não inventamos o formato do payload da Loggi sem a doc na mão.

function usingRealLoggi() {
  return Boolean(process.env.LOGGI_INTEGRATION_CODE);
}

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function regionDigit(cep) {
  const digits = onlyDigits(cep);
  return digits.length >= 1 ? Number(digits[0]) : 0;
}

function isValidCep(cep) {
  return onlyDigits(cep).length === 8;
}

// Sempre usar isto antes de guardar ou devolver um CEP em qualquer resposta — o valor que chega
// do cliente é texto livre não confiável; normalizar pra só dígitos evita guardar HTML/script
// dentro do pedido (mesmo sem uso disso em nenhum template hoje, é defesa em profundidade).
function normalizeCep(cep) {
  return onlyDigits(cep);
}

// sobretaxa de peso: primeiros 300g inclusos, depois cobra por faixa de 100g
function weightSurchargeCents(weightG) {
  const billableUnits = Math.max(0, Math.ceil(((Number(weightG) || 0) - 300) / 100));
  return billableUnits * 150;
}

function mockQuote({ originCep, destinationCep, weightG }) {
  const distanceFactor = 1 + Math.abs(regionDigit(originCep) - regionDigit(destinationCep)) * 0.18;
  const surcharge = weightSurchargeCents(weightG);
  const etaSpread = Math.abs(regionDigit(originCep) - regionDigit(destinationCep));

  const pontoCents = Math.round((1290 + surcharge) * distanceFactor);
  const expressCents = Math.round((2490 + surcharge * 1.4) * distanceFactor * 1.3);

  return [
    {
      id: 'loggi_ponto',
      carrier: 'loggi',
      service: 'ponto',
      label: 'Loggi Ponto — retirada em ponto de coleta',
      price_cents: pontoCents,
      eta_business_days: Math.min(etaSpread + 4, 10),
    },
    {
      id: 'loggi_express',
      carrier: 'loggi',
      service: 'express',
      label: 'Loggi Express — entrega no endereço',
      price_cents: expressCents,
      eta_business_days: Math.max(1, Math.min(etaSpread + 1, 4)),
    },
  ];
}

function mockCreateShipment(order) {
  const trackingCode = `MOCK-${order.id.replace(/-/g, '').slice(0, 10).toUpperCase()}`;
  return {
    trackingCode,
    trackingUrl: null,
    carrier: 'loggi-mock',
    status: 'label_created',
  };
}

function mockTrack(trackingCode) {
  return {
    trackingCode,
    status: 'label_created',
    events: [
      {
        status: 'label_created',
        description: 'Etiqueta gerada (rastreio simulado — mock local, não é a Loggi de verdade)',
        at: new Date().toISOString(),
      },
    ],
  };
}

function notImplementedError(fn) {
  const base = process.env.LOGGI_API_BASE || 'https://staging.loggi.com';
  return new Error(
    `shipping.${fn}: LOGGI_INTEGRATION_CODE está definido (base ${base}), mas a chamada real à API ` +
      'de homologação da Loggi ainda não foi implementada aqui — o contrato exato do endpoint precisa ' +
      'vir da documentação oficial da Loggi para esse integration_code. Preencha esta função quando tiver ' +
      'acesso a ela, ou remova LOGGI_INTEGRATION_CODE do ambiente para continuar usando o mock.'
  );
}

async function quoteViaLoggiApi(/* { originCep, destinationCep, weightG, dimsCm } */) {
  throw notImplementedError('quote');
}

async function createShipmentViaLoggiApi(/* order */) {
  throw notImplementedError('createShipment');
}

async function trackViaLoggiApi(/* trackingCode */) {
  throw notImplementedError('track');
}

async function quote(params) {
  if (!isValidCep(params.destinationCep)) {
    throw new Error(`CEP de destino inválido: ${params.destinationCep}`);
  }
  return usingRealLoggi() ? quoteViaLoggiApi(params) : mockQuote(params);
}

async function createShipment(order) {
  return usingRealLoggi() ? createShipmentViaLoggiApi(order) : mockCreateShipment(order);
}

async function track(trackingCode) {
  return usingRealLoggi() ? trackViaLoggiApi(trackingCode) : mockTrack(trackingCode);
}

module.exports = { quote, createShipment, track, isValidCep, normalizeCep, usingRealLoggi };
