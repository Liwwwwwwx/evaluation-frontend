import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const sourceCache = new Map();
function loadSource(relative) {
  const file = new URL(relative, import.meta.url);
  if (sourceCache.has(file.href)) return sourceCache.get(file.href);
  const source = fs.readFileSync(file, 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const code = compiled.replace(/from "([^"]+)"/g, (_, specifier) => {
    if (!specifier.startsWith('@/')) return `from "${import.meta.resolve(specifier)}"`;
    const root = '../src/' + specifier.slice(2);
    const path = fs.existsSync(new URL(root + '.tsx', import.meta.url)) ? root + '.tsx' : root + '.ts';
    return `from "${loadSource(path)}"`;
  });
  const url = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
  sourceCache.set(file.href, url); return url;
}
const { UnifiedScores } = await import(loadSource('../src/components/unified-scores.tsx'));
const { ScoreSummary } = await import(loadSource('../src/components/score-summary.tsx'));
function render(scores, run) { return renderToStaticMarkup(React.createElement(UnifiedScores, { scores, run })); }
const quality = { version: 'evaluation-v1', total: 0, dimensions: { readability: { label: '可读性', score: 0, weight: .5, applicable: true, note: '信息不足' }, visualAids: { label: '图文辅助', score: null, weight: 0, applicable: false, note: '不需要配图' } }, comment: '<script>unsafe</script>', highlights: ['单位清楚'], gaps: ['条件缺失'], suggestions: ['补充温度条件'], taskCompletion: { status: 'partial', qualified: false, requirements: [{ id: 'R1', critical: true, status: 'missing', requirement: '报告温度条件', evidence: '原文片段' }] }, source: { truncated: true }, limitations: ['未独立科学核验'] };
test('评分展示零分、不适用、参考分、关键缺失和两家不同状态，不执行HTML', () => {
 const html = render({ deepSeekScore: { status: 'ready', model: 'deepseek-test', quality }, qwenScore: { status: 'failed', error: '模型超时' } }, { scoring: { version: 'evaluation-v1', attemptId: 'round-1' }, markdownSyntax: { status: 'failed', coverage: 'full', issues: [{ line: 3, severity: 'error', detail: '公式无法渲染', snippet: '$bad$', suggestion: '检查括号' }] } });
 for (const value of ['0 / 100', '不适用', '评分失败', '仅供参考', '关键要求', '尚不能认定完整任务合格', '第 3 行', '检查括号', '补充温度条件', '不取平均']) assert.ok(html.includes(value), value);
 assert.ok(!html.includes('<script>')); assert.ok(html.includes('&lt;script&gt;'));
});
test('评分清单摘要区分未评分、未配置、失败和真实零分', () => {
 const summary = scores => renderToStaticMarkup(React.createElement(ScoreSummary, { scores }));
 assert.match(summary(null), /未评分/);
 const html = summary({ deepSeekScore: { status: 'ready', total: 0 }, qwenScore: { status: 'unavailable' } }); assert.match(html, /DeepSeek：0/); assert.match(html, /千问：未配置/);
 assert.match(summary({deepSeekScore:{status:'failed'}}), /失败/);
});
test('历史评分可展开，各轮模型结果与Markdown证据保留', () => {
 const html = render({ deepSeekScore: {status:'unavailable'} }, {scoring:{version:'evaluation-v1',history:[{attemptId:'old',startedAt:'2026-01-01',scores:{deepSeekScore:{status:'ready',quality}},markdownSyntax:{status:'observe',issues:[]}}]}});
 assert.match(html, /历史评分（1 轮）/); assert.match(html, /第 1 轮/); assert.match(html, /报告温度条件/);
});
