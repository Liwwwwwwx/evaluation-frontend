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
const { validateRuleForm,ruleDocument } = await import(loadSource('../src/lib/scoring-rules.ts'));
function render(scores, run) { return renderToStaticMarkup(React.createElement(UnifiedScores, { scores, run })); }
const quality = { version: 'evaluation-v1', total: 0, dimensions: { readability: { label: '可读性', score: 0, weight: .5, applicable: true, note: '信息不足' }, visualAids: { label: '图文辅助', score: null, weight: 0, applicable: false, note: '不需要配图' } }, comment: '<script>unsafe</script>', highlights: ['单位清楚'], gaps: ['条件缺失'], suggestions: ['补充温度条件'], taskCompletion: { status: 'partial', qualified: false, requirements: [{ id: 'R1', critical: true, status: 'missing', requirement: '报告温度条件', evidence: '原文片段' }] }, source: { truncated: true }, limitations: ['未独立科学核验'] };
test('评分展示零分、不适用、参考分、不足与两家不同状态，不执行HTML', () => {
 const html = render({ deepSeekScore: { status: 'ready', model: 'deepseek-test', quality }, qwenScore: { status: 'failed', error: '模型超时' } }, { scoring: { version: 'evaluation-v1', attemptId: 'round-1' }, markdownSyntax: { status: 'failed', coverage: 'full', issues: [{ line: 3, severity: 'error', detail: '公式无法渲染', snippet: '$bad$', suggestion: '检查括号' }] } });
 for (const value of ['0 / 100', '不适用', '评分失败', '仅供参考', '条件缺失', '补充温度条件', '不取平均']) assert.ok(html.includes(value), value);
 assert.ok(!html.includes('<script>')); assert.ok(html.includes('&lt;script&gt;'));
});
test('评分清单摘要区分未评分、未配置、失败和真实零分', () => {
 const summary = scores => renderToStaticMarkup(React.createElement(ScoreSummary, { scores }));
 assert.match(summary(null), /未评分/);
 const html = summary({ deepSeekScore: { status: 'ready', total: 0 }, qwenScore: { status: 'unavailable' } }); assert.match(html, /DeepSeek：0/); assert.match(html, /千问：未配置/);
 assert.match(summary({deepSeekScore:{status:'failed'}}), /失败/);
});
test('缺少冻结清单时使用已保存的评委要求，并提示可能不完整', () => {
 const html = render({ deepSeekScore: {status:'ready',quality}, qwenScore: {status:'unavailable'} }, {scoring:{version:'evaluation-v1',history:[{attemptId:'old',startedAt:'2026-01-01',scores:{deepSeekScore:{status:'ready',quality}},markdownSyntax:{status:'observe',issues:[]}}]},markdownSyntax:{status:'failed',issues:[{line:3,detail:'公式无法渲染'}]}});
 assert.match(html, /补充温度条件/); assert.match(html, /条件缺失/);
 assert.match(html, /查看本次评判标准/); assert.match(html, /报告温度条件/); assert.match(html, /可能不完整/);
 for (const value of ['历史评分', 'Markdown 机检', '第 3 行', '查看评分详情']) assert.ok(!html.includes(value), value);
});
test('评分卡显示已保存的规则与不达标原因，不展示效率依据',()=>{
 const q={...quality,source:{truncated:false},qualification:{status:'not_qualified',passScore:65},deliveryReview:{status:'not_delivered',note:'只有准备说明',evidence:'先装依赖'},experienceReview:{status:'issue',coverage:'answer_only',checks:[{label:'无关实现细节',status:'issue',note:'普通文档任务中无帮助',evidence:'<script>bad</script>'}]}};
 const html=render({deepSeekScore:{status:'ready',quality:q}},{scoring:{version:'evaluation-v1',ruleSnapshot:{name:'定制版',id:'one',version:3,config:{weights:{readability:20,professionalism:60,visualAids:20}}},efficiency:{status:'not_evaluable',elapsedMs:0,rows:[{label:'团队查询',status:'not_evaluable',durationMs:null,note:'没有阶段起止时间'}]}}});
 for(const s of ['可读性 · 50%','不适用','未达标','合格线 65 分','条件缺失','补充温度条件','定制版','未达标原因','关键要求缺失'])assert.ok(html.includes(s),s);
 for(const s of ['阶段效率','交付体验','没有阶段起止时间','查看评分详情'])assert.ok(!html.includes(s),s);
 assert.ok(!html.includes('<script>'));assert.ok(html.includes('&lt;script&gt;'));
});
test('分数超过合格线仍可因关键约束缺失而未达标，并展示冻结要求与双评委判定', () => {
 const requirement = { id:'R1', requirement:'仅使用四种指定元素', critical:true, kind:'constraint' };
 const q = {...quality,total:70,source:{truncated:false},qualification:{status:'not_qualified',passScore:60,markdownGate:false},taskCompletion:{status:'completed',requirements:[{...requirement,status:'missing',note:'候选包含其他元素'}]}};
 const second = {...q,qualification:{status:'qualified',passScore:60},taskCompletion:{status:'completed',requirements:[{...requirement,status:'met',note:'符合条件'}]}};
 const html=render({deepSeekScore:{status:'ready',quality:q},qwenScore:{status:'ready',quality:second}},{scoring:{version:'evaluation-v1',rubric:{requirements:[requirement],visualAidsApplicable:false,visualAidsReason:'不需要图表'},ruleSnapshot:{id:'builtin-v1',name:'内置规则',config:{passScore:60,weights:{readability:40,professionalism:40,visualAids:20},contentInstructions:'检查专业性',completionInstructions:'核验交付'}}}});
 for(const value of ['70','任务完成度 · 已完成','未达标原因','关键要求缺失','仅使用四种指定元素','DeepSeek：','千问：','符合条件','不需要图表','原始权重','核验交付']) assert.ok(html.includes(value),value);
 assert.doesNotMatch(html,/总分低于合格线/);
});
test('历史记录没有标准或缺失判定原因时明确提示，不套用当前规则', () => {
 const q={...quality,total:70,source:{truncated:false},qualification:{status:'not_qualified',passScore:60},taskCompletion:{status:'completed',requirements:[]}};
 const html=render({deepSeekScore:{status:'ready',quality:q}},{scoring:{version:'evaluation-v1'}});
 assert.match(html,/本次记录未保存题目要求/); assert.match(html,/未保存可明确展示的触发原因/); assert.doesNotMatch(html,/原始权重/);
});
test('规则表单校验和完整文档保留实际配置，不生成另一套标准',()=>{
 const value={name:'验收规则',changeNote:'测试',config:{weights:{readability:40,professionalism:40,visualAids:20},passScore:60,markdownGate:false,contentInstructions:'内容说明',completionInstructions:'检查实际交付',experienceInstructions:'结合排障上下文',efficiencyRules:[{serviceKey:'*',phaseKey:'team-discovery',label:'团队查询',warningSeconds:60,criticalSeconds:180}]}};
 assert.equal(validateRuleForm(value),'');const md=ruleDocument({...value,id:'test',version:2});for(const s of ['可读性：40%','检查实际交付','180秒','v2'])assert.ok(md.includes(s),s);
 assert.match(ruleDocument({...value,id:'test',version:2},{draft:true}),/草稿（未发布）/);
 assert.ok(validateRuleForm({...value,config:{...value.config,weights:{readability:50,professionalism:40,visualAids:20}}}));
 const changed=structuredClone(value);changed.config.efficiencyRules[0].criticalSeconds=30;assert.ok(validateRuleForm(changed));
 changed.config.efficiencyRules[0].criticalSeconds=180;changed.config.efficiencyRules.push({...changed.config.efficiencyRules[0]});assert.ok(validateRuleForm(changed));
});
