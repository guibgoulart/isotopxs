// Acesso ao Netlify Blobs com leitura "strong". Por padrão o Blobs lê via cache de borda
// (consistência eventual, até ~60s de atraso) — reler logo depois de escrever pode devolver a versão
// antiga. Isso quebrava o lock otimista de orders-store (toda claim de envio ficava presa). Strong lê
// direto da origem. Fallback pra eventual só se o ambiente não expuser a URL sem cache (não deveria
// acontecer em Functions nem no `netlify dev`) — melhor degradar do que derrubar o checkout inteiro.
import { getStore } from '@netlify/blobs';

let strongUnavailable = false;

export async function withStore(name, fn) {
  const open = () => getStore(strongUnavailable ? name : { name, consistency: 'strong' });
  try {
    return await fn(open());
  } catch (err) {
    if (err && err.name === 'BlobsConsistencyError' && !strongUnavailable) {
      console.warn('blob-store: leitura strong indisponível neste ambiente — caindo pra eventual');
      strongUnavailable = true;
      return fn(open());
    }
    throw err;
  }
}
