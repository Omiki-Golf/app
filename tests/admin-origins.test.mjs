import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../supabase/functions/_shared/admin.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
test('CORS admits only the configured origins on preflight and actual requests', async () => {
  let handler;
  const env = { APP_ORIGIN: 'https://omikigolf.com', APP_ALLOWED_ORIGINS: 'https://golf.arinsaldev.com', SUPABASE_URL: 'https://example.com', SUPABASE_ANON_KEY: 'test', SUPABASE_SERVICE_ROLE_KEY: 'test' };
  const exports = {};
  new Function('require', 'exports', 'Deno', js)(() => ({ createClient: () => ({}) }), exports, { env: { get: key => env[key] }, serve: fn => { handler = fn; } });
  let calls = 0;
  exports.serve(async () => { calls++; return { ok: true }; });
  for (const origin of ['https://omikigolf.com', 'https://golf.arinsaldev.com']) {
    for (const method of ['OPTIONS', 'POST']) {
      const response = await handler(new Request('https://example.com', { method, headers: { Origin: origin } }));
      assert.equal(response.status, method === 'OPTIONS' ? 204 : 200);
      assert.equal(response.headers.get('Access-Control-Allow-Origin'), origin);
      assert.equal(response.headers.get('Vary'), 'Origin');
    }
  }
  for (const origin of ['https://omikigolf.com.attacker.test', 'http://omikigolf.com', 'null']) {
    const response = await handler(new Request('https://example.com', { method: 'POST', headers: { Origin: origin } }));
    assert.equal(response.status, 403);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
  }
  assert.equal(calls, 2);
});
