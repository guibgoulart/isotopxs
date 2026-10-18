/* ISOTOPXS — carrinho no topo da navegação, em todas as páginas: ícone com contador e uma prévia
   dos itens com subtotal e atalho pra finalizar. Só leitura — quantidade e frete se ajustam no
   carrinho completo (loja.html#cart). O estado é o mesmo localStorage que loja.js usa; loja.js e
   checkout-status.js avisam mudanças com o evento 'isotopxs:cart-changed', e o evento 'storage'
   cobre outras abas. */
(function () {
  const CART_KEY = 'isotopxs:cart';
  const onShopPage = Boolean(document.getElementById('cart') && document.getElementById('shop-grid'));

  function readCart() {
    try {
      return JSON.parse(localStorage.getItem(CART_KEY)) || {};
    } catch {
      return {};
    }
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function formatBRL(cents) {
    return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  // Catálogo só é buscado se tiver algo no carrinho — páginas sem carrinho não pagam esse fetch.
  let products = null;
  let loadingProducts = null;
  function loadProducts() {
    if (!loadingProducts) {
      loadingProducts = fetch('data/products.json')
        .then((res) => res.json())
        .then((data) => { products = data.products.filter((p) => p.active !== false); })
        .catch(() => { loadingProducts = null; });
    }
    return loadingProducts;
  }

  // Chave "id" ou "id:tamanho" (mesmo formato de loja.js). Ignora o que não existe mais no
  // catálogo ou não tem tamanho válido (carrinho antigo salvo no navegador).
  function entries(cart) {
    return Object.entries(cart)
      .map(([key, qty]) => {
        const [id, size = null] = key.split(':');
        return { product: (products || []).find((p) => p.id === id), size, qty: Number(qty) || 0 };
      })
      .filter((e) => e.product && e.qty > 0
        && (Array.isArray(e.product.sizes) ? e.product.sizes.includes(e.size) : !e.size));
  }

  document.addEventListener('DOMContentLoaded', () => {
    const nav = document.querySelector('.nav');
    if (!nav) return;

    const root = document.createElement('div');
    root.className = 'nav-cart';
    root.hidden = true; // só aparece quando tiver algo no carrinho
    root.innerHTML = `
      <button type="button" class="nav-cart__btn" aria-expanded="false" aria-controls="nav-cart-panel" aria-label="Carrinho">
        <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
          <path d="M2.5 4h2.6l2.4 10.3a1 1 0 0 0 1 .7h8.8a1 1 0 0 0 1-.7L20.5 7H6"/>
          <circle cx="9.5" cy="19.5" r="1.5"/><circle cx="17" cy="19.5" r="1.5"/>
        </svg>
        <span class="nav-cart__count" hidden></span>
      </button>
      <div class="nav-cart__panel" id="nav-cart-panel" hidden></div>
      <p class="sr-only" aria-live="polite"></p>`;
    nav.insertBefore(root, nav.querySelector('.nav__toggle'));

    const button = root.querySelector('.nav-cart__btn');
    const badge = root.querySelector('.nav-cart__count');
    const panel = root.querySelector('.nav-cart__panel');
    const live = root.querySelector('[aria-live]');
    let lastCount = null;

    function renderPanel(list, count, subtotal) {
      if (!count) {
        panel.innerHTML = `
          <p class="nav-cart__title">Seu carrinho está vazio</p>
          <a class="nav-cart__link" href="loja.html">Ver a loja</a>`;
        return;
      }
      panel.innerHTML = `
        <p class="nav-cart__title">Seu carrinho <span>${count} ${count === 1 ? 'item' : 'itens'}</span></p>
        <ul class="nav-cart__list">
          ${list.map(({ product, size, qty }) => `
            <li class="nav-cart__row">
              <span class="nav-cart__name">${escapeHtml(size ? `${product.name} (tamanho ${size})` : product.name)}<small>${qty} × ${formatBRL(product.price_cents)}</small></span>
              <strong>${formatBRL(product.price_cents * qty)}</strong>
            </li>`).join('')}
        </ul>
        <p class="nav-cart__subtotal"><span>Subtotal</span><strong>${formatBRL(subtotal)}</strong></p>
        <p class="nav-cart__note">Frete calculado na finalização.</p>
        <a class="btn btn--dark nav-cart__checkout" href="loja.html#cart"><span>Finalizar compra</span></a>`;
    }

    async function render() {
      const cart = readCart();
      if (Object.keys(cart).length && !products) await loadProducts();
      const list = entries(cart);
      const count = list.reduce((sum, e) => sum + e.qty, 0);
      const subtotal = list.reduce((sum, e) => sum + e.product.price_cents * e.qty, 0);

      root.hidden = count === 0;
      if (!count) setOpen(false);
      badge.hidden = count === 0;
      badge.textContent = count > 99 ? '99+' : String(count);
      button.setAttribute('aria-label', count ? `Carrinho: ${count} ${count === 1 ? 'item' : 'itens'}, ${formatBRL(subtotal)}` : 'Carrinho vazio');

      if (lastCount !== null && count > lastCount) {
        live.textContent = `Adicionado ao carrinho. Agora são ${count} ${count === 1 ? 'item' : 'itens'}.`;
        badge.classList.remove('is-bump');
        void badge.offsetWidth; // reinicia a animação
        badge.classList.add('is-bump');
      }
      lastCount = count;
      renderPanel(list, count, subtotal);
    }

    function setOpen(open) {
      panel.hidden = !open;
      button.setAttribute('aria-expanded', String(open));
    }

    button.addEventListener('click', () => setOpen(panel.hidden));

    document.addEventListener('click', (e) => {
      if (!panel.hidden && !root.contains(e.target)) setOpen(false);
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !panel.hidden) {
        setOpen(false);
        button.focus();
      }
    });

    // Na própria loja, "Finalizar compra" só rola até o carrinho completo.
    panel.addEventListener('click', (e) => {
      const link = e.target.closest('.nav-cart__checkout');
      if (!link || !onShopPage) return;
      e.preventDefault();
      setOpen(false);
      document.getElementById('cart').scrollIntoView({ behavior: 'smooth', block: 'start' });
      history.replaceState(null, '', '#cart');
    });

    window.addEventListener('isotopxs:cart-changed', render);
    window.addEventListener('storage', (e) => { if (e.key === CART_KEY) render(); });

    render();
  });
})();
