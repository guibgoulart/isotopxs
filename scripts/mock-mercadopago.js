#!/usr/bin/env node
// Servidor HTTP mínimo que imita as duas chamadas da API da Mercado Pago que nosso código usa
// (POST /checkout/preferences e GET /v1/payments/:id), para testar o fluxo de checkout inteiro
// localmente sem precisar de credenciais reais (nem de teste). Não usar em produção — é só
// para `netlify dev` local: aponte MP_API_BASE para este servidor (ver README das functions).
//
// Uso:
//   node scripts/mock-mercadopago.js [porta=4000]
//
// Comportamento:
//   - POST /checkout/preferences: guarda o external_reference recebido e devolve um init_point
//     falso apontando para /mock-checkout (só uma página HTML informativa).
//   - GET /v1/payments/:id: devolve um pagamento fictício com o external_reference da última
//     preferência criada. O status é derivado do próprio :id — comece o id com "approved",
//     "pending" ou "rejected" para simular cada caso (default: approved).

const http = require('http');

const port = Number(process.argv[2]) || 4000;
let lastExternalReference = null;
let lastPreferenceId = 0;

function statusFromId(id) {
  if (id.startsWith('rejected')) return 'rejected';
  if (id.startsWith('pending')) return 'pending';
  return 'approved';
}

function send(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(json);
}

const server = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const rawBody = Buffer.concat(chunks).toString('utf8');
    const url = new URL(req.url, `http://localhost:${port}`);

    if (req.method === 'POST' && url.pathname === '/checkout/preferences') {
      let body = {};
      try { body = JSON.parse(rawBody || '{}'); } catch { /* ignore */ }
      lastExternalReference = body.external_reference || null;
      lastPreferenceId += 1;
      const id = `mock-pref-${lastPreferenceId}`;
      console.log(`[mock-mp] preferência criada: id=${id} external_reference=${lastExternalReference}`);
      return send(res, 201, {
        id,
        init_point: `http://localhost:${port}/mock-checkout?pref=${id}`,
        sandbox_init_point: `http://localhost:${port}/mock-checkout?pref=${id}`,
      });
    }

    const paymentMatch = url.pathname.match(/^\/v1\/payments\/(.+)$/);
    if (req.method === 'GET' && paymentMatch) {
      const paymentId = paymentMatch[1];
      const status = statusFromId(paymentId);
      console.log(`[mock-mp] consulta de pagamento: id=${paymentId} -> status=${status} external_reference=${lastExternalReference}`);
      return send(res, 200, {
        id: paymentId,
        status,
        external_reference: lastExternalReference,
      });
    }

    if (req.method === 'GET' && url.pathname === '/mock-checkout') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(`<h1>Checkout simulado</h1><p>Preferência: ${url.searchParams.get('pref')}</p>
        <p>Isso substitui a página real de pagamento da Mercado Pago só para teste local.</p>`);
    }

    send(res, 404, { error: 'not found' });
  });
});

server.listen(port, () => {
  console.log(`[mock-mp] rodando em http://localhost:${port}`);
  console.log('[mock-mp] configure MP_API_BASE com essa URL no seu .env para usar durante teste local.');
});
