// Conteúdo dos avisos (e-mail pro cliente, e-mail e WhatsApp pra banda). Funções puras: recebem o
// pedido e devolvem { subject, html, text } — fácil de testar sem mandar nada de verdade.
// HTML de e-mail não carrega CSS externo nem fonte web: tudo inline, tabela pra layout, cores do
// site (main.css) e fontes de sistema.

const C = { black: '#060606', white: '#f4f1ea', red: '#ff1633', line: '#d9d5cc', muted: '#6b6862' };

export function formatBRL(cents) {
  return (Number(cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function shortId(id) {
  return String(id || '').slice(0, 8).toUpperCase();
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function hello(order) {
  const first = (((order.buyer && order.buyer.name) || '').split(' ')[0] || '').trim();
  return first ? `Oi, ${first}!` : 'Oi!';
}

function formatCep(cep) {
  const d = String(cep || '').replace(/\D/g, '');
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

export function addressLines(order) {
  const shipping = order.shipping || {};
  const a = shipping.address;
  const cep = formatCep(shipping.destination_cep);
  if (!a) return cep ? [`CEP ${cep}`] : [];
  return [
    `${a.street}, ${a.number}${a.complement ? `, ${a.complement}` : ''}`,
    `${a.district}, ${a.city}/${a.state}`,
    `CEP ${cep}`,
  ];
}

function orderUrl(order, base) {
  return `${base}/checkout-status.html?order=${encodeURIComponent(order.id)}`;
}

function adminUrl(order, base) {
  return `${base}/admin.html#pedido=${encodeURIComponent(order.id)}`;
}

function itemsText(order) {
  const lines = (order.items || []).map((it) => `${it.qty}x ${it.name}: ${formatBRL(it.unit_price_cents * it.qty)}`);
  if (order.shipping) lines.push(`Frete - ${order.shipping.label}: ${formatBRL(order.shipping.price_cents)}`);
  lines.push(`Total: ${formatBRL(order.total_cents)}`);
  return lines.join('\n');
}

function itemsTable(order) {
  const cell = `padding:8px 0;border-bottom:1px solid ${C.line};`;
  const rows = (order.items || []).map((it) => `
    <tr><td style="${cell}">${esc(it.qty)}× ${esc(it.name)}</td>
    <td align="right" style="${cell}white-space:nowrap;">${formatBRL(it.unit_price_cents * it.qty)}</td></tr>`);
  if (order.shipping) {
    rows.push(`
    <tr><td style="${cell}">Frete - ${esc(order.shipping.label)}</td>
    <td align="right" style="${cell}white-space:nowrap;">${formatBRL(order.shipping.price_cents)}</td></tr>`);
  }
  rows.push(`
    <tr><td style="padding:12px 0 0;font-weight:bold;">Total</td>
    <td align="right" style="padding:12px 0 0;font-weight:bold;color:${C.red};white-space:nowrap;">${formatBRL(order.total_cents)}</td></tr>`);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:18px 0;">${rows.join('')}</table>`;
}

function button(href, label) {
  return `<p style="margin:24px 0 8px;"><a href="${esc(href)}" style="display:inline-block;background:${C.black};color:${C.white};padding:13px 24px;text-decoration:none;font-weight:bold;text-transform:uppercase;letter-spacing:1px;font-size:14px;">${esc(label)}</a></p>`;
}

function isPickup(order) {
  return Boolean(order.shipping && order.shipping.pickup);
}

function pickupText(order) {
  return (order.shipping && order.shipping.note) || 'Retirada em Porto Alegre, combinada com a banda.';
}

// Link wa.me com a mensagem pronta pro Deo: número do pedido, itens (com tamanho) e o nome.
export function pickupWhatsAppUrl(order) {
  const number = order.shipping && order.shipping.pickup_whatsapp;
  if (!number) return null;
  const items = (order.items || []).map((it) => `${it.qty}× ${it.name}`).join(', ');
  const first = String((order.buyer && order.buyer.name) || '').trim().split(/\s+/)[0];
  const message = `Oi, Deo! ${first ? `Aqui é ${first}. ` : ''}Comprei no site da ISOTOPXS o pedido #${shortId(order.id)} (${items}) com retirada em Porto Alegre. Quando e onde dá pra retirar?`;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

function addressHtml(order) {
  const lines = addressLines(order);
  return lines.length ? `<p style="margin:0;">${lines.map(esc).join('<br>')}</p>` : '';
}

function layout({ title, preheader, body }) {
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:${C.black};">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.black};">
<tr><td align="center" style="padding:28px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${C.white};">
<tr><td style="background:${C.red};padding:18px 26px;font-family:'Arial Black',Arial,Helvetica,sans-serif;font-size:26px;font-weight:900;letter-spacing:3px;color:${C.black};">ISOTOPXS</td></tr>
<tr><td style="padding:26px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:${C.black};">
<h1 style="font-family:'Arial Black',Arial,Helvetica,sans-serif;font-size:21px;line-height:1.25;margin:0 0 14px;text-transform:uppercase;">${esc(title)}</h1>
${body}
</td></tr>
<tr><td style="padding:16px 26px;background:${C.black};color:#a9a69f;font-family:Arial,Helvetica,sans-serif;font-size:12px;">ISOTOPXS · Porto Alegre/RS · isotopxs.com.br · Instagram @isotopxs</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

export function customerConfirmationEmail(order, base) {
  const id = shortId(order.id);
  const subject = `ISOTOPXS - pedido #${id} confirmado`;
  const html = layout({
    title: `Pedido #${id} confirmado`,
    preheader: 'Pagamento aprovado. A gente avisa quando o pacote sair.',
    body: `
<p style="margin:0 0 12px;">${esc(hello(order))} Seu pagamento foi aprovado e o pedido tá confirmado.</p>
${itemsTable(order)}
${isPickup(order)
    ? `<p style="margin:0 0 4px;font-weight:bold;">Retirada em Porto Alegre</p>
<p style="margin:0;">Combina dia e lugar com o Deo pelo WhatsApp, a mensagem já vai com o seu pedido.</p>
${pickupWhatsAppUrl(order) ? button(pickupWhatsAppUrl(order), 'Combinar retirada no WhatsApp') : `<p style="margin:0;">${esc(pickupText(order))}</p>`}`
    : `<p style="margin:0 0 4px;font-weight:bold;">Entrega</p>
${addressHtml(order)}
<p style="margin:18px 0 0;">Agora a gente embala e posta. Quando sair, você recebe outro e-mail com o código de rastreio.</p>`}
${button(orderUrl(order, base), 'Acompanhar pedido')}
<p style="margin:18px 0 0;color:${C.muted};font-size:13px;">Dúvidas? Chama a gente no Instagram @isotopxs.</p>`,
  });
  const text = [
    `${hello(order)} Seu pagamento foi aprovado e o pedido #${id} tá confirmado.`,
    '',
    itemsText(order),
    '',
    ...(isPickup(order)
      ? ['Retirada em Porto Alegre: combina dia e lugar com o Deo pelo WhatsApp.', pickupWhatsAppUrl(order) || pickupText(order)]
      : ['Entrega:', ...addressLines(order), '', 'Agora a gente embala e posta. Quando sair, você recebe outro e-mail com o código de rastreio.']),
    `Acompanhar pedido: ${orderUrl(order, base)}`,
    '',
    'Dúvidas? Chama a gente no Instagram @isotopxs.',
  ].join('\n');
  return { subject, html, text };
}

export function customerShippedEmail(order, base) {
  const id = shortId(order.id);
  const carrier = order.shipping_carrier ? ` (${order.shipping_carrier})` : '';
  const subject = `ISOTOPXS - pedido #${id} enviado`;

  const trackingHtml = order.tracking_code
    ? `<p style="margin:0 0 6px;">Código de rastreio${esc(carrier)}:</p>
<p style="margin:0;font-family:'Courier New',monospace;font-size:20px;font-weight:bold;letter-spacing:1px;">${esc(order.tracking_code)}</p>
${order.tracking_url ? button(order.tracking_url, 'Rastrear envio') : ''}`
    : '<p style="margin:0;">O código de rastreio chega por aqui assim que a transportadora liberar.</p>';

  const html = layout({
    title: `Pedido #${id} saiu!`,
    preheader: order.tracking_code ? `Código de rastreio: ${order.tracking_code}` : 'Seu pedido foi postado.',
    body: `
<p style="margin:0 0 16px;">${esc(hello(order))} Seu pedido foi postado e já tá a caminho.</p>
${trackingHtml}
${itemsTable(order)}
<p style="margin:0 0 4px;font-weight:bold;">Indo para</p>
${addressHtml(order)}
<p style="margin:18px 0 0;color:${C.muted};font-size:13px;">Dúvidas? Chama a gente no Instagram @isotopxs.</p>`,
  });
  const text = [
    `${hello(order)} Seu pedido #${id} foi postado e já tá a caminho.`,
    '',
    order.tracking_code
      ? `Código de rastreio${carrier}: ${order.tracking_code}${order.tracking_url ? `\nRastrear: ${order.tracking_url}` : ''}`
      : 'O código de rastreio chega por aqui assim que a transportadora liberar.',
    '',
    itemsText(order),
    '',
    'Indo para:',
    ...addressLines(order),
  ].join('\n');
  return { subject, html, text };
}

export function bandNewOrderEmail(order, base) {
  const id = shortId(order.id);
  const buyer = order.buyer || {};
  const subject = `Novo pedido pago #${id} (${formatBRL(order.total_cents)})`;
  const html = layout({
    title: `Novo pedido pago #${id}`,
    preheader: `${buyer.name || 'Cliente'}, ${formatBRL(order.total_cents)}`,
    body: `
<p style="margin:0 0 12px;">Caiu um pedido pago na loja. Bora embalar.</p>
${itemsTable(order)}
<p style="margin:0 0 4px;font-weight:bold;">Cliente</p>
<p style="margin:0 0 14px;">${esc(buyer.name)}<br>${esc(buyer.email)}${buyer.phone ? `<br>${esc(buyer.phone)}` : ''}</p>
${isPickup(order)
    ? `<p style="margin:0 0 4px;font-weight:bold;">Retirada em Porto Alegre</p>
<p style="margin:0;">Cliente vai retirar em mãos. Combinar com ele(a) pelo telefone acima.</p>`
    : `<p style="margin:0 0 4px;font-weight:bold;">Endereço de entrega</p>
${addressHtml(order)}`}
${button(adminUrl(order, base), 'Abrir no painel')}`,
  });
  const text = [
    `Novo pedido pago #${id}`,
    '',
    itemsText(order),
    '',
    'Cliente:',
    buyer.name || '',
    buyer.email || '',
    buyer.phone || '',
    '',
    ...(isPickup(order)
      ? ['Retirada em Porto Alegre: combinar com o cliente pelo telefone acima.']
      : ['Endereço de entrega:', ...addressLines(order)]),
    '',
    `Painel: ${adminUrl(order, base)}`,
  ].join('\n');
  return { subject, html, text };
}

// Vai por um serviço de terceiro (CallMeBot), então leva só o necessário pra saber que tem pedido —
// sem e-mail, telefone ou endereço do cliente. O detalhe completo fica no painel e no e-mail.
export function bandNewOrderWhatsApp(order, base) {
  const a = order.shipping && order.shipping.address;
  const items = (order.items || []).map((it) => `${it.qty}x ${it.name}`).join('\n');
  return [
    `ISOTOPXS - novo pedido pago #${shortId(order.id)}`,
    items,
    `Total: ${formatBRL(order.total_cents)}${order.shipping ? ` (${order.shipping.label})` : ''}`,
    a ? `Destino: ${a.city}/${a.state}` : '',
    `Painel: ${adminUrl(order, base)}`,
  ].filter(Boolean).join('\n');
}
