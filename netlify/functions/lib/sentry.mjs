// Observabilidade básica: reporta erros pro Sentry via chamada HTTP direta à API deles (sem o SDK
// @sentry/node) — evita adicionar uma dependência pesada só pra isso e mantém as functions leves.
// Só ativa se SENTRY_DSN estiver definido (ver .env.example); sem isso, captureError() é um no-op
// e nada muda no comportamento normal das functions. O DSN de um projeto Sentry é uma credencial
// pública por natureza (só permite *enviar* eventos, não ler nada) — mesma lógica do POSTHOG_KEY em
// assets/js/analytics.js, pode ficar em variável de ambiente normal sem risco.
import { randomUUID } from 'node:crypto';

function parseDsn(dsn) {
  const match = /^https:\/\/([a-f0-9]+)@([^/]+)\/(\d+)$/.exec(dsn || '');
  if (!match) return null;
  const [, publicKey, host, projectId] = match;
  return { publicKey, host, projectId };
}

export async function captureError(err, { functionName, extra } = {}) {
  const dsn = parseDsn(process.env.SENTRY_DSN);
  if (!dsn) return;

  const event = {
    event_id: randomUUID().replace(/-/g, ''),
    timestamp: new Date().toISOString(),
    platform: 'node',
    level: 'error',
    tags: { function: functionName },
    extra,
    exception: {
      values: [
        {
          type: (err && err.name) || 'Error',
          value: String((err && err.message) || err),
          stacktrace: err && err.stack
            ? { frames: err.stack.split('\n').slice(1).reverse().map((line) => ({ filename: line.trim() })) }
            : undefined,
        },
      ],
    },
  };

  try {
    await fetch(`https://${dsn.host}/api/${dsn.projectId}/store/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Sentry-Auth': `Sentry sentry_version=7, sentry_key=${dsn.publicKey}, sentry_client=isotopxs-manual/1.0`,
      },
      body: JSON.stringify(event),
    });
  } catch (reportErr) {
    console.error('sentry: falha ao reportar erro (ignorado):', reportErr);
  }
}

// Rede de segurança pra exceção não prevista (bug) que nenhum try/catch da function pegou —
// sem isso, o cliente só veria o 500 padrão da Netlify e ninguém saberia que aconteceu.
export function withErrorReporting(handler, functionName) {
  return async (req, context) => {
    try {
      return await handler(req, context);
    } catch (err) {
      console.error(`${functionName}: erro não tratado:`, err);
      await captureError(err, { functionName });
      return new Response(JSON.stringify({ error: 'Erro interno' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  };
}
