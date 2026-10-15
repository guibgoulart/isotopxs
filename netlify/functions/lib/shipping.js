// Camada de frete — interface estável (quote / createShipment / track) que o resto do código
// usa sem saber o que tem por trás.
//
// Cotação: com MELHOR_ENVIO_TOKEN configurado, o preço e o prazo vêm do Melhor Envio (valores
// reais que a banda paga pela etiqueta comprada lá). A etiqueta em si a banda compra no painel do
// Melhor Envio e posta na agência — createShipment/track não passam por lá (envio manual).
//
// Sem MELHOR_ENVIO_TOKEN nem LOGGI_INTEGRATION_CODE configurados, tudo roda no mock abaixo (determinístico e
// realista o bastante pra testar o carrinho: varia por peso e por distância aproximada entre
// os CEPs). Quando vocês tiverem um integration_code de homologação da Loggi, defina
// LOGGI_INTEGRATION_CODE no ambiente e preencha as três funções `*ViaLoggiApi` conforme a
// documentação oficial (staging.loggi.com) — elas hoje só lançam erro explicando isso, de
// propósito: não inventamos o formato do payload da Loggi sem a doc na mão.

function usingRealLoggi() {
  return Boolean(process.env.LOGGI_INTEGRATION_CODE);
}

function usingMelhorEnvio() {
  return Boolean(process.env.MELHOR_ENVIO_TOKEN);
}

// Retirada combinada com a banda em Porto Alegre, sem custo. Sempre oferecida, em qualquer CEP (o
// rótulo deixa claro que é em Porto Alegre). O pedido não exige endereço quando é retirada.
const PICKUP_PHONE = '(51) 98145-4073';
const PICKUP_OPTION = {
  id: 'retirada_poa',
  carrier: 'retirada',
  service: 'Retirada',
  label: 'Retirada em Porto Alegre (combinar com o Deo)',
  price_cents: 0,
  eta_business_days: null,
  pickup: true,
  note: `Grátis. Depois do pagamento, combina dia e lugar com o Deo pelo WhatsApp ou telefone ${PICKUP_PHONE}.`,
};

function isPickup(optionId) {
  return optionId === PICKUP_OPTION.id;
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

// TODO ao implementar de verdade: mande order.id como idempotency key / external reference pra
// Loggi (se a API dela suportar, o que é comum nesse tipo de integração). mp-webhook.mjs tenta
// evitar chamar isso duas vezes pro mesmo pedido (orders-store.claimShipmentCreation), mas essa
// trava não é uma exclusão mútua garantida (ver comentário em orders-store.mjs) — a rede de
// segurança de verdade contra frete duplicado é a própria Loggi deduplicar pelo external
// reference, não a nossa trava otimista.
async function createShipmentViaLoggiApi(/* order */) {
  throw notImplementedError('createShipment');
}

async function trackViaLoggiApi(/* trackingCode */) {
  throw notImplementedError('track');
}

// IDs de serviço do Melhor Envio (GET /api/v2/me/shipment/services). Padrão: só Correios — PAC,
// SEDEX e Mini Envios —, que dá pra postar em qualquer agência. Pra oferecer outras (Jadlog, Loggi,
// J&T…), liste os IDs em MELHOR_ENVIO_SERVICES, separados por vírgula.
const DEFAULT_MELHOR_ENVIO_SERVICES = '1,2,17';
// Dias úteis entre o pagamento e a banda postar, somados ao prazo da transportadora.
const DEFAULT_HANDLING_DAYS = 2;

function handlingDays() {
  const days = Number(process.env.SHIPPING_HANDLING_DAYS);
  return Number.isInteger(days) && days >= 0 ? days : DEFAULT_HANDLING_DAYS;
}

// items: lineItems de catalog.priceCartItems ({ product, qty }) — peso/medidas/preço vêm do catálogo.
async function quoteViaMelhorEnvio({ originCep, destinationCep, items }) {
  if (!isValidCep(originCep)) {
    throw new Error('ORIGIN_CEP não configurado (CEP de onde a banda posta, 8 dígitos)');
  }
  const products = (items || []).map(({ product, qty }) => ({
    id: product.id,
    width: product.dims_cm.width,
    height: product.dims_cm.height,
    length: product.dims_cm.length,
    weight: product.weight_g / 1000,
    insurance_value: product.price_cents / 100,
    quantity: qty,
  }));

  const base = process.env.MELHOR_ENVIO_API_BASE || 'https://melhorenvio.com.br';
  const res = await fetch(`${base}/api/v2/me/shipment/calculate`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.MELHOR_ENVIO_TOKEN}`,
      'User-Agent': 'ISOTOPXS loja (isotopxs.com.br)',
    },
    body: JSON.stringify({
      from: { postal_code: normalizeCep(originCep) },
      to: { postal_code: normalizeCep(destinationCep) },
      products,
      options: { receipt: false, own_hand: false },
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 300);
    throw new Error(`Melhor Envio respondeu ${res.status}: ${detail}`);
  }

  const services = await res.json();
  const allowed = new Set(
    String(process.env.MELHOR_ENVIO_SERVICES || DEFAULT_MELHOR_ENVIO_SERVICES).split(',').map((id) => id.trim()).filter(Boolean)
  );
  const extraDays = handlingDays();

  return (Array.isArray(services) ? services : [])
    .filter((svc) => svc && !svc.error && allowed.has(String(svc.id)))
    .map((svc) => {
      const company = (svc.company && svc.company.name) || '';
      const days = Number(svc.custom_delivery_time ?? svc.delivery_time) || 0;
      return {
        id: `me_${svc.id}`,
        carrier: company.toLowerCase(),
        service: svc.name,
        // "Loggi Ponto" já vem com o nome da empresa — não vira "Loggi Loggi Ponto".
        label: String(svc.name).toLowerCase().startsWith(company.toLowerCase()) ? svc.name : `${company} ${svc.name}`.trim(),
        price_cents: Math.round(Number(svc.custom_price ?? svc.price) * 100),
        eta_business_days: days + extraDays,
      };
    })
    .filter((opt) => opt.price_cents > 0)
    .sort((a, b) => a.price_cents - b.price_cents);
}

async function quote(params) {
  if (!isValidCep(params.destinationCep)) {
    throw new Error(`CEP de destino inválido: ${params.destinationCep}`);
  }
  let options;
  if (usingMelhorEnvio()) options = await quoteViaMelhorEnvio(params);
  else options = usingRealLoggi() ? await quoteViaLoggiApi(params) : mockQuote(params);
  return [...options, { ...PICKUP_OPTION }];
}

async function createShipment(order) {
  return usingRealLoggi() ? createShipmentViaLoggiApi(order) : mockCreateShipment(order);
}

async function track(trackingCode) {
  return usingRealLoggi() ? trackViaLoggiApi(trackingCode) : mockTrack(trackingCode);
}

module.exports = { quote, createShipment, track, isValidCep, normalizeCep, usingRealLoggi, usingMelhorEnvio, isPickup };
