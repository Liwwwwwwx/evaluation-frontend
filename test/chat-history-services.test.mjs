import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const cache = new Map();
const stub = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const react = import.meta.resolve('react');
const link = stub(`import React from ${JSON.stringify(react)}; export default function Link({children,...props}) { return React.createElement('a',props,children); }`);
const navigation = stub('export function usePathname() { return "/runs"; }');
const components = stub('export function Logo() { return null; } export function AccountMenu() { return null; } export function Button() { return null; } export function Dialog() { return null; } export function InlineAlert() { return null; } export function Input() { return null; }');
function source(path) {
  if (cache.has(path)) return cache.get(path);
  const file = new URL(path, import.meta.url);
  const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const code = compiled.replace(/from "([^"]+)"/g, (_, specifier) => {
    if (specifier === 'next/link') return `from "${link}"`;
    if (specifier === 'next/navigation') return `from "${navigation}"`;
    if (['@/components/logo', '@/components/workspace', '@/components/ui'].includes(specifier)) return `from "${components}"`;
    if (specifier.startsWith('@/')) return `from "${source('../src/' + specifier.slice(2) + '.ts')}"`;
    return `from "${import.meta.resolve(specifier)}"`;
  });
  const url = stub(code); cache.set(path, url); return url;
}
const { SidebarBody } = await import(source('../src/components/chat-shell.tsx'));

test('近期对话显示服务、标题和活动状态，缺失服务不猜测', () => {
  const items = [
    { id: 'one', question: '同一道题', serviceKey: 'mission-material', status: 'done', startedAt: null },
    { id: 'two', question: '同一道题', title: '自定义标题', serviceKey: 'alpha-rsi', status: 'running', startedAt: null, comparisonGroupId: 'group' },
    { id: 'three', question: '旧记录', serviceKey: null, status: 'done', startedAt: null },
    { id: 'four', question: '其他服务', serviceKey: 'custom-service', status: 'done', startedAt: null },
  ];
  const html = renderToStaticMarkup(React.createElement(SidebarBody, { items, error: '', activeId: 'two', onManage() {}, canManage: true, storageReady: true, preview: true }));
  assert.match(html, /Mission 主服务/); assert.match(html, /材料 RSI/); assert.ok(!html.includes("ALPHA"));
  assert.match(html, /自定义标题/); assert.match(html, /运行中/); assert.match(html, /服务未知/); assert.match(html, /custom-service/);
  assert.match(html, /href="\/compare\/group/); assert.match(html, /管理对话/);
});
