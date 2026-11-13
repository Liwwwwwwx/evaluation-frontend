import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { NextRequest } = require('next/server');
function load(path, aliases) {
  const source = fs.readFileSync(new URL(path, import.meta.url), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', output)(name => aliases[name] || require(name), mod, mod.exports);
  return mod.exports;
}
const { proxyUnified } = load('../src/lib/unified-evaluation-proxy.ts', { '@/lib/evaluation-auth-proxy': { backendOrigin: () => 'http://127.0.0.1:7714' } });
const { POST } = load('../src/app/api/evaluation/unified/runs/hide/route.ts', { '@/lib/unified-evaluation-proxy': { proxyUnified } });

test('运行隐藏请求通过统一代理转发并保留鉴权与同源检查', async t => {
  const previousFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = previousFetch; });
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url: new URL(url), cookie: options.headers.get('cookie'), body: JSON.parse(options.body) });
    return new Response(JSON.stringify({ hidden: [] }), { headers: { 'Content-Type': 'application/json' } });
  };
  const runIds = ['aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'];
  const request = (cookie, origin = 'http://localhost:6714') => new NextRequest('http://localhost:6714/api/evaluation/unified/runs/hide', {
    method: 'POST', headers: { host: 'localhost:6714', origin, ...(cookie ? { Cookie: cookie } : {}), 'Content-Type': 'application/json', 'Idempotency-Key': 'hide-test' }, body: JSON.stringify({ runIds }),
  });
  assert.equal((await POST(request())).status, 401);
  assert.equal((await POST(request('evaluation_session=test-session', 'http://other.example'))).status, 403);
  assert.equal(requests.length, 0);
  assert.equal((await POST(request('evaluation_session=test-session'))).status, 200);
  assert.equal(requests[0].url.pathname, '/api/evaluation/unified/runs/hide');
  assert.equal(requests[0].cookie, 'evaluation_session=test-session');
  assert.deepEqual(requests[0].body, { runIds });
});
