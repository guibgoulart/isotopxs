// Arquivo próprio porque o fallback é um estado de módulo: uma vez que cai pra eventual, fica.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BlobsServer } from '@netlify/blobs/server';
import { setEnvironmentContext } from '@netlify/blobs';
import { withStore } from '../netlify/functions/lib/blob-store.mjs';

let server;
let directory;

before(async () => {
  directory = mkdtempSync(join(tmpdir(), 'isotopxs-blobstore-test-'));
  server = new BlobsServer({ directory, token: 'test-token' });
  const { port } = await server.start();
  // Sem uncachedEdgeURL: leitura strong é impossível neste ambiente.
  setEnvironmentContext({ edgeURL: `http://localhost:${port}`, token: 'test-token', siteID: 'test-site' });
});

after(async () => {
  await server.stop();
  rmSync(directory, { recursive: true, force: true });
});

test('withStore: sem URL sem cache, cai pra leitura eventual em vez de quebrar', async () => {
  await withStore('fallback-test', (s) => s.setJSON('k', { ok: true }));
  assert.deepEqual(await withStore('fallback-test', (s) => s.get('k', { type: 'json' })), { ok: true });
});
