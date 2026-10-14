// API do painel de pedidos (admin.html). Tudo aqui exige sessão de admin (ver admin-session.mjs).
//   GET   → todos os pedidos (mais recentes primeiro) + quais avisos estão configurados.
//   PATCH → { id, status?, tracking_code?, tracking_url?, shipping_carrier?, admin_notes?,
//             clear_shipping_claim? } — atualiza um pedido; manda o e-mail de "enviado" quando cabe.
import { getOrder, listOrders, updateOrder } from './lib/orders-store.mjs';
import { isAdmin } from './lib/admin-auth.mjs';
import { buildAdminPatch } from './lib/order-admin.mjs';
import { notifyOrderShipped, shouldSendShippedEmail } from './lib/notify.mjs';
import { emailConfigured } from './lib/email.mjs';
import { parseWhatsAppRecipients } from './lib/whatsapp.mjs';
import { withErrorReporting } from './lib/sentry.mjs';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function notificationConfig() {
  return {
    email: emailConfigured(),
    band_emails: String(process.env.BAND_NOTIFY_EMAILS || '').split(',').filter((s) => s.trim()).length,
    whatsapp: parseWhatsAppRecipients(process.env.BAND_NOTIFY_WHATSAPP).length,
  };
}

export default withErrorReporting(async (req) => {
  if (!isAdmin(req)) return json({ error: 'Não autorizado' }, 401);

  if (req.method === 'GET') {
    return json({ orders: await listOrders(), notifications: notificationConfig() });
  }

  if (req.method !== 'PATCH') return json({ error: 'Método não permitido' }, 405);

  // Exigir JSON fecha a porta pra CSRF via <form> (que não consegue mandar application/json sem
  // preflight CORS) — o SameSite=Strict do cookie já cobre, isso é a segunda camada.
  if (!(req.headers.get('content-type') || '').includes('application/json')) {
    return json({ error: 'Content-Type precisa ser application/json' }, 415);
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'JSON inválido' }, 400);
  }

  const before = await getOrder(body && typeof body.id === 'string' ? body.id : null);
  if (!before) return json({ error: 'Pedido não encontrado' }, 404);

  const { patch, errors } = buildAdminPatch(before, body);
  if (errors.length) return json({ error: errors.join('; ') }, 400);

  let order = await updateOrder(before.id, patch);
  let notifications = {};

  if (shouldSendShippedEmail(order)) {
    notifications = await notifyOrderShipped(order);
    if (notifications.customer_email === 'sent') {
      order = await updateOrder(order.id, {
        shipped_email_key: order.tracking_code || '',
        shipped_email_sent_at: new Date().toISOString(),
      });
    }
  }

  return json({ order, notifications });
}, 'admin-orders');
