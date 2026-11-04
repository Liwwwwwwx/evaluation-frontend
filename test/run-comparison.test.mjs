import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const cache = new Map();
const stub = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const react = import.meta.resolve('react');
const ui = stub(`import React from ${JSON.stringify(react)}; export function BackLink({children}){return React.createElement('a',null,children)}; export function StatusDot({children,tone}){return React.createElement('span',{'data-tone':tone},children)}; export function Tabs(){return null}`);
const answer = stub(`export function AnswerMarkdown(){return null}; export function ConversationAnswer(){return null}`);
function source(path) {
  if (cache.has(path)) return cache.get(path);
  const file = new URL(path, import.meta.url);
  const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const code = compiled.replace(/import styles from "[^"]+\.module\.css";/g, 'const styles = new Proxy({}, { get: (_, key) => key });').replace(/from "([^"]+)"/g, (_, specifier) => {
    if (specifier === '@/components/ui') return `from "${ui}"`;
    if (['@/components/answer-markdown','@/components/conversation-answer'].includes(specifier)) return `from "${answer}"`;
    if (specifier.startsWith('@/')) return `from "${source('../src/' + specifier.slice(2) + '.ts')}"`;
    if (specifier.startsWith('.')) return `from "${source(new URL(specifier + '.ts', file).href)}"`;
    return `from "${import.meta.resolve(specifier)}"`;
  });
  const url=stub(code);cache.set(path,url);return url;
}
const { RunComparison }=await import(source('../src/components/run-comparison.tsx'));
const judge=()=>({status:'pending',model:'',quality:null});
const run=(id,label,status,error=null)=>({runId:id,serviceKey:id,serviceLabel:label,executionStatus:status,scoringStatus:'pending',answer:'',elapsedMs:null,error,scores:{deepSeekScore:judge(),qwenScore:judge()}});

test('默认对比视图显示两侧执行状态及失败原因',()=>{
  const comparison={groupId:'test',question:'测试问题',rule:{name:'测试规则',version:1},createdAt:'2026-11-04T00:00:00Z',runs:[run('synthesis','合成制备','queued'),run('alpha-rsi','1110','failed','服务连接失败')]};
  const html=renderToStaticMarkup(React.createElement(RunComparison,{comparison}));
  assert.match(html,/排队中/);assert.match(html,/执行失败/);assert.match(html,/服务连接失败/);assert.match(html,/评分暂不可比较/);
});
