# ISOTOPXS — site oficial

Site oficial da banda: home, música, release, shows e uma loja própria com checkout de verdade.
Visão geral da stack completa em [STACK.md](STACK.md).

## sobre

Estático — HTML + CSS + JS puros, sem build step, sem framework. Fácil de editar direto no `.html`.
Exceção: pagamento não roda no navegador, então a loja usa Netlify Functions.

## estrutura

```
isotopxs-site/
├─ index.html            → home
├─ musica.html           → faixas + letras (tabs)
├─ release.html          → texto de imprensa + stage plot + rider
├─ shows.html            → contato de booking + histórico de shows
├─ loja.html             → vitrine + carrinho + checkout
├─ checkout-status.html  → página de retorno do pagamento
├─ data/products.json    → catálogo da loja (nome, preço, peso)
├─ netlify/functions/    → backend da loja (pagamento, frete, pedidos)
├─ assets/
│  ├─ css/main.css       → todo o visual
│  ├─ js/main.js         → nav ao rolar, scroll-reveal, contadores, tabs, toggle de áudio
│  ├─ js/loja.js         → carrinho, cotação de frete, checkout
│  ├─ js/analytics.js    → PostHog
│  └─ img/               → logo, fotos da banda e do público
└─ test/                 → suíte de testes da loja (node --test)
```

## a loja

`loja.html` monta o carrinho em JS puro a partir de `data/products.json`. Pagamento e frete passam
pelas Netlify Functions:

- `shipping-quote` — cotação de frete.
- `create-preference` — revalida carrinho e frete no servidor, cria a cobrança no Mercado Pago.
- `mp-webhook` — confirma pagamento, aciona o envio.
- `order-status` — status do pedido pra página de retorno.

Pagamento via Mercado Pago (Checkout Pro), frete via Loggi.

## analytics & observabilidade

- **PostHog** — pageviews, eventos, funil, retenção.
- **Sentry** — erros de frontend e das Netlify Functions da loja.
- **Uptime monitoring**.

## segurança

- Preço e frete nunca vêm do navegador — `create-preference` recalcula tudo no servidor.
- Webhook do Mercado Pago não confia no corpo da notificação — busca o pagamento na API deles.
- CSP, `X-Frame-Options: DENY`, HSTS em todo o site (`netlify.toml`).
- Rate limiting em `shipping-quote` e `create-preference`.
- Segredos só em variáveis de ambiente, nunca commitados.
- Branch `master` protegida no GitHub.

## desenvolvimento local

```
npm install
npm run dev   # site + functions em http://localhost:8888
npm test
```

Variáveis de ambiente de exemplo em `.env.example`.
