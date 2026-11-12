import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../src/lib/run-history-status.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { mergeHistoryStatuses } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

test('请求期间收到的实时状态优先，其他对话和名称保持不变', () => {
  const items = [{ id: 'a', status: 'running', recoveryState: 'snapshot_only', title: '用户名称', serviceKey: 'mission-material' }, { id: 'b', status: 'running' }];
  const updates = new Map([['a', { status: 'done', recoveryState: undefined, sequence: 2 }]]);
  assert.deepEqual(mergeHistoryStatuses(items, updates, 1), [{ id: 'a', status: 'done', recoveryState: undefined, title: '用户名称', serviceKey: 'mission-material' }, items[1]]);
  assert.deepEqual(mergeHistoryStatuses(items, updates, 2), items);
});
