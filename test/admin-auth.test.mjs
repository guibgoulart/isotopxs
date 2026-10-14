import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BlobsServer } from '@netlify/blobs/server';
import { setEnvironmentContext } from '@netlify/blobs';
import {
  adminConfigError,
  checkPassword,
  createSessionToken,
  verifySessionToken,
  isAdmin,
  sessionCookie,
  loginBlocked,
  recordLoginFailure,
  clearLoginFailures,
  SESSION_TTL_MS,
  MAX_LOGIN_FAILURES,
  LOGIN_WINDOW_MS,
} from '../netlify/functions/lib/admin-auth.mjs';

const PASSWORD = 'senha-de-teste-bem-longa';
const SECRET = 'x'.repeat(48);

let server;
let directory;

before(async () => {
  directory = mkdtempSync(join(tmpdir(), 'isotopxs-auth-test-'));
  server = new BlobsServer({ directory, token: 'test-token' });
  const { port } = await server.start();
  setEnvironmentContext({
    edgeURL: `http://localhost:${port}`,
    uncachedEdgeURL: `http://localhost:${port}`,
    token: 'test-token',
    siteID: 'test-site',
  });
});

after(async () => {
  await server.stop();
  rmSync(directory, { recursive: true, force: true });
});

beforeEach(() => {
  process.env.ADMIN_PASSWORD = PASSWORD;
  process.env.ADMIN_SESSION_SECRET = SECRET;
});

function reqWithCookie(cookie) {
  return new Request('http://localhost/.netlify/functions/admin-orders', { headers: cookie ? { cookie } : {} });
}

test('adminConfigError: fail-closed sem senha/segredo ou com valores curtos', () => {
  assert.equal(adminConfigError(), null);
  process.env.ADMIN_PASSWORD = 'curta';
  assert.match(adminConfigError(), /ADMIN_PASSWORD/);
  process.env.ADMIN_PASSWORD = PASSWORD;
  delete process.env.ADMIN_SESSION_SECRET;
  assert.match(adminConfigError(), /ADMIN_SESSION_SECRET/);
});

test('checkPassword: só aceita a senha exata, e nada quando o painel não está configurado', () => {
  assert.equal(checkPassword(PASSWORD), true);
  assert.equal(checkPassword(`${PASSWORD} `), false);
  assert.equal(checkPassword(''), false);
  assert.equal(checkPassword(undefined), false);
  delete process.env.ADMIN_PASSWORD;
  assert.equal(checkPassword(''), false, 'senha vazia nunca pode bater com env var ausente');
});

test('sessão: token válido, expirado, adulterado, e invalidado ao trocar a senha', () => {
  const now = Date.parse('2026-10-14T12:00:00.000Z');
  const token = createSessionToken(now);
  assert.equal(verifySessionToken(token, now + 1000), true);
  assert.equal(verifySessionToken(token, now + SESSION_TTL_MS + 1), false, 'expirado');

  const [v, exp, nonce, sig] = token.split('.');
  const extended = `${v}.${Number(exp) + 10 * SESSION_TTL_MS}.${nonce}.${sig}`;
  assert.equal(verifySessionToken(extended, now), false, 'mexer na expiração quebra a assinatura');
  assert.equal(verifySessionToken('lixo', now), false);
  assert.equal(verifySessionToken(undefined, now), false);

  process.env.ADMIN_PASSWORD = 'outra-senha-bem-longa';
  assert.equal(verifySessionToken(token, now), false, 'trocar a senha derruba sessões abertas');
});

test('isAdmin: lê o cookie da requisição', () => {
  const token = createSessionToken();
  assert.equal(isAdmin(reqWithCookie(`foo=bar; isotopxs_admin=${token}; outro=1`)), true);
  assert.equal(isAdmin(reqWithCookie('isotopxs_admin=invalido')), false);
  assert.equal(isAdmin(reqWithCookie(null)), false);
});

test('sessionCookie: HttpOnly, Secure e SameSite=Strict', () => {
  const cookie = sessionCookie('abc');
  for (const attr of ['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/']) assert.ok(cookie.includes(attr), attr);
});

test('login throttle: bloqueia depois de muitas falhas, libera após a janela ou login certo', async () => {
  const ip = '203.0.113.7';
  const now = Date.parse('2026-10-14T12:00:00.000Z');
  for (let i = 0; i < MAX_LOGIN_FAILURES - 1; i += 1) await recordLoginFailure(ip, now);
  assert.equal(await loginBlocked(ip, now), false);
  await recordLoginFailure(ip, now);
  assert.equal(await loginBlocked(ip, now), true);
  assert.equal(await loginBlocked('198.51.100.1', now), false, 'outro IP não é afetado');
  assert.equal(await loginBlocked(ip, now + LOGIN_WINDOW_MS + 1), false, 'janela venceu');

  await clearLoginFailures(ip);
  assert.equal(await loginBlocked(ip, now), false);
});
