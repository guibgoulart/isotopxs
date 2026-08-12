# ISOTOPXS — site oficial

Site estático (HTML + CSS + JS puros, sem build step, sem framework) — a única exceção é a loja, que usa
um punhado de Netlify Functions pra pagamento/frete (ver seção "Loja própria" mais abaixo). Escolhido de
propósito: é o que existe de mais leve, mais barato de hospedar e mais fácil de qualquer pessoa da banda
editar (abre o `.html` num editor de texto, mexe, salva, sobe).

## estrutura

```
isotopxs-site/
├─ index.html            → home
├─ musica.html           → faixas + letras (tabs)
├─ release.html          → texto de imprensa + stage plot + rider
├─ shows.html            → contato de booking + histórico de shows
├─ loja.html             → vitrine + carrinho + checkout (Mercado Pago)
├─ checkout-status.html  → página de retorno do pagamento
├─ data/products.json    → catálogo da loja (nome, preço, peso)
├─ netlify/functions/    → backend da loja (ver seção "Loja própria")
├─ assets/
│  ├─ css/main.css       → todo o visual (cores, fontes, efeitos, animações)
│  ├─ js/main.js         → nav ao rolar, scroll-reveal, contadores, tabs, toggle de áudio
│  ├─ js/loja.js          → carrinho, cotação de frete, checkout
│  └─ img/                → colocar aqui logo, fotos da banda etc quando tiver
```

As páginas continuam abrindo direto no navegador sem build. `netlify/functions` só existe porque pagamento
tem que rodar em servidor (nunca no navegador do cliente) — ver `npm run dev` na seção da loja para testar
localmente.

## o que já está pronto vs. o que falta (placeholders)

O layout inteiro já funciona, mas nenhum nome, número ou letra é real — para não confundir "exemplo" com
"informação de verdade", a regra usada foi: **texto corrido = lorem ipsum**, **campo estruturado (nome de show,
produto, data, e-mail etc.) = `[entre colchetes]`**. Nada de nome inventado tipo "banda fictícia" disfarçado de
conteúdo real. Procure por:

- **Tudo entre `[colchetes]`** em todas as páginas — nomes de show, cidades, datas, nomes de produto, e-mail de
  booking, redes sociais, formação, influências. É a lista do que precisa ser preenchido.
- **Faixas e letras** em `musica.html` — títulos são "Faixa 01/02/03/04" e a letra é lorem ipsum mesmo,
  claramente marcado com "[letra placeholder]". Trocar pelos títulos e letras reais, e colar o player
  (Spotify/YouTube/Bandcamp embed ou `<audio>` com mp3) no lugar do comentário `<!-- EMBED REAL AQUI -->`.
- **Parágrafos de bio/release** — lorem ipsum puro. Escrever o texto real da banda no lugar.
- **Logo** — hoje é só o nome da banda em tipografia grande (fonte Anton) com efeito de blend de cor sobre os
  blobs animados do hero, não uma imagem. Funciona bem e é leve; se vocês tiverem uma arte/logo de verdade,
  salva em `assets/img/logo.png` e eu troco o `.hero__word`/`.pagehero__word` por uma `<img>`.
- **Trilha de fundo** — o botão redondo ▶ no canto já existe e funciona, só não tem áudio ainda. Quando tiver um
  trecho curto (loop de 20-40s costuma bastar), salva em `assets/audio/loop.mp3` e adiciona
  `src="assets/audio/loop.mp3"` na tag `<audio id="bg-audio">` de cada página.

## deploy (recomendado: Netlify)

Netlify é gratuito pro tráfego de um site de banda, publica em segundos e aceita domínio próprio. Passo a passo:

1. Criar uma conta em https://app.netlify.com (dá pra usar login do GitHub).
2. **Opção mais simples (sem git):** na tela inicial da Netlify, arrastar a pasta `isotopxs-site` inteira pra
   área de "Deploy manually". Pronto, já sobe com uma URL tipo `nome-aleatorio.netlify.app`.
3. **Opção recomendada a médio prazo (com git, pra dar pra atualizar por comando):**
   - Criar um repositório no GitHub e subir esta pasta (`git init`, `git add`, `git commit`, `git push`).
   - Na Netlify: "Add new site" → "Import an existing project" → conectar o repositório.
   - Toda vez que alguém der `git push`, o site atualiza sozinho. Não precisa de build command (deixar em branco)
     e o "publish directory" é a raiz (`.`) — o `netlify.toml` já diz onde ficam as functions da loja.
   - Pra loja funcionar em produção, configurar em "Site settings → Environment variables" as mesmas chaves
     de `.env.example` (com valores reais/de teste, nunca o `.env` local) — sem isso o pagamento não funciona,
     mas o resto do site continua no ar normalmente.
4. Em "Site settings" → "Change site name", trocar pra algo como `isotopxs` (fica `isotopxs.netlify.app`
   até vocês registrarem um domínio próprio).

Alternativas equivalentes, caso prefiram: **Vercel**, **GitHub Pages**, **Cloudflare Pages** — todas de graça
pra esse tipo de site, o processo é praticamente o mesmo.

## domínio

Vocês ainda não têm domínio — sugestões de nome pra registrar (checar disponibilidade na hora, ex. Registro.br
pra `.com.br` ou Namecheap/Cloudflare pra internacional):

- `isotopxs.com` / `isotopxs.com.br` — a opção mais "oficial", sempre boa escolha.
- `isotopxs.band` — TLD `.band` existe especificamente pra bandas, curto e direto.
- `isotopxs.rip` — TLD `.rip` é usada por várias bandas de metal (combina com o clima "morte/contaminação"),
  e costuma ser mais barata.

Preço médio: `.com.br` gira em torno de R$40/ano (Registro.br); `.com`/`.band`/`.rip` internacional costuma
ficar entre US$10-25/ano. Depois de registrar, é só apontar o DNS pra Netlify (ela mostra o passo a passo
exato na aba "Domain settings" assim que vocês adicionarem o domínio).

## Loja própria (Mercado Pago + Loggi)

Nada de Shopify/Nuvemshop/Loja Integrada: a loja é própria, sem mensalidade de plataforma nenhuma. O site
continua 100% estático (`loja.html` lê o catálogo e monta o carrinho em JS puro), e só o pagamento e o frete
passam por um punhado de **Netlify Functions** (`netlify/functions/`) — a única parte do projeto que roda
código de servidor.

```
data/products.json           → catálogo (nome, preço, peso) — fonte de verdade também para o backend
netlify/functions/
├─ shipping-quote.mjs         → cota frete (Loggi) pro carrinho atual
├─ create-preference.mjs      → cria a "preference" no Mercado Pago e redireciona pro checkout deles
├─ mp-webhook.mjs             → recebe a confirmação de pagamento e dispara o envio
├─ order-status.mjs           → status do pedido (usado pela página de retorno do checkout)
└─ lib/                        → catálogo, cliente Mercado Pago, pedidos (Netlify Blobs) e frete
   └─ shipping.js              → abstração de frete: hoje roda com uma cotação simulada (mock) realista;
                                  quando a banda tiver um integration_code de homologação da Loggi, é só
                                  preencher as funções `*ViaLoggiApi` com a doc oficial e definir
                                  LOGGI_INTEGRATION_CODE no ambiente — o resto do código não muda.
checkout-status.html          → página de retorno (sucesso/pendente/falha) do Mercado Pago
```

Fluxo: cliente monta o carrinho → calcula frete pelo CEP → clica em comprar → `create-preference` valida
tudo de novo no servidor (nunca confia em preço/frete vindo do navegador), salva o pedido no Netlify Blobs e
redireciona pro checkout hospedado do Mercado Pago → o Mercado Pago paga e chama `mp-webhook` → o webhook
confirma o pagamento e gera o envio (mock por enquanto).

**Rodando localmente:**

1. `npm install` (só instala o `netlify-cli` e o `@netlify/blobs` — não afeta o front-end).
2. Copiar `.env.example` para `.env` e preencher — use um token de **teste** do Mercado Pago
   (`MP_ACCESS_TOKEN=TEST-...`), nunca um token de produção.
3. `npm run dev` (roda `netlify dev`, que serve o site estático **e** as functions juntos em
   `http://localhost:8888`).
4. Para testar o checkout sem nenhuma credencial real, tem um mock da API do Mercado Pago em
   `scripts/mock-mercadopago.js` — rode `node scripts/mock-mercadopago.js` e aponte `MP_API_BASE` no `.env`
   pra URL dele. Quando vocês tiverem credenciais de teste de verdade, é só apagar `MP_API_BASE` do `.env`.

**O que falta pra ir ao ar de verdade** (fora do escopo de código, fica pra quando a banda decidir):
conta na Mercado Pago com credenciais de produção, e — se quiserem sair do frete simulado — fechar com a
Loggi e preencher `lib/shipping.js` com a API real deles. Até lá, os preços em `data/products.json` são
fictícios só pra o checkout funcionar; troquem pelos valores reais antes de divulgar a loja.

## segurança

Isso importa mais pra vocês do que pra banda média — já rolou ataque em outra plataforma antes. O que já
está no código:

- **Preço e frete nunca vêm do navegador.** `create-preference` recalcula tudo a partir de
  `data/products.json` e de uma nova cotação de frete, sempre no servidor.
- **O webhook não confia no corpo da notificação** — busca o pagamento de verdade na API da Mercado Pago
  usando nosso próprio token, e **recusa qualquer notificação sem assinatura válida em produção**
  (`MP_WEBHOOK_SECRET` é obrigatório fora do `netlify dev` — ver `.env.example`).
- **Content-Security-Policy, `X-Frame-Options: DENY`, HSTS e afins** em todo o site (`netlify.toml`) — a
  defesa mais direta contra defacement via XSS (mesmo que uma injeção passe despercebida em algum lugar, o
  CSP impede o script de executar) e contra clickjacking.
- **Rate limiting** em `shipping-quote` e `create-preference` (as duas rotas que um script conseguiria
  martelar sem fricção) — 20 e 10 requisições/minuto por IP. O plano gratuito da Netlify permite só 2 regras
  por projeto, por isso não tem em todas as functions.
- Segredos só em variáveis de ambiente, nunca commitados (`.env` está no `.gitignore`); `.env.example`
  documenta tudo sem valores reais.
- **Branch `master` protegida no GitHub**: force-push e exclusão bloqueados, valendo até pra admin
  (`enforce_admins`) — uma conta comprometida não consegue reescrever histórico nem apagar a branch que o
  Netlify publica automaticamente.

**O que ainda não dá pra resolver por código — e é provavelmente onde mora o maior risco, dado o histórico
de vocês:** esse site publica automaticamente a cada `git push` na `master`. Se a conta do GitHub ou da
Netlify for comprometida, o código mais seguro do mundo não impede um defacement por si só — força-push e
deleção já estão bloqueados, mas um push normal com conteúdo malicioso ainda passa. Prioridades, nessa ordem:

1. **2FA em tudo que consegue publicar ou mexer em dinheiro**: GitHub, Netlify, Mercado Pago, e o
   registrador do domínio (Registro.br ou equivalente) — de preferência com autenticador/chave física, não
   SMS. (2FA de conta pessoal é ativado por cada um de vocês na própria conta — não dá pra verificar nem
   forçar isso pela API do jeito que dá pra branch protection.)
2. Se um dia tiver mais de uma pessoa com push no repositório, adicionar exigência de PR revisado por
   outra pessoa na proteção da `master` (hoje não faz sentido, é só um mantenedor).
3. **Notificação de deploy na Netlify** (Site settings → Notifications) — e-mail a cada publicação. Se
   alguém desfigurar o site, vocês sabem em segundos, não quando um fã avisar.
4. **Rollback**: a Netlify guarda todo deploy anterior — "Deploys" → escolher um anterior → "Publish deploy"
   volta o site ao ar como estava, sem precisar mexer em código. Vale saber que esse botão existe *antes* de
   precisar dele.
5. **Trava do domínio** (registrar lock) no registrador, pra dificultar transferência não autorizada.

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

**Foto do hero:** a imagem em `assets/img/hero-show.png` é a foto de show que vocês mandaram, tratada em
preto-e-branco + duotone vermelho (`filter: grayscale + contrast` + camada `mix-blend-mode: color`) — é
só CSS, o arquivo original continua intacto. **Atenção:** eu não sei se essa foto é de vocês, de um
fotógrafo contratado, ou uma referência de terceiros — antes de colocar o site no ar publicamente, confirmem
que têm o direito de uso dela (ou troquem por uma foto própria/licenciada). Pra trocar, é só sobrescrever esse
arquivo com a foto real da banda no mesmo nome, ou mudar o caminho em `.hero__photo` no `main.css`.
