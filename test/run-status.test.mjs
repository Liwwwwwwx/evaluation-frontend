import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source = fs.readFileSync(new URL('../src/lib/run-status.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { isTerminalRun, isUncertainRun, runStatusLabel } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
test('已结束、失败和取消的运行允许开始下一次测评，未知或进行中的运行不允许', () => {
  for (const status of ['done', 'error', 'cancelled']) assert.equal(isTerminalRun(status), true);
  for (const status of ['queued', 'running', 'scoring', '', undefined, 'unknown']) assert.equal(isTerminalRun(status), false);
});
test('只有排队、运行和评分中的进程外快照显示状态待确认', () => {
  for (const status of ['queued', 'running', 'scoring']) { assert.equal(isUncertainRun(status, 'snapshot_only'), true); assert.equal(runStatusLabel(status, 'snapshot_only'), '状态待确认'); }
  assert.equal(runStatusLabel('running'), '运行中');
  assert.equal(runStatusLabel('done', 'snapshot_only'), '已结束');
  assert.equal(runStatusLabel('error', 'snapshot_only'), '失败');
});
