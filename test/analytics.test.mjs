import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Roda o analytics.js num contexto falso (sem o array.js do PostHog carregado) e devolve o window.
function loadAnalytics() {
  const script = { parentNode: { insertBefore() {} } };
  const created = [];
  const document = {
    createElement: () => {
      const element = {};
      created.push(element);
      return element;
    },
    getElementsByTagName: () => [script],
  };
  const window = {};
  window.window = window;
  window.document = document;
  vm.createContext(window);
  vm.runInContext(readFileSync(new URL('../assets/js/analytics.js', import.meta.url), 'utf8'), window);
  window.__createdElements = created;
  return window;
}

// Config passada pro posthog.init.
function loadInitConfig() {
  return loadAnalytics().posthog._i[0][1];
}

function exceptionEvent(filenames) {
  return {
    event: '$exception',
    properties: {
      $exception_list: [{ stacktrace: { frames: filenames.map((filename) => ({ filename })) } }],
    },
  };
}

const { before_send } = loadInitConfig();

test('before_send descarta erro do script injetado pelo navegador do Instagram', () => {
  const event = exceptionEvent([
    'iabjs://navigation_performance_logger_android',
    'iabjs://navigation_performance_logger_android',
  ]);
  assert.equal(before_send(event), null);
});

test('before_send mantém erro do código do site', () => {
  const event = exceptionEvent(['https://isotopxs.com.br/assets/js/loja.js']);
  assert.equal(before_send(event), event);
});

test('before_send mantém erro que passa pelo script do Instagram mas sai do código do site', () => {
  const event = exceptionEvent([
    'https://isotopxs.com.br/assets/js/loja.js',
    'iabjs://navigation_performance_logger_android',
  ]);
  assert.equal(before_send(event), event);
});

test('before_send não quebra com frames ou exceções nulos', () => {
  const event = {
    event: '$exception',
    properties: { $exception_list: [null, { stacktrace: { frames: [null, { filename: 'iabjs://x' }] } }] },
  };
  assert.equal(before_send(event), event);
});

test('before_send mantém exceção sem stacktrace e eventos que não são exceção', () => {
  const semStack = { event: '$exception', properties: { $exception_list: [{ type: 'Error' }] } };
  const pageview = { event: '$pageview', properties: { $current_url: 'https://isotopxs.com.br/loja' } };
  assert.equal(before_send(semStack), semStack);
  assert.equal(before_send(pageview), pageview);
  assert.equal(before_send(null), null);
});

const INSTAGRAM_UA =
  'Mozilla/5.0 (Linux; Android 14; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/157.0.0.0 Mobile Safari/537.36 Instagram 455.0.0.51.72 Android';

function scriptErrorEvent(userAgent) {
  return {
    event: '$exception',
    properties: {
      $raw_user_agent: userAgent,
      $exception_list: [{ type: 'Error', value: 'Script error.', mechanism: { synthetic: true } }],
    },
  };
}

test('before_send descarta "Script error." sem frames no navegador do Instagram', () => {
  assert.equal(before_send(scriptErrorEvent(INSTAGRAM_UA)), null);
});

test('before_send mantém "Script error." fora do Instagram e outros erros sem frames no Instagram', () => {
  const chrome = scriptErrorEvent('Mozilla/5.0 (Linux; Android 14) Chrome/157.0.0.0 Mobile Safari/537.36');
  const outroErro = scriptErrorEvent(INSTAGRAM_UA);
  outroErro.properties.$exception_list[0].value = "Cannot read properties of undefined (reading 'x')";
  assert.equal(before_send(chrome), chrome);
  assert.equal(before_send(outroErro), outroErro);
});

test('chamada ao posthog antes do script carregar entra na fila em vez de dar erro', () => {
  const { posthog } = loadAnalytics();
  posthog.capture('checkout_blocked', { reason: 'teste' });
  assert.equal(JSON.stringify(posthog[posthog.length - 1]), JSON.stringify(['capture', 'checkout_blocked', { reason: 'teste' }]));
});

test('PostHog passa pelo proxy em /eco, com ui_host apontando pro app', () => {
  const window = loadAnalytics();
  const config = window.posthog._i[0][1];
  assert.equal(config.api_host, '/eco');
  assert.equal(config.ui_host, 'https://us.posthog.com');
  assert.equal(window.__createdElements[0].src, '/eco/static/array.js');
});

test('netlify.toml faz proxy de /eco pro PostHog, com a regra de static antes da geral', () => {
  const toml = readFileSync(new URL('../netlify.toml', import.meta.url), 'utf8');
  const rules = toml
    .split('[[')
    .filter((block) => block.startsWith('redirects]]'))
    .map((block) => Object.fromEntries([...block.matchAll(/^\s*(\w+) = "?([^"\n]*)"?$/gm)].map((m) => [m[1], m[2]])));
  const staticIndex = rules.findIndex((r) => r.from === '/eco/static/*');
  const ingestIndex = rules.findIndex((r) => r.from === '/eco/*');
  assert.ok(staticIndex !== -1 && ingestIndex !== -1);
  assert.ok(staticIndex < ingestIndex);
  assert.deepEqual(rules[staticIndex], {
    from: '/eco/static/*',
    to: 'https://us-assets.i.posthog.com/static/:splat',
    status: '200',
    force: 'true',
  });
  assert.deepEqual(rules[ingestIndex], {
    from: '/eco/*',
    to: 'https://us.i.posthog.com/:splat',
    status: '200',
    force: 'true',
  });
});
