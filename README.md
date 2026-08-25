# ISOTOPXS — site oficial

Site oficial da banda: home, música, release, shows e uma loja própria com checkout de verdade.
Visão geral da stack completa (hosting, analytics, observabilidade etc.) em [STACK.md](STACK.md).

## sobre

Estático de propósito — HTML + CSS + JS puros, sem build step e sem framework. É o que existe de
mais leve, mais barato de hospedar e mais fácil de qualquer pessoa da banda editar (abre o `.html`
num editor de texto, mexe, salva, sobe). A única exceção é a loja: pagamento não pode rodar no
navegador, então esse pedaço passa por um punhado de Netlify Functions.

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
│  ├─ css/main.css       → todo o visual (cores, fontes, efeitos, animações)
│  ├─ js/main.js         → nav ao rolar, scroll-reveal, contadores, tabs, toggle de áudio
│  ├─ js/loja.js         → carrinho, cotação de frete, checkout
│  ├─ js/analytics.js    → PostHog
│  └─ img/               → logo, fotos da banda e do público
└─ test/                 → suíte de testes da loja (node --test)
```

## a loja

Nada de Shopify/Nuvemshop/Loja Integrada: loja própria, sem mensalidade de plataforma. O front-end
continua 100% estático — `loja.html` lê o catálogo (`data/products.json`) e monta o carrinho em JS
puro — e só pagamento e frete passam pelas Netlify Functions:

- `shipping-quote` cota o frete pro carrinho atual.
- `create-preference` revalida carrinho e frete no servidor (nunca confia no navegador) e cria a
  cobrança no Mercado Pago.
- `mp-webhook` recebe a confirmação de pagamento e aciona o envio.
- `order-status` alimenta a página de retorno do checkout.

Pagamento via **Mercado Pago (Checkout Pro)**; frete com abstração pronta pra Loggi (hoje em modo
simulado, plugável assim que a banda fechar com a transportadora).

## analytics & observabilidade

- **PostHog** — pageviews, eventos, funil, retenção.
- **Sentry** — erros de frontend (JS no navegador) e das Netlify Functions da loja.
- **Uptime monitoring** — alerta se o site cair.

## segurança

- Preço e frete nunca vêm do navegador — `create-preference` recalcula tudo no servidor a partir de
  `data/products.json` e de uma cotação de frete nova.
- O webhook do Mercado Pago não confia no corpo da notificação — busca o pagamento de verdade na
  API deles com nosso próprio token.
- Content-Security-Policy, `X-Frame-Options: DENY`, HSTS e afins em todo o site (`netlify.toml`).
- Rate limiting em `shipping-quote` e `create-preference`.
- Segredos só em variáveis de ambiente, nunca commitados.
- Branch `master` protegida no GitHub (sem force-push/delete, valendo até pra admin).

## sobre a estética

Linha visual: maximalista, violenta, alto contraste — site de banda, não nostalgia retrô. Paleta preto /
branco-osso / vermelho vibrante (verde-limão só como pontinho raro de acento). Três fontes fazem o trabalho
pesado: **Rubik Beastly** (só no wordmark gigante do hero — serrilhada, quase uma arma), **Big Shoulders
Stencil Display** (títulos, nav, botões, ticker — corte de stencil militar/rua, não é "fonte de Impact/meme"),
e **Barlow Condensed** pro corpo de texto. O wordmark do hero tem uma distorção estática (filtro SVG de
turbulência + sombra dupla vermelho/ciano, tipo impressão de serigrafia desalinhada) — de propósito **sem
nenhuma animação de tremor/glitch**, porque isso não pegou bem no teste. Sensação de movimento vem só de coisas
que não cansam o olho: ticker duplo cruzando em direções opostas, hover que "preenche" de cor ou faz o elemento
"afundar" com sombra sólida deslocada (tipo cartaz serigrafado, sem blur), scroll-reveal, contador animado.
Grão de filme e scanline por cima de tudo — ambos propositalmente mais fortes que o normal.

## desenvolvimento local

```
npm install   # netlify-cli + @netlify/blobs — não afeta o front-end
npm run dev   # netlify dev, site + functions em http://localhost:8888
npm test      # node --test — suíte da loja (precificação, pedidos, webhook, frete)
```

Variáveis de ambiente de exemplo em `.env.example`.
