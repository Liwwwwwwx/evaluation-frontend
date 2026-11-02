import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const cache = new Map();
function source(path) {
  if (cache.has(path)) return cache.get(path);
  const compiled = ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const code = compiled.replace(/from "([^"]+)"/g, (_, specifier) => {
    if (!specifier.startsWith('@/')) return `from "${import.meta.resolve(specifier)}"`;
    const base = '../src/' + specifier.slice(2);
    const relative = fs.existsSync(new URL(base + '.tsx', import.meta.url)) ? base + '.tsx' : base + '.ts';
    return `from "${source(relative)}"`;
  });
  const url = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`; cache.set(path, url); return url;
}
const { buildRunMarkdown, runMarkdownFilename } = await import(source('../src/lib/run-markdown.ts'));
const run = { runId: 'run-123', serviceKey: 'mission-material', question: '如何设计导热材料？', status: 'done', executionStatus: 'succeeded', scoringStatus: 'ready',
  answer: '[start]先分析需求。\n\n再给出方案。\n\n$$R=d/k$$[end]', answerTruncated: false, origin: 'manual', questionId: 'q1', datasetVersion: 'v1', error: null, scoreError: null,
  run: { verdict: 'partial', serviceAddress: 'ws://example.com:1234/start?token=secret', details: { progress: [{ text: '需求分析' }], result: { formula: 'AlN', api_key: 'do-not-export', token: 'hidden-token' }, displayEvents: [
    { type: 'display.process.step', title: '需求论证', status: 'success', detail: '分析完毕' },
    { type: 'display.team_output', text_offset: 9, phase: 'end', status: 'success', team: { name: '材料团队' }, content: '团队建议氧化铝。' },
  ] }, scoring: { version: 'evaluation-v1', history: [{ marker: '历史评分' }] }, markdownSyntax: { status: 'observe' } },
  scores: { deepSeekScore: { status: 'ready', model: 'DeepSeek', quality: { version: 'evaluation-v1', total: 81, comment: '方案完整', dimensions: { readability: { label: '可读性', score: 82, weight: 0.5, note: '清晰', evidence: '需求分析' } }, taskCompletion: { status: 'partial', requirements: [{ id: 'R1', status: 'met', requirement: '说明验证', evidence: '完成验证方案' }] }, suggestions: ['补充实测'] } }, qwenScore: { status: 'unavailable' } } };

test('只导出问题、服务地址、正文和评分', () => {
  const md = buildRunMarkdown(run);
  assert.deepEqual(md.match(/^# .+$/gm), ['# 问题', '# 服务地址', '# 正文内容', '# 评分']);
  for (const expected of ['如何设计导热材料', '先分析需求', '再给出方案', 'R=d/k', '材料团队', '团队建议氧化铝', '81 / 100', '可读性：82 / 100', '千问', '未配置']) assert.ok(md.includes(expected), expected);
  for (const excluded of ['run-123', '需求论证', '需求分析', 'AlN', '完成验证方案', '补充实测', '历史评分', 'verdict', '导出时间', '运行 ID', '方案完整', '清晰', '依据：']) assert.ok(!md.includes(excluded), excluded);
  assert.match(md, /\$\$\s*R=d\/k\s*\$\$/);
  assert.ok(md.indexOf('先分析需求') < md.indexOf('团队建议氧化铝'));
  assert.ok(md.indexOf('团队建议氧化铝') < md.indexOf('再给出方案'));
  assert.ok(!md.includes('do-not-export')); assert.ok(!md.includes('hidden-token')); assert.ok(!md.includes('token=secret'));
  assert.match(md, /ws:\/\/example\.com:1234\/start/);
});

test('截断、旧快照和未完成评分在对应部分标注，不把缺失评分写成零分', () => {
  const md = buildRunMarkdown({ ...run, status: 'running', executionStatus: 'running', scoringStatus: 'pending', answerTruncated: true, recoveryState: 'snapshot_only', scores: null }, { readError: '暂时断开' });
  assert.match(md, /已截断/); assert.match(md, /已保存快照/); assert.match(md, /暂时断开/); assert.match(md, /# 评分\n\n评分中/); assert.doesNotMatch(md, /0 \/ 100/);
});

test('团队正文的代码围栏可包住反引号，文件名不会注入路径', () => {
  const md = buildRunMarkdown({ ...run, answer: '', run: { details: { displayEvents: [{ type: 'display.team_output', phase: 'end', content: '````inside', fence_risk: true }] } } });
  assert.match(md, /`````\n````inside\n`````/); assert.equal(runMarkdownFilename('../unsafe/id'), '测评运行-___unsafe_id.md');
});

test('旧评分按页面的规则换算，真实零分不视作缺失', () => {
  const md = buildRunMarkdown({ ...run, scores: { deepSeekScore: { status: 'ready', quality: { clarity: { score: 4, dimensions: { clarity: { label: '清晰度', score: 3 } } } } }, qwenScore: { status: 'ready', quality: { total: 0 } } } });
  assert.match(md, /80 \/ 100（原分 4 \/ 5）/); assert.match(md, /60 \/ 100（原分 3 \/ 5）/); assert.match(md, /总分：0 \/ 100/);
});

test('服务地址配置来源清楚标注且去除凭据和查询参数', () => {
  const md = buildRunMarkdown({ ...run, run: { serviceAddress: 'wss://user:password@example.com/start?token=secret', serviceAddressSource: 'configuration' }, scores: null });
  assert.match(md, /wss:\/\/example\.com\/start（当前配置）/); assert.doesNotMatch(md, /password|token=secret/); assert.match(md, /暂无评分/);
});
