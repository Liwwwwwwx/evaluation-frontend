import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/clipboard.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { copyText } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const original = Object.getOwnPropertyDescriptors(globalThis);
afterEach(() => {
  for (const key of ['navigator', 'document', 'HTMLElement']) {
    if (original[key]) Object.defineProperty(globalThis, key, original[key]);
    else delete globalThis[key];
  }
});

function fallbackEnvironment({ inDialog = false, succeeds = true } = {}) {
  const calls = [];
  const body = { appendChild: field => calls.push(['body', field.value]) };
  const dialog = { appendChild: field => calls.push(['dialog', field.value]) };
  class Element { closest() { return inDialog ? dialog : null; } focus() { calls.push(['restore']); } }
  const previous = new Element();
  const field = { style: {}, focus() { calls.push(['focus']); }, select() { calls.push(['select']); }, remove() { calls.push(['remove']); } };
  globalThis.HTMLElement = Element;
  globalThis.document = { activeElement: previous, body, createElement: () => field, querySelector: () => null, execCommand: name => { calls.push([name]); return succeeds; } };
  return calls;
}

test('支持 Clipboard API 时直接复制', async () => {
  let copied;
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { clipboard: { writeText: async text => { copied = text; } } } });
  await copyText('测试内容');
  assert.equal(copied, '测试内容');
});

test('HTTP 环境在原生弹窗内使用兼容复制并恢复焦点', async () => {
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} });
  const calls = fallbackEnvironment({ inDialog: true });
  await copyText('需要复制的题目');
  assert.deepEqual(calls, [['dialog', '需要复制的题目'], ['focus'], ['select'], ['copy'], ['remove'], ['restore']]);
});

test('Clipboard API 拒绝时尝试兼容方式；失败也清理并恢复焦点', async () => {
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { clipboard: { writeText: async () => { throw new Error('denied'); } } } });
  const calls = fallbackEnvironment({ succeeds: false });
  await assert.rejects(() => copyText('内容'), /copy unavailable/);
  assert.deepEqual(calls.slice(-2), [['remove'], ['restore']]);
});
