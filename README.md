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
│  ├─ css/main.css       → todo o visual (cores, fontes, efeitos)
│  ├─ js/main.js         → tabs, contador, livro de visitas, toggle de áudio
│  └─ img/                → colocar aqui logo, fotos da banda etc quando tiver
```

Não tem build, não tem `node_modules`, não tem servidor. É só HTML/CSS/JS abrindo direto no navegador.

## o que já está pronto vs. o que falta (placeholders)

Tudo funciona, mas está preenchido com conteúdo fictício plausível pra você validar o layout. Procure por:

- **Textos entre `[colchetes]`** em `release.html` e `shows.html` — trocar pelos dados reais (cidade, ano,
  formação, e-mail de booking, telefone).
- **Faixas e letras** em `musica.html` — são fictícias, escritas pra soar como a banda mas não são as letras
  de verdade. Trocar pelas letras reais e, quando tiver mixagem, colar o player (Spotify/YouTube/Bandcamp embed
  ou um `<audio>` com o mp3) no lugar do comentário `<!-- EMBED REAL AQUI -->`.
- **Histórico de shows** em `shows.html` — datas/casas/cidades são inventadas, trocar pela agenda real.
- **Logo/fotos** — hoje o "logo" é texto estilizado (fonte Nosifer + efeito glitch em CSS), não uma imagem.
  Funciona bem e é leve, mas se vocês tiverem uma arte/logo de verdade, salva em `assets/img/logo.png` e eu
  troco o `<h1 class="logo">` por uma `<img>`.
- **Trilha de fundo** — o botão "▶ TOCAR TEMA" já existe e funciona, só não tem áudio ainda. Quando tiver um
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

O conceito visual gira em torno do próprio nome da banda: **contaminação radioativa**. Verde tóxico, fita de
perigo (hazard tape) amarelo/preto, textura de ruído/scanline tipo TV velha, tipografia gotejante pro logo
(fonte "Nosifer") combinada com uma fonte de rua/grafite ("Bungee") pros títulos, e uma fonte de terminal
retrô ("VT323") pro corpo do texto — puxando pro visual de site dos anos 2000 (geocities/fã-site), mas com
intenção de design, não bagunça de verdade. Efeitos como o "glitch" no logo, o contador de visitantes falso,
o livro de visitas e o "rastro tóxico" do cursor são só CSS/JS puro, sem nenhuma imagem/gif externo — o que
mantém o site leve mesmo parecendo "sujo".
