import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const cache = new Map();
function source(path) {
  if (cache.has(path)) return cache.get(path);
  const compiled = ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const code = compiled.replace(/from "([^"]+)"/g, (_, specifier) => {
    if (!specifier.startsWith('@/')) return `from "${import.meta.resolve(specifier)}"`;
    const base = '../src/' + specifier.slice(2); const relative = fs.existsSync(new URL(base + '.tsx', import.meta.url)) ? base + '.tsx' : base + '.ts';
    return `from "${source(relative)}"`;
  });
  const url = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`; cache.set(path, url); return url;
}
const { ConversationAnswer } = await import(source('../src/components/conversation-answer.tsx'));
const { UnifiedScores } = await import(source('../src/components/unified-scores.tsx'));
const render = (events, props = {}) => renderToStaticMarkup(React.createElement(ConversationAnswer, { content: '[start]独立正文[end]', run: { details: { displayEvents: events } }, ...props }));

test('过程、团队和总结各自展示，最终完整总结替换预览且不暴露传输标记', () => {
  const html = render([
    { type: 'display.process.step', event_id: 'step', title: '查询团队', status: 'success', detail: '已选定文献团队', metrics: [{ label: '数量', value: 0 }] },
    { type: 'display.team_output', event_id: 'team', phase: 'end', status: 'success', team: { name: '文献团队' }, delta: '团队交付 **热导率**，$k=1$。', elapsed_s: 2 },
    { type: 'display.final_answer', event_id: 'summary', phase: 'end', delta: '旧预览', content: '最终结论' },
  ]);
  for (const value of ['独立正文', '查询团队', '文献团队', '热导率', 'katex', '最终结论', '2 秒']) assert.ok(html.includes(value), value);
  assert.match(html, /<dd>0\s*<\/dd>/);
  assert.doesNotMatch(html, /旧预览|\[start\]|\[end\]/);
  assert.equal((html.match(/<details class="conversation-output(?: |")/g) || []).length, 2);
});

test('进行中和异常收尾有独立状态，不把缺少结束帧显示为成功', () => {
  const events = [{ type: 'display.team_output', event_id: 't', phase: 'delta', delta: '部分成果', team: { name: '材料团队' } }];
  assert.match(render(events, { streaming: true }), /生成中/);
  assert.match(render(events, { streaming: false }), /未收到结束标识/);
  assert.doesNotMatch(render(events, { streaming: false }), /已完成/);
});

test('未知JSON不混入正文，HTML不执行，围栏风险按原文展示', () => {
  const html = render([{ type: 'unrecognized', password: '不得渲染', value: '原始JSON' }, { type: 'display.final_answer', event_id: 'f', phase: 'end', fence_risk: true, content: '<script>alert(1)</script>' }]);
  assert.doesNotMatch(html, /不得渲染|原始JSON|<script>/); assert.match(html, /&lt;script&gt;/);
});

test('追问、补充答复和建议正常展示，不自动创建新对话', () => {
  const html = render([{ type: 'display.followup_request', event_id: 'q', questions: [{ id: 'q1', question: '目标温度？' }] }, { type: 'display.followup_answer', event_id: 'a', answer: '采用服务默认条件' }, { type: 'display.recommendations', event_id: 'r', items: [{ text: '验证热循环' }] }]);
  assert.match(html, /目标温度/); assert.match(html, /采用服务默认条件/); assert.match(html, /验证热循环/); assert.doesNotMatch(html, /<form|<button/);
});

test('生成过程中只提示结束后评分，评分区不再展示机检依据', () => {
  const pending = renderToStaticMarkup(React.createElement(UnifiedScores, { scores: null, executionStatus: 'running' }));
  assert.match(pending, /回答生成完成后自动评分/); assert.doesNotMatch(pending, /DeepSeek|千问/);
  const html = renderToStaticMarkup(React.createElement(UnifiedScores, { run: { scoring: { version: 'evaluation-v1' }, markdownSyntax: { status: 'observe', coverage: 'full', issues: [{ sourceLabel: '团队输出：文献', line: 2, severity: 'warning', detail: '公式未闭合' }] } }, scores: {} }));
  assert.match(html, /无评分/); assert.doesNotMatch(html, /团队输出：文献|第 2 行|Markdown 机检/);
});


test('团队块按原文位置插入，保持前后正文顺序', () => {
  const html = render([{ type: 'display.team_output', event_id: 'team', text_offset: 4, phase: 'end', delta: '团队中间输出' }], { content: '前段\n\n后段' });
  assert.ok(html.indexOf('前段') < html.indexOf('团队中间输出')); assert.ok(html.indexOf('团队中间输出') < html.indexOf('后段'));
});

test('团队块不会切开代码围栏或完整块公式', () => {
  for (const body of ['```python\na = 1\n\nb = 2\n```\n\n尾段', '$$\na = 1\n\nb = 2\n$$\n\n尾段']) {
    const html = render([{ type: 'display.team_output', event_id: 't', phase: 'end', delta: '团队块', text_offset: 10 }], { content: body });
    assert.ok(html.indexOf('b = 2') < html.indexOf('团队块')); assert.ok(html.indexOf('团队块') < html.indexOf('尾段'));
  }
});
