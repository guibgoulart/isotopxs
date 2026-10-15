# Stack — ISOTOPXS

Visão rápida de tudo que roda o site hoje, pra referência. Apresentação geral do repo em
[README.md](README.md); os detalhes de configuração de cada peça (env vars, como cada uma foi
escolhida) ficam comentados no próprio arquivo (`.env.example`, `assets/js/analytics.js`,
`netlify/functions/lib/sentry.mjs` etc.) — este arquivo é só o mapa.

## Hosting & deploy

- **Netlify** (plano free), site `isotopxs` — hospeda o site estático e roda as Netlify Functions.
- **Deploy contínuo via GitHub**: push em `master` → Netlify builda (`npm install`) e publica sozinho.
  Repositório: `github.com/guibgoulart/isotopxs`, branch `master` protegida (sem force-push/delete,
  `enforce_admins` ligado).
- **Domínio**: `isotopxs.com.br` (canônico), `isotopxs.com` redireciona pra ele via `netlify.toml`.

## Frontend

- HTML + CSS + JS **puros, sem build step e sem framework** (React/Vue/etc. deliberadamente fora —
  ver justificativa no README). 6 páginas públicas: `index`, `musica`, `release`, `shows`, `loja`,
  `checkout-status` — mais o painel da banda, `admin.html` (fora da navegação, `noindex`).
- `assets/css/main.css` — todo o visual. `assets/js/main.js` — nav, scroll-reveal, tabs, áudio.
- `assets/js/cart-widget.js` — carrinho no topo direito de todas as páginas (ícone + contador +
  prévia dos itens). Lê o mesmo `localStorage` da loja; quantidade e frete se ajustam no carrinho
  completo em `loja.html#cart`.

## Backend

- **Netlify Functions** (`netlify/functions/`, formato v2/ESM, bundler `esbuild`) — único código de
  servidor do projeto, existe só porque pagamento não pode rodar no navegador:
  - `shipping-quote.mjs` — cotação de frete pro carrinho atual.
  - `create-preference.mjs` — valida carrinho+frete+dados de entrega no servidor, cria a preference
    no Mercado Pago.
  - `mp-webhook.mjs` — recebe confirmação de pagamento, dispara os avisos (cliente + banda) uma vez
    só por pedido, e cria o envio automático só quando existir integração real com a Loggi.
  - `order-status.mjs` — status do pedido (usado por `checkout-status.html`). Público, então não
    devolve dado pessoal (nome, e-mail, telefone, endereço).
  - `admin-session.mjs` / `admin-orders.mjs` — login e API do painel de pedidos (ver abaixo).
- **Netlify Blobs** (`@netlify/blobs`) — armazena os pedidos (`lib/orders-store.mjs`). Sem banco de
  dados externo. Leitura com consistência **strong** (`lib/blob-store.mjs`): a padrão (eventual, via
  cache de borda) devolvia versão velha logo depois de uma escrita e travava a claim de envio de
  todo pedido pago — bug real visto em produção, corrigido em 2026-10.
- **Rate limiting** nativo da Netlify em `shipping-quote` (20/min/IP) e `create-preference`
  (10/min/IP) — plano free só permite 2 regras por projeto.

## Pagamento & frete

- **Mercado Pago (Checkout Pro)** — único meio de pagamento. Preço e frete sempre recalculados no
  servidor a partir de `data/products.json`, nunca confiando no navegador.
- **Frete**: cotação real pelo **Melhor Envio** (`lib/shipping.js`, `MELHOR_ENVIO_TOKEN`) — preço e
  prazo das etiquetas de verdade, a partir do peso/medidas de `data/products.json` e do
  `ORIGIN_CEP`. Em produção: Correios (PAC, SEDEX, Mini Envios) + Loggi (Express, Ponto), via `MELHOR_ENVIO_SERVICES`, e o
  prazo mostrado soma `SHIPPING_HANDLING_DAYS` (padrão 2) pra banda postar. Sem token, cai no mock.
  Sempre tem também a opção **Retirada em Porto Alegre** (grátis, combinar com o Deo pelo
  (51) 98145-4073 — `PICKUP_OPTION` em `lib/shipping.js`): nela o checkout não pede endereço e a
  cobrança no Mercado Pago não leva linha de frete.
  O envio é **manual**: a banda compra a etiqueta no painel do Melhor Envio, posta na agência e
  coloca transportadora + código de rastreio no painel. O checkout coleta endereço completo e
  telefone justamente pra isso.

## Painel de pedidos (`admin.html`)

- Lista todos os pedidos (filtros: a enviar, enviados, entregues, aguardando pagamento,
  cancelados/recusados; busca por nome, e-mail, cidade, nº), detalhe com itens, cliente, endereço
  (botão de copiar pra etiqueta) e formulário de envio: status, transportadora, código e link de
  rastreio, notas internas. Link direto pra um pedido: `admin.html#pedido=<id>` (é o link que vai
  nos avisos da banda).
- **Status**: `pending` → `paid` (a enviar) → `shipped` → `delivered`, mais `failed`/`cancelled`.
  Colocar código de rastreio num pedido pago já marca como enviado. Depois que o pedido sai de
  pending/failed, notificação atrasada do Mercado Pago não mexe mais no status (o cru da MP fica em
  `payment_status`).
- **Acesso**: uma senha compartilhada (`ADMIN_PASSWORD`, mín. 12) troca por cookie de sessão
  assinado com HMAC (`ADMIN_SESSION_SECRET`), `HttpOnly; Secure; SameSite=Strict`, 7 dias. Trocar a
  senha derruba todas as sessões. Sem as duas env vars o painel fica fechado. 10 senhas erradas do
  mesmo IP em 15 min bloqueiam o login por 15 min (contador no Blobs, IP guardado só como hash — não
  dá pra usar o rate limit da Netlify, as 2 regras do plano free já estão em uso).
- A página não carrega PostHog nem Sentry (mostra dado pessoal de cliente).

## Avisos (e-mail e WhatsApp)

- **Cliente** (via [Resend](https://resend.com), `lib/email.mjs`): "pedido confirmado" quando o
  pagamento é aprovado; "pedido enviado" (com rastreio, se tiver) quando a banda marca como enviado
  no painel — e de novo se o código de rastreio mudar depois. Configurar: `RESEND_API_KEY`,
  `RESEND_FROM_EMAIL`, opcional `EMAIL_REPLY_TO`. **Pré-requisito**: verificar o domínio
  `isotopxs.com.br` no Resend (Domains → Add → criar os registros DNS que ele pede). Sem isso o
  Resend só manda pro e-mail da própria conta.
- **Banda**, a cada pedido pago: e-mail completo (itens, cliente, endereço, link do painel) pra
  `BAND_NOTIFY_EMAILS`, e WhatsApp curto (itens, total, cidade, link do painel — sem e-mail, telefone
  nem endereço do cliente, porque passa por serviço de terceiro) via
  [CallMeBot](https://www.callmebot.com/blog/free-api-whatsapp-messages/) pra `BAND_NOTIFY_WHATSAPP`.
  Cada pessoa ativa o próprio número uma vez: salva o contato do bot (+34 621 34 22 27, confira o
  número atual no site deles), manda "I allow callmebot to send me messages" e recebe uma apikey; o
  par `55DDDNUMERO:apikey` entra na env var.
- Best-effort: falha de aviso vai pro log/Sentry e nunca derruba pagamento nem painel. O resultado
  de cada canal fica gravado no pedido e aparece no painel. Header `Idempotency-Key` no Resend +
  claim no pedido evitam e-mail duplicado quando o Mercado Pago repete a notificação.
- O painel mostra um alerta no topo quando e-mail ou alertas da banda não estão configurados.

## Dados

- `data/products.json` — catálogo (fonte de verdade também pro backend), com produtos e preços reais
  desde 2026-10-13. Desde 2026-10-14 só camiseta e CD à venda (adesivo, pôster e kit com
  `active: false`); `image`/`image_fit` dão a foto do card na loja. Pesos/dimensões são estimativas — conferir com o pacote real (o frete é cotado com eles).

## Analytics

- **PostHog** (`assets/js/analytics.js`, região US) — pageviews, eventos, funil, retenção. Ativo em
  produção desde 2026-08-25.

## Observabilidade / error tracking

- **Sentry — backend** (`netlify/functions/lib/sentry.mjs`) — reporta erros das 4 Netlify Functions
  via chamada HTTP direta à API do Sentry (sem SDK, pra não pesar o bundle). Cobre tanto os pontos
  que já tratavam erro (falha do Mercado Pago, falha de frete, falha ao criar envio) quanto exceções
  não previstas (wrapper `withErrorReporting`). Dorme sem `SENTRY_DSN` configurado.
- **Sentry — frontend** — loader oficial (`js.sentry-cdn.com`) no `<head>` das 6 páginas, captura
  exceções de JS no navegador. Ativo em produção desde 2026-08-25, testado ponta a ponta (evento de
  teste entregue, HTTP 200). CSP libera só os 3 hosts necessários (loader, bundle real, ingest —
  ver `netlify.toml`), sem wildcard.
- **Notificação de deploy da Netlify (e-mail)**: descartada — é recurso do plano **Pro** (pago); o
  plano free não oferece, nem via API.
- **Uptime monitoring**: configurado (serviço externo escolhido pela banda, fora do repositório).
- Fora isso, os logs de function ficam disponíveis no painel da Netlify (Functions → logs), sem
  retenção longa nem alerta automático.

## Segurança

- CSP, `X-Frame-Options: DENY`, HSTS e afins em todo o site (`netlify.toml`).
- Segredos só em variáveis de ambiente (Netlify: `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`,
  `ORIGIN_CEP`, `SITE_URL`, `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`, `RESEND_API_KEY`,
  `BAND_NOTIFY_WHATSAPP`, `MELHOR_ENVIO_TOKEN`; `SENTRY_DSN`), nunca commitados.
- Webhook do Mercado Pago não confia no corpo da notificação — sempre reconsulta a API deles.

## Testes

- `node --test` (`npm test`) — 75 testes cobrindo precificação, pedidos, claims, webhook, frete, CEP,
  dados de entrega, sessão/login do painel, edição de pedido e avisos (e-mail/WhatsApp com `fetch`
  falso — nenhum teste bate em API de verdade) (`test/*.test.mjs`). Sem CI configurado ainda — roda
  só localmente/manual antes de deploy.

## O que falta pra "produção de verdade" (loja)

- `MP_ACCESS_TOKEN` de produção já configurado (`APP_USR-...`, real) desde 2026-08-25.
- Loja reaberta e catálogo real desde 2026-10-13; primeira compra real de teste aprovada.
- Configurado na Netlify em 2026-10-14: painel, Resend (domínio isotopxs.com.br), Sentry/PostHog do
  backend e Melhor Envio. Falta `BAND_NOTIFY_EMAILS` (quem da banda recebe o aviso de pedido novo).
- Fotos reais dos produtos na vitrine (hoje só o nome no lugar da foto).
