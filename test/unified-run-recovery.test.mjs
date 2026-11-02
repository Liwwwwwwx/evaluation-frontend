import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

async function source(path) {
  const code = ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}
const { createUnifiedRun } = await source('../src/lib/unified-run-request.ts');
const { watchUnifiedRun } = await source('../src/lib/unified-run-poll.ts');
const id = '11111111-1111-4111-8111-111111111111';
const pendingKey = 'evaluation-unified-pending';
const question = JSON.stringify({ serviceKey: 'literature', question: '检索芯片封装导热界面材料相关文献。' });
const flush = () => new Promise(resolve => setImmediate(resolve));
function memoryStorage() { const map = new Map(); return { getItem: key => map.get(key) || null, setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key) }; }
function run(status = 'running') { return { runId: id, serviceKey: 'literature', question: '原题', answer: '已保存正文', status }; }

test('首次创建明确拒绝后可更换题目，不把拒绝当未知结果', async () => {
  for (const status of [400, 401, 403, 404, 409, 413, 415, 429, 503]) {
    const storage = memoryStorage();
    await assert.rejects(createUnifiedRun(question, { storage, request: async () => Response.json({ error: { code: status === 503 ? 'EVALUATION_WRITE_DISABLED' : 'REJECTED' } }, { status }) }));
    assert.equal(storage.getItem(pendingKey), null, String(status));
    assert.equal(await createUnifiedRun(question + ' ', { storage, request: async () => Response.json({ runId: id }) }), id);
  }
});

test('网络中断后的重试保留原幂等键，即使重试返回拒绝也不能解除未知状态', async () => {
  for (const status of [400, 403, 429]) {
    const storage = memoryStorage(); const keys = [];
    await assert.rejects(createUnifiedRun(question, { storage, request: async (_, init) => { keys.push(init.headers['Idempotency-Key']); throw Error('网络中断'); } }));
    await assert.rejects(createUnifiedRun(question, { storage, request: async (_, init) => { keys.push(init.headers['Idempotency-Key']); return Response.json({ error: '暂不可提交' }, { status }); } }));
    assert.ok(storage.getItem(pendingKey)); assert.equal(keys[0], keys[1]);
    await assert.rejects(createUnifiedRun(question + '换题', { storage, request: async () => { throw Error('不得发起新请求'); } }), /原题和原服务/);
    assert.equal(await createUnifiedRun(question, { storage, request: async (_, init) => { assert.equal(init.headers['Idempotency-Key'], keys[0]); return Response.json({ runId: id }); } }), id);
  }
});

test('网关错误、缺失运行ID和损坏的本地记录不会悄悄换新幂等键', async () => {
  for (const response of [Response.json({ error: '网关不可用' }, { status: 503 }), Response.json({}), Response.json(null)]) {
    const storage = memoryStorage(); await assert.rejects(createUnifiedRun(question, { storage, request: async () => response })); assert.ok(storage.getItem(pendingKey));
  }
  const storage = memoryStorage(); storage.setItem(pendingKey, '{}');
  await assert.rejects(createUnifiedRun(question, { storage, request: async () => { throw Error('不得发起'); } }), /状态无法读取/);
});

test('运行详情临时失败后自动恢复，保留已有结果且只发GET读取', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let calls = 0; const states = []; const errors = [];
  const stop = watchUnifiedRun(id, { onData: data => states.push(data.status), onError: (_, retrying) => errors.push(retrying), request: async (url, init) => {
    assert.match(url, /runs\/11111111/); assert.equal(init.method, undefined);
    if (++calls === 2) throw Error('临时断网'); return Response.json(run(calls > 2 ? 'done' : 'running'));
  } }); t.after(stop);
  await flush(); t.mock.timers.tick(5000); await flush();
  assert.deepEqual(states, ['running']); assert.deepEqual(errors, [true]);
  t.mock.timers.tick(1000); await flush(); assert.deepEqual(states, ['running', 'done']);
  t.mock.timers.tick(60000); await flush(); assert.equal(calls, 3);
});

test('排队任务和恢复中的快照继续轮询', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let calls = 0; const states = [];
  const stop = watchUnifiedRun(id, { onData: data => states.push(data.status), onError() {}, request: async () => Response.json(run(++calls === 1 ? 'queued' : 'running')) });
  await flush(); t.mock.timers.tick(5000); await flush(); stop();
  assert.deepEqual(states, ['queued', 'running']);
  let reads = 0;
  const stopSnapshot = watchUnifiedRun(id, { onData() {}, onError() {}, request: async () => { reads++; return Response.json({ ...run('queued'), recoveryState: 'snapshot_only' }); } });
  await flush(); t.mock.timers.tick(30000); await flush(); stopSnapshot();
  assert.equal(reads, 2);
});

test('连续失败最多自动重试3次，之后可手动重新订阅读取', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let calls = 0; const errors = [];
  const stop = watchUnifiedRun(id, { onData() {}, onError: (_, retrying) => errors.push(retrying), request: async () => { calls++; throw Error('临时失败'); } }); t.after(stop);
  await flush(); for (const delay of [1000, 2000, 4000]) { t.mock.timers.tick(delay); await flush(); }
  t.mock.timers.tick(60000); await flush(); assert.equal(calls, 4); assert.deepEqual(errors, [true, true, true, false]);
  stop(); let recovered = false;
  const retry = watchUnifiedRun(id, { onData: () => { recovered = true; }, onError() {}, request: async () => Response.json(run('done')) }); t.after(retry);
  await flush(); assert.equal(recovered, true);
});

test('新建/离开后取消旧轮询，迟到响应不能覆盖新的任务视图', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let release; let calls = 0; const states = [];
  const stop = watchUnifiedRun(id, { onData: data => states.push(data), onError: () => states.push('error'), request: (_, init) => {
    calls++; return new Promise(resolve => { release = () => { assert.equal(init.signal.aborted, true); resolve(Response.json(run())); }; });
  } });
  stop(); release(); await flush(); t.mock.timers.tick(60000); await flush();
  assert.equal(calls, 1); assert.deepEqual(states, []);
});

test('请求超时可重试，权限或不存在错误停止自动读取', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const errors = []; let calls = 0;
  const stop = watchUnifiedRun(id, { onData() {}, onError: (_, retrying) => errors.push(retrying), request: (_, init) => {
    calls++; return new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(Error('超时'))));
  } });
  t.mock.timers.tick(15000); await flush(); assert.deepEqual(errors, [true]);
  stop(); t.mock.timers.tick(60000); await flush(); assert.equal(calls, 1);
  for (const status of [401, 403, 404]) {
    const failures = []; let reads = 0;
    const cancel = watchUnifiedRun(id, { onData() {}, onError: (_, retrying) => failures.push(retrying), request: async () => { reads++; return Response.json({ error: '不可读取' }, { status }); } });
    await flush(); t.mock.timers.tick(60000); await flush(); cancel(); assert.equal(reads, 1); assert.deepEqual(failures, [false]);
  }
});
