import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const cssStub = `data:text/javascript;base64,${Buffer.from('export default {}').toString('base64')}`;
function load(relative, aliases = {}) {
  const file = new URL(relative, import.meta.url);
  const source = fs.readFileSync(file, 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return `data:text/javascript;base64,${Buffer.from(compiled.replace(/from "([^"]+)"/g, (_, name) => `from "${name.endsWith('.css') ? cssStub : aliases[name] || import.meta.resolve(name)}"`)).toString('base64')}`;
}
const helperUrl = load('../src/lib/shared-daily-report.ts');
const { readSharedDailyReport } = await import(helperUrl);
const markdownUrl = load('../src/components/answer-markdown.tsx', { '@/lib/answer-markdown': load('../src/lib/answer-markdown.ts'), '@/lib/clipboard': load('../src/lib/clipboard.ts') });
const { SharedDailyReport } = await import(load('../src/components/shared-daily-report.tsx', {
  '@/components/answer-markdown': markdownUrl,
  '@/components/ui/empty-state': load('../src/components/ui/empty-state.tsx', { './icons': load('../src/components/ui/icons.tsx') }),
}));
const query = { expires: '1795000000', signature: 'a'.repeat(64) };
const report = { date: '2026-11-05', markdown: '# 日报\n\n## 各服务\n\n| 服务 | 次数 |\n|---|---|\n| 测试服务 | 2 |', updatedAt: '2026-11-06T10:00:00Z', expiresAt: new Date(Number(query.expires) * 1000).toISOString() };

test('分享读取只转发签名和日期，不传登录凭据、不缓存、不跟随重定向', async () => {
  let request;
  const result = await readSharedDailyReport(report.date, query, 'http://127.0.0.1:7716', async (url, options) => {
    request = { url, options };
    return { ok: true, json: async () => ({ ...report, snapshot: 'not-public' }) };
  });
  assert.deepEqual(result, { status: 'ready', report });
  assert.equal(request.url.pathname, '/api/public/daily-reports/2026-11-05');
  assert.equal(request.options.credentials, 'omit');
  assert.equal(request.options.cache, 'no-store');
  assert.equal(request.options.redirect, 'error');
  assert.deepEqual(request.options.headers, { Accept: 'application/json' });
});

test('拒绝错误日期和重复签名，区分过期、更新中、异常和格式错误', async () => {
  const forbiddenFetch = async () => assert.fail('无效输入不应请求后端');
  assert.equal((await readSharedDailyReport('2026-02-30', query, 'http://localhost', forbiddenFetch)).status, 'invalid');
  assert.equal((await readSharedDailyReport(report.date, { ...query, signature: [query.signature, query.signature] }, 'http://localhost', forbiddenFetch)).status, 'invalid');
  for (const [status, expected] of [[404, 'invalid'], [409, 'updating'], [503, 'unavailable']]) {
    assert.equal((await readSharedDailyReport(report.date, query, 'http://localhost', async () => ({ status, ok: false }))).status, expected);
  }
  assert.equal((await readSharedDailyReport(report.date, query, 'http://localhost', async () => { throw Error('private signed URL'); })).status, 'unavailable');
  for (const value of [{ ...report, date: '2026-11-04' }, { ...report, expiresAt: 'invalid' }, { ...report, markdown: '' }]) {
    assert.equal((await readSharedDailyReport(report.date, query, 'http://localhost', async () => ({ ok: true, json: async () => value }))).status, 'unavailable');
  }
});

test('匿名报告保留Markdown表格和到期说明，错误状态不展示正文或写操作', () => {
  const render = result => renderToStaticMarkup(React.createElement(SharedDailyReport, { result }));
  const html = render({ status: 'ready', report });
  assert.match(html, /<h1>2026-11-05 测评日报<\/h1>/);
  assert.match(html, /此页无需登录/);
  assert.match(html, /案例详情需要登录/);
  assert.match(html, /链接有效至/);
  assert.match(html, /run-table-wrap/);
  assert.match(html, /<td>测试服务<\/td>/);
  assert.doesNotMatch(html, /<form|生成报告|重新测评|退出登录/);
  for (const [status, expected] of [['invalid', '分享链接无效或已过期'], ['updating', '报告正在更新'], ['unavailable', '暂时无法读取报告']]) {
    const stateHtml = render({ status });
    assert.match(stateHtml, new RegExp(expected));
    assert.doesNotMatch(stateHtml, /测试服务|<table>/);
  }
});
