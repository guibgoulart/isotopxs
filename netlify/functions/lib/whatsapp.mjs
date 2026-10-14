// Alerta por WhatsApp pros membros da banda via CallMeBot — API gratuita feita pra notificação
// pessoal de baixo volume. Cada pessoa autoriza o próprio número uma vez (manda uma mensagem pro bot
// deles) e recebe uma apikey; o par telefone:apikey vai em BAND_NOTIFY_WHATSAPP. Bem mais simples
// que a API oficial do WhatsApp Business (verificação de empresa, templates aprovados), que seria
// exagero pra avisar meia dúzia de pessoas. Só manda pra quem se cadastrou — nunca pra cliente.

const CALLMEBOT_URL = 'https://api.callmebot.com/whatsapp.php';
const TIMEOUT_MS = 5000;

// "5551999990000:123456, 5511988887777:654321" -> [{ phone: '+5551999990000', apikey: '123456' }, ...]
export function parseWhatsAppRecipients(raw) {
  return String(raw || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [phone, apikey] = entry.split(':').map((part) => (part || '').trim());
      const digits = (phone || '').replace(/\D/g, '');
      return digits && apikey ? { phone: `+${digits}`, apikey } : null;
    })
    .filter(Boolean);
}

export async function sendWhatsApp({ phone, apikey }, text) {
  const url = new URL(CALLMEBOT_URL);
  url.searchParams.set('phone', phone);
  url.searchParams.set('apikey', apikey);
  url.searchParams.set('text', text);

  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  const body = await res.text().catch(() => '');
  // A CallMeBot às vezes responde 200 com o erro no corpo (ex.: apikey inválida).
  if (!res.ok || /apikey is invalid|error/i.test(body)) {
    // Nunca inclui a URL no erro — ela carrega a apikey, e esse texto vai pro log e pro Sentry.
    throw new Error(`CallMeBot falhou pra ${phone.slice(0, 5)}… (HTTP ${res.status}): ${body.replace(/<[^>]*>/g, ' ').trim().slice(0, 200)}`);
  }
  return { status: 'sent' };
}
