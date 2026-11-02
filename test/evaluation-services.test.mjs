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

test('新建入口忽略1110和未知服务，即使服务发现将其标为可用', () => {
  const services = availableEvaluationServices([{ key: 'alpha-rsi', enabled: true }, { key: 'unregistered', enabled: true }]);
  assert.equal(services.some(item => ['alpha-rsi', 'unregistered'].includes(item.key)), false);
  assert.equal(services.some(item => item.enabled), false);
  assert.equal(isEvaluationService('alpha-rsi'), false);
  assert.equal(isEvaluationService('mission-material'), true);
});
