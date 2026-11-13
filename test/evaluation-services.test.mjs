import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const compiled = ts.transpileModule(fs.readFileSync(new URL('../src/lib/evaluation-services.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { availableEvaluationServices, preferredEvaluationService, isEvaluationService } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

test('主服务可用时优先选择Mission，保留已选择的可用服务', () => {
  const services = availableEvaluationServices([{ key: 'mission-material', enabled: true }, { key: 'literature', enabled: true }]);
  assert.equal(preferredEvaluationService(services, 'mission-material'), 'mission-material');
  assert.equal(preferredEvaluationService(services, 'unknown'), 'mission-material');
  assert.equal(preferredEvaluationService(services, 'literature'), 'literature');
});

test('Mission无配置或写权限时不误启用，其他可用服务和全禁用状态可区分', () => {
  const services = availableEvaluationServices([{ key: 'mission-material', enabled: false }, { key: 'literature', enabled: true }]);
  assert.equal(services.find(item => item.key === 'mission-material').enabled, false);
  assert.equal(preferredEvaluationService(services, 'mission-material'), 'literature');
  for (const input of [null, {}, [], [{ key: 'mission-material', enabled: 'true' }], [null]]) {
    const unavailable = availableEvaluationServices(input);
    assert.equal(unavailable.some(item => item.enabled), false);
    assert.equal(preferredEvaluationService(unavailable, 'mission-material'), 'mission-material');
  }
});

test('1110进入新建入口，未知服务仍被忽略', () => {
  const services = availableEvaluationServices([{ key: 'alpha-rsi', enabled: true }, { key: 'unregistered', enabled: true }]);
  assert.equal(services.some(item => item.key === 'unregistered'), false);
  assert.equal(services.find(item => item.key === 'alpha-rsi')?.enabled, true);
  assert.equal(services.some(item => item.enabled), true);
  assert.equal(isEvaluationService('alpha-rsi'), true);
  assert.equal(isEvaluationService('mission-material'), true);
});

test('两个 RSI 独立可用，停用服务不可选择且新材料保留名称', () => {
  const services = availableEvaluationServices(['alpha-rsi', 'alpha-combined-rsi', 'alloy', 'synthesis', 'new-material'].map(key => ({ key, enabled: true })));
  assert.equal(services.find(item => item.key === 'alpha-rsi')?.label, '材料配比 RSI');
  assert.equal(services.find(item => item.key === 'alpha-combined-rsi')?.enabled, true);
  assert.equal(services.find(item => item.key === 'new-material')?.enabled, false);
  assert.equal(services.some(item => ['alloy', 'synthesis'].includes(item.key)), false);
});
