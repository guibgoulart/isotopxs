import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Roda o analytics.js num contexto falso e pega a config passada pro posthog.init.
function loadInitConfig() {
  const script = { parentNode: { insertBefore() {} } };
  const document = {
    createElement: () => ({}),
    getElementsByTagName: () => [script],
  };
  const window = {};
  window.window = window;
  window.document = document;
  vm.createContext(window);
  vm.runInContext(readFileSync(new URL('../assets/js/analytics.js', import.meta.url), 'utf8'), window);
  return window.posthog._i[0][1];
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

test('before_send mantém exceção sem stacktrace e eventos que não são exceção', () => {
  const semStack = { event: '$exception', properties: { $exception_list: [{ type: 'Error' }] } };
  const pageview = { event: '$pageview', properties: { $current_url: 'https://isotopxs.com.br/loja' } };
  assert.equal(before_send(semStack), semStack);
  assert.equal(before_send(pageview), pageview);
  assert.equal(before_send(null), null);
});
