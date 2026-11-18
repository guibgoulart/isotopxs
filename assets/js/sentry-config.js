// Config do Sentry no navegador. Precisa carregar ANTES do loader (js.sentry-cdn.com): o loader chama
// window.sentryOnLoad quando o SDK sobe e junta estas opções com as do projeto (DSN etc.). Fica num
// arquivo porque o CSP não deixa <script> inline.
//
// O SDK já ignora "Script error." puro. Mas quando um script injetado (navegador do Instagram no
// iPhone, extensão) repassa o ErrorEvent inteiro pro window.onerror, o Sentry monta a mensagem
// "Event `ErrorEvent` captured as exception with message `Script error.`", que escapa do filtro
// padrão. Não tem frame nem detalhe nenhum: o navegador escondeu tudo porque o erro veio de outra
// origem, e nossos scripts são da mesma origem ou carregam com crossorigin. Não é erro do site.
window.sentryOnLoad = function () {
  Sentry.init({
    ignoreErrors: [/captured as exception with message `Script error\.?`/],
  });
};
