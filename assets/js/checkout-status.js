/* ISOTOPXS — página de retorno do checkout Mercado Pago. Consulta o pedido pela nossa
   function order-status em vez de confiar só no parâmetro da URL: o redirect do Mercado Pago
   acontece antes do webhook confirmar o pagamento, então a fonte de verdade é sempre o backend. */

function formatBRL(cents) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// Ver nota equivalente em loja.js — escapar sempre antes de innerHTML, mesmo com valores que
// hoje só vêm do nosso backend, não de input de usuário.
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

const STATUS_LABEL = {
  paid: { title: 'Pagamento aprovado', tone: 'Show — seu pedido está confirmado. A confirmação também foi pro seu e-mail.' },
  pending: { title: 'Pagamento em análise', tone: 'Assim que for aprovado, você recebe a confirmação por e-mail.' },
  failed: { title: 'Pagamento não aprovado', tone: 'Tente novamente ou use outro cartão.' },
  shipped: { title: 'Pedido enviado', tone: 'Seu pedido já foi postado e está a caminho.' },
  delivered: { title: 'Pedido entregue', tone: 'Pedido entregue. Valeu pelo apoio!' },
  cancelled: { title: 'Pedido cancelado', tone: 'Esse pedido foi cancelado. Qualquer dúvida, chama a gente no Instagram @isotopxs.' },
};

document.addEventListener('DOMContentLoaded', () => {
  const box = document.getElementById('status-box');
  const sub = document.getElementById('status-sub');
  if (!box) return;

  const params = new URLSearchParams(window.location.search);
  const orderId = params.get('order');

  if (!orderId) {
    sub.textContent = 'Pedido não encontrado';
    box.innerHTML = '<p class="lead">Não recebemos um número de pedido nessa página. Se você acabou de comprar algo, confira seu e-mail — a confirmação vem por lá.</p>';
    return;
  }

  let attempts = 0;
  const maxAttempts = 6;

  async function poll() {
    attempts += 1;
    try {
      const res = await fetch(`/.netlify/functions/order-status?order=${encodeURIComponent(orderId)}`);
      const order = await res.json();
      if (!res.ok) throw new Error(order.error || 'Falha ao consultar pedido');

      render(order);

      if (order.status === 'pending' && attempts < maxAttempts) {
        setTimeout(poll, 2500);
      }
    } catch (err) {
      sub.textContent = 'Não foi possível consultar o pedido';
      box.innerHTML = `<p class="lead">${escapeHtml(err.message)}. Se o pagamento foi concluído, a confirmação chega por e-mail mesmo assim.</p>`;
    }
  }

  function render(order) {
    const info = STATUS_LABEL[order.status] || STATUS_LABEL.pending;
    sub.textContent = info.title;

    if (order.status !== 'pending' && order.status !== 'failed') {
      localStorage.removeItem('isotopxs:cart');
      window.dispatchEvent(new Event('isotopxs:cart-changed'));
    }

    const itemsHtml = (order.items || [])
      .map((it) => `<div class="cart-summary__row"><span>${Number(it.qty) || 0}× ${escapeHtml(it.name)}</span><strong>${formatBRL(it.unit_price_cents * it.qty)}</strong></div>`)
      .join('');

    // tracking_url só chega aqui se for https:// (validado no painel, admin-orders).
    const trackingLink = order.tracking_url && /^https:\/\//.test(order.tracking_url)
      ? ` — <a href="${escapeHtml(order.tracking_url)}" target="_blank" rel="noopener">rastrear</a>`
      : '';
    const trackingHtml = order.tracking_code
      ? `<p class="lead" style="margin-top:18px;">Código de rastreio${order.shipping_carrier ? ` (${escapeHtml(order.shipping_carrier)})` : ''}: <strong>${escapeHtml(order.tracking_code)}</strong>${trackingLink}</p>`
      : order.status === 'paid'
        ? '<p class="lead" style="margin-top:18px;">Agora a gente embala e posta. Quando sair, o código de rastreio chega no seu e-mail e aparece aqui.</p>'
        : '';

    box.innerHTML = `
      <p class="lead">${escapeHtml(info.tone)}</p>
      <div class="cart-summary" style="margin-top:22px;">
        ${itemsHtml}
        <div class="cart-summary__row"><span>Frete — ${order.shipping ? escapeHtml(order.shipping.label) : ''}</span><strong>${order.shipping ? formatBRL(order.shipping.price_cents) : ''}</strong></div>
        <div class="cart-summary__row cart-summary__row--total"><span>Total</span><strong>${formatBRL(order.total_cents)}</strong></div>
      </div>
      ${trackingHtml}
      <p style="margin-top:26px;"><a class="btn btn--dark" href="loja.html"><span>Voltar para a loja</span></a></p>
    `;
  }

  poll();
});
