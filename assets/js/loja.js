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
  const buyerEmailInput = document.getElementById('buyer-email');
  const buyerNameInput = document.getElementById('buyer-name');
  const checkoutBtn = document.getElementById('checkout-btn');
  const checkoutMsgEl = document.getElementById('checkout-msg');

  let products = [];
  let cart = loadCart();
  let selectedShipping = null; // { id, label, price_cents, eta_business_days }
  let lastQuotedCep = null;

  function cartEntries() {
    return Object.entries(cart)
      .map(([id, qty]) => ({ product: products.find((p) => p.id === id), qty }))
      .filter((e) => e.product && e.qty > 0);
  }

  function cartSubtotalCents() {
    return cartEntries().reduce((sum, e) => sum + e.product.price_cents * e.qty, 0);
  }

  function invalidateShipping(message) {
    selectedShipping = null;
    shippingOptionsEl.innerHTML = '';
    totalRow.hidden = true;
    if (message) shippingMsgEl.textContent = message;
    updateCheckoutAvailability();
  }

  function updateCheckoutAvailability() {
    const hasItems = cartEntries().length > 0;
    const hasShipping = Boolean(selectedShipping);
    const hasEmail = buyerEmailInput.value.trim().length > 3;
    checkoutBtn.setAttribute('aria-disabled', String(!(hasItems && hasShipping && hasEmail)));
  }

  function setQty(id, qty) {
    if (qty <= 0) {
      delete cart[id];
    } else {
      cart[id] = Math.min(qty, 20);
    }
    saveCart(cart);
    invalidateShipping('O carrinho mudou — calcule o frete de novo.');
    renderCart();
  }

  function renderProducts() {
    shopGrid.innerHTML = '';
    products.forEach((product) => {
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `
        <span class="tag">Loja</span>
        <div class="thumb">${escapeHtml(product.thumb_label)}</div>
        <h3>${escapeHtml(product.name)}</h3>
        <div class="price">${formatBRL(product.price_cents)}</div>
        <button type="button" class="btn btn--dark cart-add" style="margin-top:14px;"><span>Adicionar ao carrinho</span></button>
      `;
      card.querySelector('.cart-add').addEventListener('click', () => {
        setQty(product.id, (cart[product.id] || 0) + 1);
      });
      shopGrid.appendChild(card);
    });
  }

  function renderCart() {
    const entries = cartEntries();
    cartItemsEl.innerHTML = '';
    cartEmptyEl.hidden = entries.length > 0;
    cartItemsEl.hidden = entries.length === 0;

    entries.forEach(({ product, qty }) => {
      const row = document.createElement('div');
      row.className = 'cart-row';
      row.innerHTML = `
        <span class="cart-row__name">${escapeHtml(product.name)}</span>
        <span class="cart-row__qty">
          <button type="button" class="qty-btn" data-delta="-1" aria-label="Diminuir quantidade">−</button>
          <span class="qty-num">${qty}</span>
          <button type="button" class="qty-btn" data-delta="1" aria-label="Aumentar quantidade">+</button>
        </span>
        <span class="cart-row__price">${formatBRL(product.price_cents * qty)}</span>
        <button type="button" class="cart-row__remove" aria-label="Remover item">×</button>
      `;
      row.querySelector('[data-delta="-1"]').addEventListener('click', () => setQty(product.id, qty - 1));
      row.querySelector('[data-delta="1"]').addEventListener('click', () => setQty(product.id, qty + 1));
      row.querySelector('.cart-row__remove').addEventListener('click', () => setQty(product.id, 0));
      cartItemsEl.appendChild(row);
    });

    cartSubtotalEl.textContent = formatBRL(cartSubtotalCents());
    updateCheckoutAvailability();
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
          <small>até ${Number(opt.eta_business_days) || 0} dia(s) útil(eis) — ${formatBRL(opt.price_cents)}</small>
        </span>
      `;
      label.querySelector('input').addEventListener('change', () => {
        selectedShipping = opt;
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

    shippingMsgEl.textContent = 'Calculando frete…';
    quoteBtn.setAttribute('aria-disabled', 'true');
    try {
      const res = await fetch('/.netlify/functions/shipping-quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destinationCep: cep,
          items: cartEntries().map((e) => ({ id: e.product.id, qty: e.qty })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao calcular frete');

      lastQuotedCep = cep;
      shippingMsgEl.textContent = '';
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

    checkoutMsgEl.textContent = 'Redirecionando para o pagamento…';
    checkoutBtn.setAttribute('aria-disabled', 'true');
    try {
      const res = await fetch('/.netlify/functions/create-preference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: cartEntries().map((e) => ({ id: e.product.id, qty: e.qty })),
          shipping: { destinationCep: lastQuotedCep, optionId: selectedShipping.id },
          buyer: { email: buyerEmailInput.value.trim(), name: buyerNameInput.value.trim() },
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

  quoteBtn.addEventListener('click', quoteShipping);
  checkoutBtn.addEventListener('click', checkout);
  buyerEmailInput.addEventListener('input', updateCheckoutAvailability);

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
