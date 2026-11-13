import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const sourceCache = new Map();
// 样式导入替换为空对象桩：渲染断言只关心结构，不关心 CSS 模块。
const cssStub = `data:text/javascript;base64,${Buffer.from('export default {}').toString('base64')}`;
// next/link 无法从 data: 模块按包导出解析；被测组件不渲染链接按钮，用空组件桩替代。
const linkStub = `data:text/javascript;base64,${Buffer.from('export default () => null').toString('base64')}`;
function resolveModule(base, specifier) {
  for (const suffix of ['.tsx', '.ts', '/index.ts']) {
    const candidate = new URL(specifier + suffix, base);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}
function loadSource(relative) {
  const file = new URL(relative, import.meta.url);
  if (sourceCache.has(file.href)) return sourceCache.get(file.href);
  const source = fs.readFileSync(file, 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const code = compiled.replace(/from "([^"]+)"/g, (_, specifier) => {
    if (specifier.endsWith('.css')) return `from "${cssStub}"`;
    if (specifier === 'next/link') return `from "${linkStub}"`;
    if (specifier.startsWith('@/')) {
      const resolved = resolveModule(new URL('../src/', import.meta.url), specifier.slice(2));
      if (!resolved) throw new Error(`无法解析 ${specifier}`);
      return `from "${loadSource(resolved.href)}"`;
    }
    if (specifier.startsWith('.')) {
      const resolved = resolveModule(file, specifier);
      if (!resolved) throw new Error(`无法从 ${file.href} 解析 ${specifier}`);
      return `from "${loadSource(resolved.href)}"`;
    }
    return `from "${import.meta.resolve(specifier)}"`;
  });
  const url = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
  sourceCache.set(file.href, url); return url;
}
const { RunServiceDetails } = await import(loadSource('../src/components/run-service-details.tsx'));
const render = (details, props = {}) => renderToStaticMarkup(React.createElement(RunServiceDetails, { run: { details }, runId: 'test', ...props }));

test('材料候选、工艺阶段和服务自报状态可读，零数量不当缺失，不再显示服务进度', () => {
  const html = render({ result: { status: 'partially_completed', all_candidates: [{ candidate_id: 'ALU001' }] }, protocolFrames: [{ stage_id: 'S1', title: '过滤', input_count: 10, output_count: 0 }], progress: [{ title: '材料配方设计', phase: 'complete' }] });
  for (const value of ['部分完成', '服务自报状态', 'ALU001', '工艺阶段', '过滤', '输出0']) assert.ok(html.includes(value), value);
  assert.doesNotMatch(html, /服务进度|材料配方设计/);
  assert.doesNotMatch(html, /科学准确率/);
});

test('确认表单不把服务建议预填为用户答复，只在可答复时显示操作', () => {
  const details = { pendingReview: { requestId: 'r1', title: '确认条件', questions: [{ id: 'q', question: '允许元素', required: true, suggestedAnswer: '服务默认答案' }] } };
  const html = render(details, { canReply: true });
  assert.match(html, /提交答复/); assert.match(html, /服务默认答案/); assert.match(html, /<textarea[^>]*><\/textarea>/);
  assert.doesNotMatch(render(details), /提交答复|停止本次运行/);
  assert.doesNotMatch(render(details, { canReply: true, snapshotOnly: true }), /提交答复|停止本次运行/);
});

test('产物链接拒绝脚本、凭据和HTML注入，结构化内容按文本展示', () => {
  const html = render({ artifacts: [{ name: '<script>危险</script>', url: 'https://example.com/model.glb' }, { url: 'javascript:alert(1)' }, { url: 'https://user:password@example.com/a' }], result: { message: '<img src=x onerror=alert(1)>' } });
  assert.match(html, /服务产物 · 1 项/); assert.match(html, /预览 &lt;script&gt;危险&lt;\/script&gt;/);
  assert.doesNotMatch(html, /javascript:|password@|<script>|<img src=x/);
});

test('未提供快照和采集截断分别提示，合成候选来自阶段帧', () => {
  const html = render({ protocolFrames: [{ candidates: [{ candidate_id: 'cand-001' }] }], snapshot: { ok: false, error: '该服务不提供任务快照接口' }, truncated: true });
  assert.match(html, /cand-001/); assert.match(html, /不提供任务快照/); assert.match(html, /当前记录不完整/);
});

const { RunServiceInfo } = await import(loadSource('../src/components/run-service-info.tsx'));
test('运行信息展示服务与地址，并区分当前配置和未记录，地址不泄露认证参数', () => {
  const info = run => renderToStaticMarkup(React.createElement(RunServiceInfo, { serviceName: '新材料', run }));
  const html = info({ serviceAddress: 'ws://user:password@example.com:1115/start?token=secret#key', serviceAddressSource: 'configuration' });
  assert.match(html, /新材料/); assert.match(html, /服务地址（当前配置）/); assert.match(html, /ws:\/\/example.com:1115\/start/);
  assert.doesNotMatch(html, /password|secret|token=|#key/); assert.match(info(null), /未记录/);
});

test('自动继续明确标注系统答复，不显示人工表单或将发送失败算作已答复', () => {
  const details = { review: [{ action: 'requested', source: 'service' }, { action: 'continue', source: 'automatic', delivery: 'sent', answers: [] }], pendingReview: null };
  const html = render(details, { canReply: true });
  assert.match(html, /测评平台已自动答复继续（1次）/); assert.doesNotMatch(html, /提交答复|确认继续|<form/);
  assert.doesNotMatch(render({ review: [{ action: 'continue', source: 'automatic', delivery: 'failed' }] }), /平台已自动答复继续/);
});

test('自动方案选择摘要可见，确认记录与连接诊断不再展示，失败答复不显示成已确认', () => {
  const details = { review: [{ source: 'automatic', action: 'continue', delivery: 'sent', summary: '自动确认线性堆叠，沿用服务配置。' }, { source: 'automatic', delivery: 'failed', summary: '错误的成功摘要' }], transport: { closeCode: 1006, lastJsonType: 'display.final_answer' } };
  const html = render(details);
  assert.match(html, /自动确认线性堆叠/); assert.doesNotMatch(html, /错误的成功摘要|查看连接诊断|查看确认记录/);
});

test('自动补充条件可回看，等待状态使用中文', () => {
  const html = render({ result: { status: 'waiting_for_input' }, review: [{ source: 'automatic', action: 'apply', delivery: 'sent', model: 'test-model', answers: [{ answer: '假设温度为 900°C。' }] }] });
  assert.match(html, /等待补充信息/); assert.match(html, /查看自动补充的条件/);
  assert.match(html, /test-model/); assert.match(html, /假设温度为 900°C/);
});

test('历史等待结果即使没有可回复连接，也展示服务追问及缺失条件', () => {
  const html = render({ result: { status:'waiting_for_input', user_conclusion:'请补充明确的材料体系。', requirement_interpretation:{questions_to_confirm:['当前已接入的材料体系'],missing_required_inputs:[{label:'当前已接入的材料体系'}]} } });
  assert.match(html, /服务追问/); assert.match(html, /请补充明确的材料体系/); assert.match(html, /当前已接入的材料体系/);
  assert.match(html, /原连接已结束/); assert.doesNotMatch(html, /提交答复/);
});

test('自动重试记录展示首轮追问、模型补充和重试后继续等待的请求', () => {
  const html = render({ autoRetry: { state:'failed', taskId:'second', title:'请补充体系', questions:['材料类型'], message:'假设为高熵合金。', model:'test-model', previousAnswer:'首轮内容' }, result:{ status:'waiting_for_input', user_conclusion:'请补充工艺' } });
  for (const value of ['请补充体系','材料类型','假设为高熵合金','test-model','首轮内容','重试后服务仍要求补充','请补充工艺']) assert.ok(html.includes(value), value);
});

test('协议追问即使自动答复也保留问题供查看', () => {
  const html = render({ protocolFrames:[{ type:'user_input_request', request_id:'r1', parameters:{reason:'requirements'}, message:'请补充温度', data:{questions:['温度是多少？']} }], review:[{source:'automatic',action:'apply',delivery:'sent',answers:[{answer:'假设为室温。'}]}] });
  for (const value of ['请补充温度','温度是多少','假设为室温']) assert.ok(html.includes(value), value);
});

const { resultCandidates, compositionSummary, scalar } = await import(loadSource('../src/lib/structured-results.ts'));
const { StructuredValue } = await import(loadSource('../src/components/structured-value.tsx'));

test('合金预测值保留零、负数、单位和来源，组成基准不转换', () => {
  const [row] = resultCandidates({ all_candidates: [{ candidate_id: 'ALU1', composition_wt_percent: { Al: 95, Cu: 5, Mg: 0 }, predicted_properties: { uts_MPa: { mean: 0, unit: 'MPa', source: 'model-v1' }, expansion: { value: -2, unit: 'ppm/K' } } }] }, []);
  assert.equal(row.basis, 'wt.%'); assert.equal(row.metrics[0].value, 0); assert.equal(row.metrics[0].source, 'model-v1');
  assert.equal(row.metrics[1].value, -2); assert.match(compositionSummary(row), /Al 95/); assert.equal(scalar(false), '否'); assert.equal(scalar(null), '未提供');
});

test('晶体验证只按明确编号关联，不按排序或数组位置借用；不把结束当收敛', () => {
  const rows = resultCandidates({ ranked_candidates: [{ rank: 1, candidate: { candidate_id: 'C1', formula_pretty: 'Al2O3' }, validation: { candidate_id: 'C2', is_valid: true } }], validations: [{ candidate_id: 'C1', is_valid: false, energy_above_hull: 0, metadata: { mattersim: { status: 'completed' } } }] }, []);
  assert.equal(rows[0].valid, false); assert.equal(rows[0].converged, undefined); assert.equal(rows[0].metrics.find(m => m.key === 'energy_above_hull').value, 0); assert.match(rows[0].warning, /编号不一致/);
  const html = render({ snapshot: { data: { ranked_candidates: [{ candidate: { candidate_id: 'C1' }, validation: { candidate_id: 'C1', is_valid: false, metadata: { mattersim: { relaxation_converged: false } } } }] } } });
  assert.match(html, /服务判定无效/); assert.match(html, /未收敛/);
});

test('未知字段可展开，敏感字段隐藏，嵌套文本不执行HTML', () => {
  const html = renderToStaticMarkup(React.createElement(StructuredValue, { value: { future_scalar: '<script>bad</script>', api_key: 'should-hide', future_nested: { data: 0 } } }));
  assert.match(html, /future_scalar/); assert.match(html, /&lt;script&gt;/); assert.match(html, /future_nested/); assert.doesNotMatch(html, /should-hide|<script>/);
});


test('候选汇总保留未排序候选、无编号记录和单独验证，不因缺失ID丢行', () => {
  const rows = resultCandidates({ ranked_candidates: [{ candidate: { candidate_id: 'C1' } }], all_candidates: [{ candidate_id: 'C1' }, { candidate_id: 'C2' }], generation: { candidates: [{ formula_pretty: 'Al' }, { formula_pretty: 'Cu' }] }, validations: [{ candidate_id: 'C3', is_valid: false }] }, []);
  assert.equal(rows.length, 5); assert.equal(rows.filter(row => row.id === 'C1').length, 1); assert.equal(rows.find(row => row.id === 'C3').valid, false);
  assert.equal(resultCandidates({ candidates: [{ formula_pretty: 'Al' }] }, []).length, 1);
});


test('成果整理降级提示可见，不隐藏已有正文和结构化结果', () => {
  assert.match(render({ artifactError: '部分成果路径无效，已跳过对应预览链接' }), /部分成果路径无效/);
});

test('IC模型按类型和调用保留文件链接，拒绝脚本与凭据地址，不把不同结果混在一起', () => {
  const html = render({ protocolFrames: [
    { type: 'IC_STL', request_id: 'first', meta: { layer_count: 0 }, data: [{ key: 'model.glb', src: 'https://example.com/first/model.glb', desc: '堆叠结构' }, { key: '重复', src: 'https://example.com/first/model.glb' }, { key: '危险', src: 'javascript:alert(1)' }] },
    { type: 'IC_STL', request_id: 'second', data: [{ key: 'model.glb', src: 'https://example.com/second/model.glb' }] },
    { type: 'IC_INTERFACE', data: [{ key: 'interface_model.glb', src: 'https://example.com/interface.glb' }, { key: '凭据', src: 'https://user:password@example.com/a' }] },
    { type: 'IC_POWER', data: [{ key: 'power.csv', src: 'https://example.com/power.csv' }] },
  ] });
  for (const value of ['Chiplet 堆叠模型', '芯片键合界面', '功率分布', '/first/model.glb', '/second/model.glb', 'interface_model.glb', 'power.csv', '服务报告层数：0']) assert.ok(html.includes(value), value);
  assert.equal((html.match(/href="https:\/\/example.com\/first\/model.glb"/g) || []).length, 1);
  assert.match(html, /noopener noreferrer/); assert.doesNotMatch(html, /javascript:|password@|>危险</);
});

test('服务输入校验失败时不生成自动补充，直接显示服务错误', () => {
  const html = render({ autoRetry: { state: 'input_error', title: 'heat_treatment must use explicit solution/precipitation stage fields; otherwise supply native process_history' }, result: { status: 'waiting_for_input', user_conclusion: '当前任务无法回答。' } });
  assert.match(html, /不支持修改问题后继续回答/);
  assert.match(html, /heat_treatment/);
  assert.match(html, /未自动补充或重发/);
  assert.doesNotMatch(html, /查看自动补充内容/);
  assert.doesNotMatch(html, /<h3>服务追问<\/h3>/);
});

test('历史自动重试记录若已是服务失败，不展示自动补充内容或重试追问', () => {
  const html = render({ autoRetry: { state: 'failed', taskId: 'second', title: '当前任务无法回答。\n\nheat_treatment must use explicit solution/precipitation stage fields; otherwise supply native process_history', questions: [], message: '复述题目明确条件……假设1：可将题目文字热处理条件映射为两个阶段字段。', model: 'deepseek-chat' }, result: { status: 'waiting_for_input', user_conclusion: '当前任务无法回答。' } });
  assert.match(html, /不支持修改问题后继续回答/);
  assert.match(html, /heat_treatment/);
  assert.doesNotMatch(html, /查看自动补充内容/);
  assert.doesNotMatch(html, /重试后服务仍要求补充/);
});
