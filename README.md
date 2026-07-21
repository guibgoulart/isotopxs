# ISOTOPXS — site oficial

Site estático (HTML + CSS + JS puros, sem build step, sem framework, sem dependências de npm).
Escolhido de propósito: é o que existe de mais leve, mais barato de hospedar e mais fácil de qualquer
pessoa da banda editar (abre o `.html` num editor de texto, mexe, salva, sobe).

## estrutura

```
isotopxs-site/
├─ index.html          → home
├─ musica.html          → faixas + letras (tabs)
├─ release.html         → texto de imprensa + stage plot + rider
├─ shows.html           → contato de booking + histórico de shows
├─ loja.html             → vitrine + ponto de integração Shopify
├─ assets/
│  ├─ css/main.css       → todo o visual (cores, fontes, efeitos, animações)
│  ├─ js/main.js         → nav ao rolar, scroll-reveal, contadores, tabs, toggle de áudio
│  └─ img/                → colocar aqui logo, fotos da banda etc quando tiver
```

Não tem build, não tem `node_modules`, não tem servidor. É só HTML/CSS/JS abrindo direto no navegador.

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
     e o "publish directory" é a raiz (`.`).
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

## Shopify (loja)

Vocês ainda não têm conta. Quando forem criar:

1. Criar conta em https://www.shopify.com (tem trial gratuito).
2. Cadastrar os produtos (camiseta, moletom, vinil, adesivo — os mesmos que já estão como placeholder em
   `loja.html`), com fotos e preços reais.
3. Dentro do admin da Shopify: **Vendas em canais → Buy Button → escolher o produto → "Create Buy Button"**.
   Isso gera um trecho de `<script>` pronto.
4. Colar esse script no lugar do comentário dentro de `#shopify-buy-target` em `loja.html` (já deixei o passo
   a passo comentado direto no arquivo).
5. O Buy Button abre um checkout seguro hospedado pela própria Shopify (PCI compliance, pagamento, tudo cuidado
   por eles) — mas a vitrine continua 100% com a cara suja da ISOTOPXS, sem trocar de layout.

Essa é a integração mais leve possível: não precisa de loja "headless", não precisa de framework, não precisa
pagar taxa de app extra — só o plano Shopify em si (o mais barato já libera Buy Button).

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
