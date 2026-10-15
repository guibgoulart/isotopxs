// Valida e monta o patch que o painel manda pra um pedido. Função pura: recebe o pedido atual e o
// corpo da requisição, devolve { patch, errors } — quem chama só aplica se errors estiver vazio.
import { ORDER_STATUSES } from './orders-store.mjs';
import { parseBuyer } from './checkout-input.mjs';

function oneLine(value, max) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function buildAdminPatch(order, body) {
  const input = body && typeof body === 'object' ? body : {};
  const patch = {};
  const errors = [];

  if ('status' in input) {
    if (ORDER_STATUSES.includes(input.status)) patch.status = input.status;
    else errors.push(`status inválido: ${oneLine(input.status, 30)}`);
  }

  if ('tracking_code' in input) {
    patch.tracking_code = oneLine(input.tracking_code, 64).replace(/\s/g, '') || null;
  }

  if ('tracking_url' in input) {
    const raw = oneLine(input.tracking_url, 500);
    if (!raw) {
      patch.tracking_url = null;
    } else {
      let url = null;
      try {
        url = new URL(raw);
      } catch {
        url = null;
      }
      // Só https: esse link vai parar num e-mail pro cliente e num href do painel.
      if (url && url.protocol === 'https:') patch.tracking_url = url.toString();
      else errors.push('link de rastreio precisa ser um endereço https://');
    }
  }

  if ('shipping_carrier' in input) {
    patch.shipping_carrier = oneLine(input.shipping_carrier, 40) || null;
  }

  if ('admin_notes' in input) {
    patch.admin_notes = String(input.admin_notes ?? '')
      .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ')
      .trim()
      .slice(0, 2000);
  }

  // Corrigir nome/contato/endereço (cliente escreveu errado, mudou de endereço…). Mesmas regras do
  // formulário da loja; o frete já pago não é recalculado se o CEP mudar.
  if ('customer' in input) {
    const customer = input.customer && typeof input.customer === 'object' ? input.customer : {};
    const { buyer, address, errors: missing } = parseBuyer(customer);
    const cep = String(customer.cep ?? '').replace(/\D/g, '');
    if (cep.length !== 8) missing.push('CEP');
    if (missing.length) {
      errors.push(`faltou preencher: ${missing.join(', ')}`);
    } else {
      patch.buyer = { ...(order.buyer || {}), ...buyer };
      patch.shipping = { ...(order.shipping || {}), address, destination_cep: cep };
    }
  }

  if (input.clear_shipping_claim === true) {
    patch.shipping_claim = null;
    patch.shipping_claim_at = null;
  }

  // Colocou código de rastreio num pedido que estava "pago — a enviar"? Então ele foi enviado.
  const nextStatus = patch.status ?? order.status;
  const nextTracking = 'tracking_code' in patch ? patch.tracking_code : order.tracking_code;
  if (nextTracking && nextStatus === 'paid') patch.status = 'shipped';

  if (!errors.length && Object.keys(patch).length === 0) errors.push('nada pra atualizar');
  return { patch, errors };
}
