/* ISOTOPXS — painel de pedidos. JS puro. Fala só com admin-session e admin-orders (Netlify
   Functions); o cookie de sessão é HttpOnly, então este script nunca vê nem guarda credencial. */

const STATUS = {
  pending: 'Aguardando pagamento',
  paid: 'Pago (a enviar)',
  shipped: 'Enviado',
  delivered: 'Entregue',
  failed: 'Pagamento recusado',
  cancelled: 'Cancelado',
};

const FILTERS = [
  { id: 'todo', label: 'A enviar', match: (o) => o.status === 'paid' },
  { id: 'shipped', label: 'Enviados', match: (o) => o.status === 'shipped' },
  { id: 'delivered', label: 'Entregues', match: (o) => o.status === 'delivered' },
  { id: 'pending', label: 'Aguardando pagamento', match: (o) => o.status === 'pending' },
  { id: 'closed', label: 'Cancelados / recusados', match: (o) => o.status === 'cancelled' || o.status === 'failed' },
  { id: 'all', label: 'Todos', match: () => true },
];

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function formatBRL(cents) {
  return (Number(cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(iso, withYear) {
  if (!iso) return '';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit', month: '2-digit', year: withYear ? 'numeric' : undefined,
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso));
}

function shortId(id) {
  return String(id || '').slice(0, 8).toUpperCase();
}

function formatCep(cep) {
  const d = String(cep || '').replace(/\D/g, '');
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

function formatPhone(phone) {
  const d = String(phone || '').replace(/\D/g, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return d;
}

function whatsappLink(phone) {
  const d = String(phone || '').replace(/\D/g, '');
  if (d.length < 10) return null;
  return `https://wa.me/${d.length <= 11 ? `55${d}` : d}`;
}

function addressLines(order) {
  const shipping = order.shipping || {};
  const a = shipping.address;
  const cep = formatCep(shipping.destination_cep);
  if (!a) return [];
  return [
    `${a.street}, ${a.number}${a.complement ? `, ${a.complement}` : ''}`,
    `${a.district}, ${a.city}/${a.state}`,
    `CEP ${cep}`,
  ];
}

function normalize(text) {
  return String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function searchableText(order) {
  const b = order.buyer || {};
  const a = (order.shipping && order.shipping.address) || {};
  return normalize([
    order.id, b.name, b.email, b.phone, a.city, a.state, a.district, order.tracking_code,
    ...(order.items || []).map((it) => it.name),
  ].join(' '));
}

function badge(status) {
  return `<span class="badge badge--${escapeHtml(status)}">${escapeHtml(STATUS[status] || status || '?')}</span>`;
}

document.addEventListener('DOMContentLoaded', () => {
  const $ = (id) => document.getElementById(id);
  const loginView = $('login-view');
  const dashView = $('dash-view');
  const listView = $('list-view');
  const detailView = $('detail-view');
  const orderList = $('order-list');
  const filtersEl = $('filters');
  const searchInput = $('search');
  const loginMsg = $('login-msg');
  const logoutBtn = $('logout-btn');
  const configWarn = $('config-warn');

  let orders = [];
  let notificationConfig = null;
  let filter = null;
  let query = '';

  async function api(path, options = {}) {
    const res = await fetch(`/.netlify/functions/${path}`, { credentials: 'same-origin', ...options });
    let data = {};
    try {
      data = await res.json();
    } catch {
      data = {};
    }
    if (res.status === 401 && path === 'admin-orders') {
      showLogin('Sua sessão expirou. Entra de novo.');
      throw new Error('Sessão expirada');
    }
    if (!res.ok) throw new Error(data.error || `Erro ${res.status}`);
    return data;
  }

  function showLogin(message) {
    dashView.hidden = true;
    logoutBtn.hidden = true;
    loginView.hidden = false;
    loginMsg.textContent = message || '';
    loginMsg.className = message ? 'admin-msg admin-msg--error' : 'admin-msg';
    $('login-password').focus();
  }

  async function showDashboard() {
    loginView.hidden = true;
    dashView.hidden = false;
    logoutBtn.hidden = false;
    await loadOrders();
  }

  async function loadOrders() {
    orderList.innerHTML = '<p class="admin-empty">Carregando pedidos...</p>';
    try {
      const data = await api('admin-orders');
      orders = data.orders || [];
      notificationConfig = data.notifications || null;
      if (!filter) filter = orders.some((o) => o.status === 'paid') ? 'todo' : 'all';
      renderConfigWarning();
      route();
    } catch (err) {
      if (err.message !== 'Sessão expirada') {
        orderList.innerHTML = `<p class="admin-empty">Não deu pra carregar os pedidos: ${escapeHtml(err.message)}</p>`;
      }
    }
  }

  function renderConfigWarning() {
    const c = notificationConfig;
    const notes = [];
    if (c && !c.email) {
      notes.push('<strong>E-mail desligado</strong> (falta RESEND_API_KEY / RESEND_FROM_EMAIL na Netlify): clientes não recebem confirmação nem código de rastreio, e a banda não recebe e-mail de pedido novo.');
    }
    if (c && c.band_emails === 0 && c.whatsapp === 0) {
      notes.push('<strong>Ninguém da banda recebe alerta de pedido novo</strong> (BAND_NOTIFY_EMAILS / BAND_NOTIFY_WHATSAPP vazios).');
    }
    configWarn.innerHTML = notes.length ? `<div class="admin-notice">${notes.map((n) => `<p>${n}</p>`).join('')}</div>` : '';
  }

  // ---------- lista ----------
  function renderFilters() {
    filtersEl.innerHTML = FILTERS.map((f) => {
      const count = orders.filter(f.match).length;
      return `<button type="button" class="chip" data-filter="${f.id}" aria-pressed="${f.id === filter}">${escapeHtml(f.label)}<span class="chip__count">${count}</span></button>`;
    }).join('');
  }

  function renderList() {
    renderFilters();
    const active = FILTERS.find((f) => f.id === filter) || FILTERS[FILTERS.length - 1];
    const q = normalize(query.trim());
    const visible = orders.filter(active.match).filter((o) => !q || searchableText(o).includes(q));

    if (!visible.length) {
      orderList.innerHTML = `<p class="admin-empty">${q ? 'Nenhum pedido bate com essa busca.' : 'Nenhum pedido aqui.'}</p>`;
      return;
    }

    orderList.innerHTML = visible.map((o) => {
      const b = o.buyer || {};
      const a = (o.shipping && o.shipping.address) || null;
      const items = (o.items || []).map((it) => `${it.qty}× ${it.name}`).join(', ');
      return `
        <button type="button" class="order-row" data-id="${escapeHtml(o.id)}">
          <span class="order-row__id">#${escapeHtml(shortId(o.id))}</span>
          <span class="order-row__date">${escapeHtml(formatDate(o.created_at))}</span>
          <span class="order-row__who"><span>${escapeHtml(b.name || b.email || 'Sem nome')}</span><small>${a ? escapeHtml(`${a.city}/${a.state}`) : '&nbsp;'}</small></span>
          <span class="order-row__items">${escapeHtml(items)}</span>
          <span class="order-row__total">${formatBRL(o.total_cents)}</span>
          ${badge(o.status)}
        </button>`;
    }).join('');
  }

  // ---------- detalhe ----------
  function renderDetail(order, { editOpen = false } = {}) {
    const b = order.buyer || {};
    const s = order.shipping || {};
    const addr = s.address || {};
    const lines = addressLines(order);
    const wa = whatsappLink(b.phone);
    const emailOn = notificationConfig ? notificationConfig.email : true;

    const items = (order.items || []).map((it) => `
      <div class="cart-summary__row"><span>${Number(it.qty) || 0}× ${escapeHtml(it.name)}</span><strong>${formatBRL(it.unit_price_cents * it.qty)}</strong></div>`).join('');

    const statusOptions = Object.entries(STATUS)
      .map(([value, label]) => `<option value="${value}"${value === order.status ? ' selected' : ''}>${escapeHtml(label)}</option>`)
      .join('');

    const channel = (status) => ({ sent: 'enviado', skipped: 'desligado', failed: 'FALHOU' }[status] || status || '?');
    const n = order.paid_notifications;
    const log = [
      order.paid_notified_at && `Pagamento confirmado em ${formatDate(order.paid_notified_at, true)}.`,
      n && `Avisos do pagamento: e-mail pro cliente: ${channel(n.customer_email)} · e-mail pra banda: ${channel(n.band_email)} · WhatsApp: ${n.band_whatsapp && n.band_whatsapp.length ? n.band_whatsapp.map(channel).join(', ') : 'desligado'}.`,
      order.shipped_email_sent_at && `E-mail de envio mandado em ${formatDate(order.shipped_email_sent_at, true)}${order.shipped_email_key ? ` (rastreio ${order.shipped_email_key})` : ' (sem código)'}.`,
      order.shipping_error && `Erro no envio automático: ${order.shipping_error}`,
      order.updated_at && `Última atualização em ${formatDate(order.updated_at, true)}.`,
    ].filter(Boolean);

    detailView.innerHTML = `
      <button type="button" class="admin-link" id="back-btn">Voltar pra lista</button>
      <div class="detail-head"><h2>#${escapeHtml(shortId(order.id))}</h2>${badge(order.status)}</div>
      <p class="detail-meta">Feito em ${escapeHtml(formatDate(order.created_at, true))}
        · Mercado Pago: ${escapeHtml(order.payment_status || 'sem pagamento')}${order.payment_id ? ` (nº ${escapeHtml(order.payment_id)})` : ''}</p>

      ${order.shipping_claim ? `
        <div class="admin-notice">
          <p>A trava de envio automático deste pedido ficou presa${order.shipping_claim_at ? ` desde ${escapeHtml(formatDate(order.shipping_claim_at, true))}` : ''} (bug antigo, já corrigido). Não atrapalha o envio manual, dá pra liberar.</p>
          <button type="button" class="admin-link" id="clear-claim-btn">Liberar trava</button>
        </div>` : ''}

      <div class="detail-grid">
        <div class="detail-card">
          <h3>Itens</h3>
          <div class="cart-summary">
            ${items}
            <div class="cart-summary__row"><span>Frete - ${escapeHtml(s.label || '')}</span><strong>${formatBRL(s.price_cents)}</strong></div>
            <div class="cart-summary__row cart-summary__row--total"><span>Total</span><strong>${formatBRL(order.total_cents)}</strong></div>
          </div>
        </div>

        <div class="detail-card">
          <h3>Cliente</h3>
          <p><strong>${escapeHtml(b.name || 'Sem nome')}</strong></p>
          ${b.email ? `<p><a href="mailto:${escapeHtml(b.email)}">${escapeHtml(b.email)}</a></p>` : ''}
          ${b.phone ? `<p>${escapeHtml(formatPhone(b.phone))}${wa ? ` · <a href="${escapeHtml(wa)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}</p>` : ''}
        </div>

        <div class="detail-card detail-card--wide">
          <h3>Entrega</h3>
          ${lines.length
            ? `<p>${lines.map(escapeHtml).join('<br>')}</p>
               <button type="button" class="admin-link" id="copy-address-btn">Copiar nome + endereço</button>`
            : s.pickup
              ? '<p><strong>Retirada em Porto Alegre</strong>: combinar com o cliente pelo telefone. Quando entregar, marca como "Entregue".</p>'
              : `<p>Endereço não coletado (pedido de antes do formulário de endereço). Só o CEP: ${escapeHtml(formatCep(s.destination_cep))}.</p>`}
          <p class="admin-hint" style="margin-top:10px !important;">Frete escolhido: ${escapeHtml(s.label || '-')}${s.eta_business_days ? ` · prazo informado: até ${Number(s.eta_business_days)} dia(s) útil(eis)` : ''}</p>
          <p class="admin-msg" id="copy-msg"></p>
          <details class="detail-edit"${editOpen ? ' open' : ''}>
            <summary>Corrigir dados do cliente / endereço</summary>
            <form id="customer-form" class="admin-form">
              <div class="admin-form__row">
                <label>Nome<input name="name" maxlength="100" required value="${escapeHtml(b.name || '')}"></label>
                <label>E-mail<input name="email" type="email" maxlength="254" required value="${escapeHtml(b.email || '')}"></label>
              </div>
              <div class="admin-form__row">
                <label>Telefone<input name="phone" type="tel" maxlength="20" required value="${escapeHtml(formatPhone(b.phone))}"></label>
                <label>CEP<input name="cep" inputmode="numeric" maxlength="9" required value="${escapeHtml(formatCep(s.destination_cep))}"></label>
              </div>
              <div class="admin-form__row">
                <label>Rua<input name="street" maxlength="120" required value="${escapeHtml(addr.street || '')}"></label>
                <label>Número<input name="number" maxlength="20" required value="${escapeHtml(addr.number || '')}"></label>
              </div>
              <div class="admin-form__row">
                <label>Complemento<input name="complement" maxlength="60" value="${escapeHtml(addr.complement || '')}"></label>
                <label>Bairro<input name="district" maxlength="60" required value="${escapeHtml(addr.district || '')}"></label>
              </div>
              <div class="admin-form__row">
                <label>Cidade<input name="city" maxlength="60" required value="${escapeHtml(addr.city || '')}"></label>
                <label>UF<input name="state" maxlength="2" required value="${escapeHtml(addr.state || '')}"></label>
              </div>
              <p class="admin-hint">Mudar o CEP não recalcula o frete que o cliente já pagou.</p>
              <button type="submit" class="btn btn--dark"><span>Salvar dados</span></button>
              <p class="admin-msg" id="customer-msg" role="status"></p>
            </form>
          </details>
        </div>

        <div class="detail-card detail-card--wide">
          <h3>Envio</h3>
          <form id="edit-form" class="admin-form">
            <div class="admin-form__row">
              <label>Status
                <select name="status">${statusOptions}</select>
              </label>
              <label>Transportadora
                <input name="shipping_carrier" maxlength="40" placeholder="Correios, Loggi, em mãos" value="${escapeHtml(order.shipping_carrier || '')}">
              </label>
            </div>
            <div class="admin-form__row">
              <label>Código de rastreio
                <input name="tracking_code" maxlength="64" autocomplete="off" value="${escapeHtml(order.tracking_code || '')}">
              </label>
              <label>Link de rastreio (opcional)
                <input name="tracking_url" maxlength="500" placeholder="https://" value="${escapeHtml(order.tracking_url || '')}">
              </label>
            </div>
            <label>Notas internas (só a banda vê)
              <textarea name="admin_notes" maxlength="2000" rows="3">${escapeHtml(order.admin_notes || '')}</textarea>
            </label>
            <p class="admin-hint">${emailOn
              ? 'Ao salvar como "Enviado" (ou colocar o código de rastreio num pedido pago), o cliente recebe um e-mail com o rastreio.'
              : 'E-mail desligado: o cliente não vai ser avisado automaticamente do envio.'}</p>
            <button type="submit" class="btn btn--dark"><span>Salvar</span></button>
            <p class="admin-msg" id="save-msg" role="status"></p>
          </form>
          ${log.length ? `<div class="detail-log">${log.map((l) => `<p>${escapeHtml(l)}</p>`).join('')}</div>` : ''}
        </div>
      </div>`;

    $('back-btn').addEventListener('click', () => { window.location.hash = ''; });
    $('edit-form').addEventListener('submit', (e) => {
      e.preventDefault();
      saveOrder(order, e.currentTarget);
    });
    $('customer-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.currentTarget).entries());
      patchOrder(order.id, {
        customer: {
          name: f.name, email: f.email, phone: f.phone, cep: f.cep,
          address: { street: f.street, number: f.number, complement: f.complement, district: f.district, city: f.city, state: f.state },
        },
      }, $('customer-msg'));
    });
    const copyBtn = $('copy-address-btn');
    if (copyBtn) copyBtn.addEventListener('click', () => copyAddress(order));
    const clearBtn = $('clear-claim-btn');
    if (clearBtn) clearBtn.addEventListener('click', () => patchOrder(order.id, { clear_shipping_claim: true }, $('save-msg')));
  }

  async function copyAddress(order) {
    const b = order.buyer || {};
    const text = [b.name, ...addressLines(order), b.phone ? `Tel: ${formatPhone(b.phone)}` : ''].filter(Boolean).join('\n');
    const msg = $('copy-msg');
    try {
      await navigator.clipboard.writeText(text);
      msg.textContent = 'Copiado.';
    } catch {
      msg.textContent = 'Não deu pra copiar automaticamente. Seleciona o texto acima.';
    }
  }

  function describeNotifications(notifications) {
    const result = notifications && notifications.customer_email;
    if (result === 'sent') return ' E-mail de envio mandado pro cliente.';
    if (result === 'failed') return ' Mas o e-mail pro cliente falhou. Salva de novo pra tentar outra vez.';
    if (result === 'skipped') return ' (E-mail desligado: cliente não foi avisado.)';
    return '';
  }

  async function patchOrder(id, body, msgEl) {
    msgEl.className = 'admin-msg';
    msgEl.textContent = 'Salvando...';
    try {
      const data = await api('admin-orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...body }),
      });
      orders = orders.map((o) => (o.id === data.order.id ? data.order : o));
      renderDetail(data.order, { editOpen: msgEl.id === 'customer-msg' });
      const newMsg = $(msgEl.id) || $('save-msg');
      newMsg.textContent = `Salvo.${describeNotifications(data.notifications)}`;
      if (data.notifications && data.notifications.customer_email === 'failed') newMsg.className = 'admin-msg admin-msg--error';
    } catch (err) {
      msgEl.className = 'admin-msg admin-msg--error';
      msgEl.textContent = `Não salvou: ${err.message}`;
    }
  }

  function saveOrder(order, form) {
    const button = form.querySelector('button[type="submit"]');
    button.setAttribute('aria-disabled', 'true');
    const fields = Object.fromEntries(new FormData(form).entries());
    patchOrder(order.id, fields, $('save-msg')).finally(() => {
      const current = $('edit-form');
      if (current) current.querySelector('button[type="submit"]').removeAttribute('aria-disabled');
    });
  }

  // ---------- navegação (#pedido=<id> abre um pedido; links dos avisos da banda usam isso) ----------
  function route() {
    const match = /^#pedido=([\w-]+)$/.exec(window.location.hash);
    const order = match && orders.find((o) => o.id === match[1]);
    if (order) {
      listView.hidden = true;
      detailView.hidden = false;
      renderDetail(order);
      window.scrollTo(0, 0);
    } else {
      detailView.hidden = true;
      listView.hidden = false;
      renderList();
    }
  }

  window.addEventListener('hashchange', route);

  filtersEl.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-filter]');
    if (!chip) return;
    filter = chip.dataset.filter;
    renderList();
  });

  orderList.addEventListener('click', (e) => {
    const row = e.target.closest('[data-id]');
    if (row) window.location.hash = `pedido=${row.dataset.id}`;
  });

  searchInput.addEventListener('input', () => {
    query = searchInput.value;
    renderList();
  });

  $('refresh-btn').addEventListener('click', loadOrders);

  $('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = $('login-password');
    loginMsg.className = 'admin-msg';
    loginMsg.textContent = 'Entrando...';
    try {
      await api('admin-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: input.value }),
      });
      input.value = '';
      loginMsg.textContent = '';
      await showDashboard();
    } catch (err) {
      loginMsg.className = 'admin-msg admin-msg--error';
      loginMsg.textContent = err.message;
    }
  });

  logoutBtn.addEventListener('click', async () => {
    try {
      await api('admin-session', { method: 'DELETE' });
    } finally {
      orders = [];
      showLogin('Você saiu.');
    }
  });

  api('admin-session')
    .then((data) => (data.authenticated ? showDashboard() : showLogin()))
    .catch(() => showLogin('Não deu pra falar com o servidor. Recarrega a página.'));
});
