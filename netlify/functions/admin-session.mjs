// Login/logout do painel de pedidos (admin.html).
//   GET    → { authenticated } — o painel usa pra decidir se mostra login ou a lista.
//   POST   → { password } troca por cookie de sessão assinado (HttpOnly).
//   DELETE → logout (apaga o cookie).
import {
  adminConfigError,
  checkPassword,
  clearLoginFailures,
  clearedSessionCookie,
  createSessionToken,
  isAdmin,
  loginBlocked,
  recordLoginFailure,
  sessionCookie,
} from './lib/admin-auth.mjs';
import { withErrorReporting } from './lib/sentry.mjs';

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extraHeaders },
  });
}

export default withErrorReporting(async (req, context) => {
  if (req.method === 'GET') return json({ authenticated: isAdmin(req) });
  if (req.method === 'DELETE') return json({ ok: true }, 200, { 'Set-Cookie': clearedSessionCookie() });
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);

  const configError = adminConfigError();
  if (configError) {
    console.error(`admin-session: painel desativado — ${configError}`);
    return json({ error: 'Painel não configurado no servidor.' }, 503);
  }

  const ip = (context && context.ip) || req.headers.get('x-nf-client-connection-ip') || 'desconhecido';
  if (await loginBlocked(ip)) {
    return json({ error: 'Muitas tentativas erradas. Espera 15 minutos e tenta de novo.' }, 429);
  }

  let body = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  if (!checkPassword(body.password)) {
    await recordLoginFailure(ip);
    // Atraso fixo em toda senha errada: deixa tentativa automatizada bem mais lenta.
    await new Promise((resolve) => setTimeout(resolve, 400));
    return json({ error: 'Senha incorreta.' }, 401);
  }

  await clearLoginFailures(ip);
  return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(createSessionToken()) });
}, 'admin-session');
