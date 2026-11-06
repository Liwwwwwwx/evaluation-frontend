import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const compiled = ts.transpileModule(fs.readFileSync(new URL('../src/lib/navigation.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { appendFrom, backLabel, listQuery, pageNumber, readQuery, safeInternalPath } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

test('站内返回路径只允许同源路径', () => {
  assert.equal(safeInternalPath('/batches/abc?tab=problems'), '/batches/abc?tab=problems');
  assert.equal(safeInternalPath('/runs?from=2026-11-01&to=2026-11-06'), '/runs?from=2026-11-01&to=2026-11-06');
  for (const value of ['https://example.com', '//example.com', '/login', 'batches/abc', '', undefined]) {
    assert.equal(safeInternalPath(value, '/runs'), '/runs');
  }
});

test('from 参数保留已有查询字符串', () => {
  assert.equal(appendFrom('/compare/abc', '/batches/1?tab=problems'), '/compare/abc?from=%2Fbatches%2F1%3Ftab%3Dproblems');
  assert.equal(appendFrom('/compare/abc?x=1', '/runs'), '/compare/abc?x=1&from=%2Fruns');
  assert.equal(appendFrom('/compare/abc', ''), '/compare/abc');
});

test('查询参数读取与分页值校验', () => {
  assert.equal(readQuery(['a', 'b']), 'a');
  assert.equal(readQuery('a'), 'a');
  assert.equal(readQuery(undefined), undefined);
  assert.equal(pageNumber('3'), 3);
  assert.equal(pageNumber('0'), 1);
  assert.equal(pageNumber('2.5'), 1);
  assert.equal(listQuery({ tab: 'batches', page: 2, empty: '', none: null }), '?tab=batches&page=2');
});

test('返回文案按来源页面区分', () => {
  assert.equal(backLabel('/question-bank?source=random'), '返回题库');
  assert.equal(backLabel('/question-bank/q1?tab=records'), '返回题目详情');
  assert.equal(backLabel('/batches/1?tab=problems'), '返回批次');
  assert.equal(backLabel('/batches/1/comparison'), '返回环比');
  assert.equal(backLabel('/runs'), '返回运行记录');
  assert.equal(backLabel('/runs/r1?from=%2Fbatches'), '返回运行详情');
  assert.equal(backLabel('/daily-reports/2026-11-01'), '返回测评日报');
  assert.equal(backLabel('/compare'), '返回对比创建');
  assert.equal(backLabel('/compare/g1'), '返回对比测评');
  assert.equal(backLabel('/evaluate'), '返回新建测评');
  assert.equal(backLabel('/unknown', '返回列表'), '返回列表');
});
