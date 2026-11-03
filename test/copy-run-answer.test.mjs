import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const cache = new Map();
function source(path) {
  if (cache.has(path)) return cache.get(path);
  const compiled = ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const code = compiled.replace(/from "([^\"]+)"/g, (_, specifier) => {
    if (!specifier.startsWith('@/')) return `from "${import.meta.resolve(specifier)}"`;
    return `from "${source('../src/' + specifier.slice(2) + '.ts')}"`;
  });
  const url = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
  cache.set(path, url); return url;
}
const { copyableRunAnswer } = await import(source('../src/lib/copy-run-answer.ts'));

test('复制正文、团队输出和最终总结，按页面顺序保留 Markdown 并过滤过程与内部状态', () => {
  const content = '[start]开头\n\n结尾 $k=1$[end]';
  const run = { details: { displayEvents: [
    { type: 'display.process.step', title: '内部步骤' },
    { type: 'display.team_output', text_offset: 11, phase: 'end', team: { name: '材料团队' }, content: '团队 **输出**' },
    { type: 'display.final_answer', phase: 'end', content: '最终结论\n\n```js\nconst x = 1\n```' },
    { type: 'display.recommendations', items: [{ text: '下一步', prompt: '展开建议' }] },
  ] }, scores: { secret: '不应复制评分' } };
  const result = copyableRunAnswer(content, run);
  for (const value of ['开头', '结尾 $k=1$', '团队输出 · 材料团队', '团队 **输出**', '最终结论', '```js', '后续建议', '展开建议']) assert.ok(result.includes(value), value);
  assert.ok(result.indexOf('开头') < result.indexOf('团队 **输出**'));
  assert.ok(result.indexOf('团队 **输出**') < result.indexOf('最终结论'));
  assert.doesNotMatch(result, /内部步骤|不应复制评分|\[start\]|\[end\]/);
});

test('生成中可复制当前内容，空正文及仅有处理过程不冒充回答', () => {
  assert.equal(copyableRunAnswer('', { details: { displayEvents: [{ type: 'display.process.step', title: '查询中' }] } }, true), '');
  const result = copyableRunAnswer('[start]目前的回答<think>隐含内容', { details: { displayEvents: [{ type: 'display.team_output', phase: 'delta', delta: '当前团队输出', team: { name: '团队' } }] } }, true);
  assert.match(result, /目前的回答/); assert.match(result, /当前团队输出/);
  assert.doesNotMatch(result, /隐含内容|\[start\]/);
});
