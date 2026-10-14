// Autenticação do painel de pedidos: uma senha compartilhada pela banda (ADMIN_PASSWORD) troca por
// um cookie de sessão assinado com HMAC — sem lib de JWT, mesmo espírito cru de
// verifyWebhookSignature em lib/mercadopago.js. Fail-closed: sem as duas env vars configuradas,
// ninguém entra.
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { withStore } from './blob-store.mjs';

export const SESSION_COOKIE = 'isotopxs_admin';
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Proteção contra força bruta na senha. Feita aqui (Blobs) e não no rateLimit da Netlify porque o
// plano free só aplica 2 regras de rate limit por projeto, e elas já estão em uso.
export const MAX_LOGIN_FAILURES = 10;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;

export function adminConfigError() {
  if ((process.env.ADMIN_PASSWORD || '').length < 12) {
    return 'ADMIN_PASSWORD ausente ou curta demais (mínimo 12 caracteres)';
  }
  if ((process.env.ADMIN_SESSION_SECRET || '').length < 32) {
    return 'ADMIN_SESSION_SECRET ausente ou curta demais (mínimo 32 caracteres)';
  }
  return null;
}

// Compara via hash pra os dois lados terem o mesmo tamanho — timingSafeEqual exige isso, e assim o
// tempo de resposta não vaza o tamanho da senha.
function safeEqual(a, b) {
  const ha = createHash('sha256').update(String(a)).digest();
  const hb = createHash('sha256').update(String(b)).digest();
  return timingSafeEqual(ha, hb);
}

// A senha entra na chave de assinatura: trocar ADMIN_PASSWORD derruba todas as sessões abertas.
function sign(payload) {
  const key = createHash('sha256')
    .update(`${process.env.ADMIN_SESSION_SECRET}\n${process.env.ADMIN_PASSWORD}`)
    .digest();
  return createHmac('sha256', key).update(payload).digest('base64url');
}

export function checkPassword(candidate) {
  if (adminConfigError() || typeof candidate !== 'string') return false;
  return safeEqual(candidate, process.env.ADMIN_PASSWORD);
}

export function createSessionToken(now = Date.now()) {
  const payload = `v1.${now + SESSION_TTL_MS}.${randomBytes(12).toString('base64url')}`;
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token, now = Date.now()) {
  if (typeof token !== 'string' || adminConfigError()) return false;
  const parts = token.split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') return false;
  const payload = parts.slice(0, 3).join('.');
  if (!safeEqual(parts[3], sign(payload))) return false;
  const expiresAt = Number(parts[1]);
  return Number.isFinite(expiresAt) && expiresAt > now;
}

export function readCookie(req, name) {
  for (const part of (req.headers.get('cookie') || '').split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return null;
}

export function isAdmin(req, now = Date.now()) {
  return verifySessionToken(readCookie(req, SESSION_COOKIE), now);
}

export function sessionCookie(token) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_TTL_MS / 1000}`;
}

export function clearedSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

// O IP nunca é guardado em claro — só um hash, usado como chave da contagem de tentativas.
function throttleKey(ip) {
  return createHash('sha256').update(String(ip || 'desconhecido')).digest('hex').slice(0, 32);
}

function withThrottleStore(fn) {
  return withStore('admin-login-throttle', fn);
}

export async function loginBlocked(ip, now = Date.now()) {
  const record = await withThrottleStore((s) => s.get(throttleKey(ip), { type: 'json' }));
  return Boolean(record && now - record.window_start < LOGIN_WINDOW_MS && record.failures >= MAX_LOGIN_FAILURES);
}

export async function recordLoginFailure(ip, now = Date.now()) {
  const key = throttleKey(ip);
  let record = await withThrottleStore((s) => s.get(key, { type: 'json' }));
  if (!record || now - record.window_start >= LOGIN_WINDOW_MS) record = { window_start: now, failures: 0 };
  record.failures += 1;
  await withThrottleStore((s) => s.setJSON(key, record));
}

export async function clearLoginFailures(ip) {
  await withThrottleStore((s) => s.delete(throttleKey(ip)));
}
