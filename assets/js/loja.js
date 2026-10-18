/* ISOTOPXS — loja: carrinho, cotação de frete e checkout via Mercado Pago. JS puro. */

const CART_KEY = 'isotopxs:cart';

function formatBRL(cents) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// Escapa qualquer valor antes de ir pra um template de innerHTML. Hoje nome/label vêm só do
// nosso catálogo (data/products.json) e da cotação de frete, não de input de usuário — mas é
// barato escapar sempre e evita que uma edição futura do catálogo (ou um campo novo) vire XSS
// por descuido.
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function loadCart() {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY)) || {};
  } catch {
    return {};
  }
}

function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  window.dispatchEvent(new Event('isotopxs:cart-changed')); // atualiza o carrinho do topo (cart-widget.js)
}

document.addEventListener('DOMContentLoaded', () => {
  const shopGrid = document.getElementById('shop-grid');
  const cartRoot = document.getElementById('cart');
  if (!shopGrid || !cartRoot) return; // não é a página da loja

  const cartItemsEl = document.getElementById('cart-items');
  const cartEmptyEl = document.getElementById('cart-empty');
  const cartSubtotalEl = document.getElementById('cart-subtotal');
  const cepInput = document.getElementById('cep-input');
  const quoteBtn = document.getElementById('quote-btn');
  const shippingOptionsEl = document.getElementById('shipping-options');
  const shippingMsgEl = document.getElementById('shipping-msg');
  const totalRow = document.getElementById('cart-total-row');
  const cartTotalEl = document.getElementById('cart-total');
  const field = (id) => document.getElementById(id);
  const checkoutBtn = document.getElementById('checkout-btn');
  const checkoutMsgEl = document.getElementById('checkout-msg');

  let products = [];
  let cart = loadCart();
  let selectedShipping = null; // { id, label, price_cents, eta_business_days }
  let lastQuotedCep = null;

  // Chave do carrinho: "id" ou "id:tamanho" (ex.: "camiseta:M"). Entrada sem tamanho válido de um
  // produto que exige tamanho (carrinho antigo salvo no navegador) é ignorada.
  function cartEntries() {
    return Object.entries(cart)
      .map(([key, qty]) => {
        const [id, size = null] = key.split(':');
        return { key, product: products.find((p) => p.id === id), size, qty };
      })
      .filter((e) => e.product && e.qty > 0
        && (Array.isArray(e.product.sizes) ? e.product.sizes.includes(e.size) : !e.size));
  }

  function entryName(e) {
    return e.size ? `${e.product.name} (tamanho ${e.size})` : e.product.name;
  }

  function cartPayload() {
    return cartEntries().map((e) => (e.size ? { id: e.product.id, qty: e.qty, size: e.size } : { id: e.product.id, qty: e.qty }));
  }

  function cartSubtotalCents() {
    return cartEntries().reduce((sum, e) => sum + e.product.price_cents * e.qty, 0);
  }

  // Na retirada em Porto Alegre não tem endereço de entrega — o bloco some e não é exigido.
  function syncAddressFields() {
    document.getElementById('address-fields').hidden = Boolean(selectedShipping && selectedShipping.pickup);
  }

  function invalidateShipping(message) {
    selectedShipping = null;
    syncAddressFields();
    shippingOptionsEl.innerHTML = '';
    totalRow.hidden = true;
    if (message) shippingMsgEl.textContent = message;
    updateCheckoutAvailability();
  }

  // Dados do comprador são validados no clique (com mensagem dizendo o que falta), não travando o
  // botão em silêncio. O servidor (create-preference) valida tudo de novo.
  function updateCheckoutAvailability() {
    const hasItems = cartEntries().length > 0;
    const hasShipping = Boolean(selectedShipping);
    checkoutBtn.setAttribute('aria-disabled', String(!(hasItems && hasShipping)));
  }

  function readBuyer() {
    const val = (id) => field(id).value.trim();
    return {
      name: val('buyer-name'),
      email: val('buyer-email'),
      phone: val('buyer-phone'),
      address: {
        street: val('addr-street'),
        number: val('addr-number'),
        complement: val('addr-complement'),
        district: val('addr-district'),
        city: val('addr-city'),
        state: val('addr-state').toUpperCase(),
      },
    };
  }

  function missingBuyerFields(buyer) {
    const missing = [];
    if (buyer.name.length < 2) missing.push('nome completo');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buyer.email)) missing.push('e-mail válido');
    if (buyer.phone.replace(/\D/g, '').length < 10) missing.push('telefone com DDD');
    if (selectedShipping && selectedShipping.pickup) return missing;
    if (!buyer.address.street) missing.push('rua');
    if (!buyer.address.number) missing.push('número');
    if (!buyer.address.district) missing.push('bairro');
    if (!buyer.address.city) missing.push('cidade');
    if (!/^[A-Z]{2}$/.test(buyer.address.state)) missing.push('UF');
    return missing;
  }

  function setQty(key, qty) {
    if (qty <= 0) {
      delete cart[key];
    } else {
      cart[key] = Math.min(qty, 20);
    }
    saveCart(cart);
    invalidateShipping('O carrinho mudou, calcule o frete de novo.');
    renderCart();
  }

  function renderProducts() {
    shopGrid.innerHTML = '';
    products.forEach((product) => {
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `
        <span class="tag">Loja</span>
        ${product.image
          ? `<div class="thumb thumb--photo"><img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.image_alt || product.name)}" loading="lazy" style="object-fit:${product.image_fit === 'contain' ? 'contain' : 'cover'}"></div>`
          : `<div class="thumb">${escapeHtml(product.thumb_label)}</div>`}
        <h3>${escapeHtml(product.name)}</h3>
        <div class="price">${formatBRL(product.price_cents)}</div>
        ${Array.isArray(product.sizes) ? `
        <fieldset class="size-picker">
          <legend>Tamanho</legend>
          <div class="size-picker__options">
            ${product.sizes.map((s) => `<label class="size-chip"><input type="radio" name="size-${escapeHtml(product.id)}" value="${escapeHtml(s)}"><span>${escapeHtml(s)}</span></label>`).join('')}
          </div>
          ${product.size_chart ? '<button type="button" class="size-chart-link">Tabela de medidas</button>' : ''}
        </fieldset>
        <p class="size-msg" role="status"></p>` : ''}
        <button type="button" class="btn btn--outline cart-add" style="margin-top:14px;"><span>Adicionar ao carrinho</span></button>
      `;
      const chartBtn = card.querySelector('.size-chart-link');
      if (chartBtn) chartBtn.addEventListener('click', () => openSizeChart(product));
      const sizeMsg = card.querySelector('.size-msg');
      card.querySelectorAll('.size-chip input').forEach((input) => input.addEventListener('change', () => { sizeMsg.textContent = ''; }));
      const addBtn = card.querySelector('.cart-add');
      addBtn.addEventListener('click', () => {
        let key = product.id;
        if (Array.isArray(product.sizes)) {
          const picked = card.querySelector('.size-chip input:checked');
          if (!picked) {
            sizeMsg.textContent = 'Escolhe o tamanho antes.';
            card.querySelector('.size-chip input').focus();
            return;
          }
          key = `${product.id}:${picked.value}`;
        }
        setQty(key, (cart[key] || 0) + 1);
        const label = addBtn.querySelector('span');
        label.textContent = 'Adicionado';
        clearTimeout(addBtn.resetTimer);
        addBtn.resetTimer = setTimeout(() => { label.textContent = 'Adicionar ao carrinho'; }, 1400);
      });
      shopGrid.appendChild(card);
    });
  }

  function renderCart() {
    const entries = cartEntries();
    cartItemsEl.innerHTML = '';
    cartEmptyEl.hidden = entries.length > 0;
    cartItemsEl.hidden = entries.length === 0;

    entries.forEach((entry) => {
      const { key, product, qty } = entry;
      const row = document.createElement('div');
      row.className = 'cart-row';
      row.innerHTML = `
        <span class="cart-row__name">${escapeHtml(entryName(entry))}</span>
        <span class="cart-row__qty">
          <button type="button" class="qty-btn" data-delta="-1" aria-label="Diminuir quantidade">−</button>
          <span class="qty-num">${qty}</span>
          <button type="button" class="qty-btn" data-delta="1" aria-label="Aumentar quantidade">+</button>
        </span>
        <span class="cart-row__price">${formatBRL(product.price_cents * qty)}</span>
        <button type="button" class="cart-row__remove" aria-label="Remover item">×</button>
      `;
      row.querySelector('[data-delta="-1"]').addEventListener('click', () => setQty(key, qty - 1));
      row.querySelector('[data-delta="1"]').addEventListener('click', () => setQty(key, qty + 1));
      row.querySelector('.cart-row__remove').addEventListener('click', () => setQty(key, 0));
      cartItemsEl.appendChild(row);
    });

    cartSubtotalEl.textContent = formatBRL(cartSubtotalCents());
    updateCheckoutAvailability();
  }

  // Tabela de medidas num <dialog> nativo (Esc fecha, foco preso dentro). Desenho com as letras
  // A/B/C batendo com as linhas da tabela.
  const SHIRT_SVG = `
    <svg class="size-chart__shirt" viewBox="0 0 220 210" role="img" aria-label="Camiseta com as medidas: A tórax, B comprimento do corpo, C comprimento da manga">
      <path d="M78 22 L94 14 Q110 30 126 14 L142 22 L190 50 L172 86 L150 74 L150 196 L70 196 L70 74 L48 86 L30 50 Z" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/>
      <g style="stroke:var(--red)" stroke-width="2.5" stroke-dasharray="6 5" fill="none">
        <line x1="72" y1="92" x2="148" y2="92"/>
        <line x1="110" y1="26" x2="110" y2="194"/>
        <line x1="146" y1="12" x2="196" y2="40"/>
      </g>
      <g font-family="Bebas Neue, sans-serif" font-size="20" style="fill:var(--red)" text-anchor="middle">
        <text x="88" y="86">A</text><text x="122" y="150">B</text><text x="180" y="20">C</text>
      </g>
    </svg>`;

  function openSizeChart(product) {
    const chart = product.size_chart;
    let dialog = document.getElementById('size-chart');
    if (!dialog) {
      dialog = document.createElement('dialog');
      dialog.id = 'size-chart';
      dialog.className = 'size-chart';
      dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); }); // clique no fundo
      document.body.appendChild(dialog);
    }
    const fmt = (n) => String(n).replace('.', ',');
    dialog.setAttribute('aria-labelledby', 'size-chart-title');
    dialog.innerHTML = `
      <div class="size-chart__inner">
        <button type="button" class="size-chart__close" aria-label="Fechar tabela de medidas">×</button>
        <p class="eyebrow" style="margin:0;">${escapeHtml(product.name)}</p>
        <h2 id="size-chart-title" class="size-chart__title">Tabela de medidas</h2>
        <div class="size-chart__body">
          ${SHIRT_SVG}
          <div class="size-chart__table-wrap">
            <table>
              <thead><tr><th scope="col">Medida (${escapeHtml(chart.unit)})</th>${product.sizes.map((s) => `<th scope="col">${escapeHtml(s)}</th>`).join('')}</tr></thead>
              <tbody>
                ${chart.rows.map((r) => `<tr><th scope="row"><span class="size-chart__key">${escapeHtml(r.key)}</span>${escapeHtml(r.label)}</th>${product.sizes.map((s) => `<td>${escapeHtml(fmt(r.values[s]))}</td>`).join('')}</tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>
        <p class="size-chart__note">${escapeHtml(chart.note)} Dica: mede uma camiseta sua que veste bem, estendida numa mesa, e compara.</p>
      </div>`;
    dialog.querySelector('.size-chart__close').addEventListener('click', () => dialog.close());
    dialog.showModal();
  }

  function renderShippingOptions(options) {
    shippingOptionsEl.innerHTML = '';
    options.forEach((opt) => {
      const id = `ship-${escapeHtml(opt.id)}`;
      const label = document.createElement('label');
      label.className = 'ship-option';
      label.innerHTML = `
        <input type="radio" name="shipping" id="${id}" value="${escapeHtml(opt.id)}">
        <span>
          <strong>${escapeHtml(opt.label)}</strong>
          <small>${opt.pickup
            ? escapeHtml(opt.note || 'Grátis')
            : `até ${Number(opt.eta_business_days) || 0} dia(s) útil(eis) · ${formatBRL(opt.price_cents)}`}</small>
        </span>
      `;
      label.querySelector('input').addEventListener('change', () => {
        selectedShipping = opt;
        syncAddressFields();
        totalRow.hidden = false;
        cartTotalEl.textContent = formatBRL(cartSubtotalCents() + opt.price_cents);
        updateCheckoutAvailability();
      });
      shippingOptionsEl.appendChild(label);
    });
  }

  async function quoteShipping() {
    const cep = (cepInput.value || '').replace(/\D/g, '');
    if (cep.length !== 8) {
      shippingMsgEl.textContent = 'Digite um CEP válido (8 dígitos).';
      return;
    }
    if (cartEntries().length === 0) {
      shippingMsgEl.textContent = 'Adicione algo ao carrinho antes de calcular o frete.';
      return;
    }

    shippingMsgEl.textContent = 'Calculando frete...';
    quoteBtn.setAttribute('aria-disabled', 'true');
    try {
      const res = await fetch('/.netlify/functions/shipping-quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destinationCep: cep,
          items: cartPayload(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao calcular frete');

      lastQuotedCep = cep;
      shippingMsgEl.textContent = data.options.length
        ? ''
        : 'Nenhuma opção de entrega pra esse CEP. Chama a gente no Instagram que a gente resolve.';
      renderShippingOptions(data.options);
    } catch (err) {
      shippingMsgEl.textContent = `Não foi possível calcular o frete: ${err.message}`;
      invalidateShipping();
    } finally {
      quoteBtn.setAttribute('aria-disabled', 'false');
    }
  }

  async function checkout() {
    if (checkoutBtn.getAttribute('aria-disabled') === 'true') return;
    if (!selectedShipping || lastQuotedCep !== (cepInput.value || '').replace(/\D/g, '')) {
      checkoutMsgEl.textContent = 'Calcule o frete de novo antes de finalizar.';
      return;
    }

    const buyer = readBuyer();
    const missing = missingBuyerFields(buyer);
    if (missing.length) {
      checkoutMsgEl.textContent = `Faltou preencher: ${missing.join(', ')}.`;
      return;
    }

    checkoutMsgEl.textContent = 'Redirecionando para o pagamento...';
    checkoutBtn.setAttribute('aria-disabled', 'true');
    try {
      const res = await fetch('/.netlify/functions/create-preference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: cartPayload(),
          shipping: { destinationCep: lastQuotedCep, optionId: selectedShipping.id },
          buyer,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao iniciar pagamento');

      localStorage.setItem('isotopxs:last-order', data.order_id);
      window.location.href = data.init_point;
    } catch (err) {
      checkoutMsgEl.textContent = `Não foi possível iniciar o pagamento: ${err.message}`;
      checkoutBtn.setAttribute('aria-disabled', 'false');
    }
  }

  // Endereço a partir do CEP (ViaCEP, chamado direto do navegador — liberado no CSP do netlify.toml).
  // Só preenche campo vazio ou que a gente mesmo preencheu antes: nunca apaga o que a pessoa digitou.
  // Se o ViaCEP falhar, nada acontece e a pessoa preenche na mão como antes.
  const CEP_FIELDS = { 'addr-street': 'logradouro', 'addr-district': 'bairro', 'addr-city': 'localidade', 'addr-state': 'uf' };
  const autoFilled = new Set();
  let lastLookupCep = null;

  async function fillAddressFromCep() {
    const cep = (cepInput.value || '').replace(/\D/g, '');
    if (cep.length !== 8 || cep === lastLookupCep) return;
    lastLookupCep = cep;
    const msg = document.getElementById('cep-address-msg');
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { signal: AbortSignal.timeout(6000) });
      const data = await res.json();
      if (cep !== (cepInput.value || '').replace(/\D/g, '')) return; // CEP mudou enquanto buscava
      if (!res.ok || data.erro) {
        msg.textContent = 'Não achamos esse CEP. Confere o número ou preenche o endereço na mão.';
        return;
      }
      let filled = 0;
      for (const [id, key] of Object.entries(CEP_FIELDS)) {
        const input = field(id);
        if (!data[key] || (input.value.trim() && !autoFilled.has(id))) continue;
        input.value = data[key];
        autoFilled.add(id);
        filled += 1;
      }
      msg.textContent = filled ? 'Endereço preenchido pelo CEP. Confere e completa o número.' : '';
    } catch {
      lastLookupCep = null; // deixa tentar de novo
    }
  }

  Object.keys(CEP_FIELDS).forEach((id) => field(id).addEventListener('input', () => autoFilled.delete(id)));
  cepInput.addEventListener('input', fillAddressFromCep);

  quoteBtn.addEventListener('click', quoteShipping);
  checkoutBtn.addEventListener('click', checkout);
  field('buyer-name').closest('.form').addEventListener('input', () => {
    if (checkoutMsgEl.textContent.startsWith('Faltou')) checkoutMsgEl.textContent = '';
  });

  fetch('data/products.json')
    .then((res) => res.json())
    .then((data) => {
      products = data.products.filter((p) => p.active !== false);
      renderProducts();
      renderCart();
    })
    .catch(() => {
      shopGrid.innerHTML = '<p>Não foi possível carregar os produtos agora. Tente recarregar a página.</p>';
    });
});
