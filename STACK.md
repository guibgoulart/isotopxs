# Stack — ISOTOPXS

Visão rápida de tudo que roda o site hoje, pra referência. Os detalhes de cada peça (como configurar,
por que foi escolhida) estão no [README](README.md); este arquivo é só o mapa.

## Hosting & deploy

- **Netlify** (plano free), site `isotopxs` — hospeda o site estático e roda as Netlify Functions.
- **Deploy contínuo via GitHub**: push em `master` → Netlify builda (`npm install`) e publica sozinho.
  Repositório: `github.com/guibgoulart/isotopxs`, branch `master` protegida (sem force-push/delete,
  `enforce_admins` ligado).
- **Domínio**: `isotopxs.com.br` (canônico), `isotopxs.com` redireciona pra ele via `netlify.toml`.

## Frontend

- HTML + CSS + JS **puros, sem build step e sem framework** (React/Vue/etc. deliberadamente fora —
  ver justificativa no README). 6 páginas: `index`, `musica`, `release`, `shows`, `loja`,
  `checkout-status`.
- `assets/css/main.css` — todo o visual. `assets/js/main.js` — nav, scroll-reveal, tabs, áudio.

## Backend

- **Netlify Functions** (`netlify/functions/`, formato v2/ESM, bundler `esbuild`) — único código de
  servidor do projeto, existe só porque pagamento não pode rodar no navegador:
  - `shipping-quote.mjs` — cotação de frete pro carrinho atual.
  - `create-preference.mjs` — valida carrinho+frete no servidor, cria a preference no Mercado Pago.
  - `mp-webhook.mjs` — recebe confirmação de pagamento, aciona criação do envio.
  - `order-status.mjs` — status do pedido (usado por `checkout-status.html`).
- **Netlify Blobs** (`@netlify/blobs`) — armazena os pedidos (`lib/orders-store.mjs`). Sem banco de
  dados externo.
- **Rate limiting** nativo da Netlify em `shipping-quote` (20/min/IP) e `create-preference`
  (10/min/IP) — plano free só permite 2 regras por projeto.

## Pagamento & frete

- **Mercado Pago (Checkout Pro)** — único meio de pagamento. Preço e frete sempre recalculados no
  servidor a partir de `data/products.json`, nunca confiando no navegador.
- **Frete**: abstração pronta pra Loggi (`lib/shipping.js`), mas hoje roda 100% em modo mock/simulado
  — falta `LOGGI_INTEGRATION_CODE` (conta real com a Loggi ainda não fechada).

## Dados

- `data/products.json` — catálogo (fonte de verdade também pro backend). Hoje com produtos/preços
  fictícios (placeholder), pendente de dados reais antes de reabrir a loja.

## Analytics

- **PostHog** (`assets/js/analytics.js`, região US) — pageviews, eventos, funil, retenção. Ativo em
  produção desde 2026-08-25.

## Observabilidade / error tracking

- **Sentry** (`netlify/functions/lib/sentry.mjs`) — reporta erros das 4 Netlify Functions via
  chamada HTTP direta à API do Sentry (sem SDK, pra não pesar o bundle). Cobre tanto os pontos que já
  tratavam erro (falha do Mercado Pago, falha de frete, falha ao criar envio) quanto exceções não
  previstas (wrapper `withErrorReporting`). Dorme sem `SENTRY_DSN` configurado.
- **Notificação de deploy da Netlify (e-mail)**: indisponível — é recurso do plano **Pro** (pago);
  o plano free não oferece. Alternativa gratuita: webhook HTTP de deploy (`Emails and webhooks` →
  `HTTP POST request`) apontado pra algum serviço que a banda já use (Discord/Slack), se quiserem.
- **Uptime monitoring** (site cair): ainda não configurado — depende de um serviço externo (ex.
  UptimeRobot, Better Uptime) que só a própria banda pode criar conta.
- Fora isso, os logs de function ficam disponíveis no painel da Netlify (Functions → logs), sem
  retenção longa nem alerta automático.

## Segurança

- CSP, `X-Frame-Options: DENY`, HSTS e afins em todo o site (`netlify.toml`).
- Segredos só em variáveis de ambiente (Netlify: `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`,
  `ORIGIN_CEP`, `SITE_URL`; `SENTRY_DSN` quando configurado), nunca commitados.
- Webhook do Mercado Pago não confia no corpo da notificação — sempre reconsulta a API deles.

## Testes

- `node --test` (`npm test`) — 25 testes cobrindo precificação, pedidos, webhook, frete e CEP
  (`test/*.test.mjs`). Sem CI configurado ainda — roda só localmente/manual antes de deploy.

## O que falta pra "produção de verdade" (loja)

- Dados reais em `data/products.json` (nomes, preços, pesos, fotos).
- Confirmar se `MP_ACCESS_TOKEN` de produção é token real (`APP_USR-...`) ou ainda de teste.
- Loggi real (ou aceitar frete simulado por enquanto, avisando o cliente).
- Reativar `loja.html` e os links de navegação (hoje fora do ar a pedido da banda).
