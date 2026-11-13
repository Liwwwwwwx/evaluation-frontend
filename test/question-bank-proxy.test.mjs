import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { NextRequest } = require('next/server');
const source = fs.readFileSync(new URL('../src/app/api/question-bank/[action]/route.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const mod = { exports: {} };
const requireWithAlias = name => name === '@/lib/evaluation-auth-proxy' ? { backendOrigin: () => 'http://127.0.0.1:7714' } : require(name);
new Function('require', 'module', 'exports', output)(requireWithAlias, mod, mod.exports);
const { GET } = mod.exports;

test('题库代理转发测试集列表与筛选参数', async t => {
  const previousFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = previousFetch; });
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url: new URL(url), cookie: options.headers.get('cookie') });
    return new Response(JSON.stringify({ items: [] }), { headers: { 'Content-Type': 'application/json' } });
  };
  const request = path => new NextRequest(`http://localhost:6714${path}`, { headers: { Cookie: 'evaluation_session=test-session' } });
  const params = action => ({ params: Promise.resolve({ action }) });

  assert.equal((await GET(request('/api/question-bank/test-sets'), params('test-sets'))).status, 200);
  assert.equal(requests[0].url.pathname, '/api/question-bank/test-sets');
  assert.equal(requests[0].cookie, 'evaluation_session=test-session');

  const query = new URLSearchParams({ testSet: '材料研发测试案例集', source: 'fixed', ignored: 'value' });
  assert.equal((await GET(request(`/api/question-bank/questions?${query}`), params('questions'))).status, 200);
  assert.equal(requests[1].url.searchParams.get('testSet'), '材料研发测试案例集');
  assert.equal(requests[1].url.searchParams.get('source'), 'fixed');
  assert.equal(requests[1].url.searchParams.has('ignored'), false);
});
