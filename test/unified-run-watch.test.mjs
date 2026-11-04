import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const cache = new Map();
function source(path) {
  if (cache.has(path)) return cache.get(path);
  const compiled = ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const code = compiled.replace(/from "(@\/[^" ]+)"/g, (_, specifier) => `from "${source('../src/' + specifier.slice(2) + '.ts')}"`);
  const url = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
  cache.set(path, url); return url;
}
const { watchLiveUnifiedRun } = await import(source('../src/lib/unified-run-watch.ts'));
const id = '11111111-1111-4111-8111-111111111111';
const base = `/api/evaluation/unified/runs/${id}`;
const flush = () => new Promise(resolve => setImmediate(resolve));
const snapshot = (extra = {}) => ({ runId: id, serviceKey: 'mission-material', question: '原题', answer: '已保存', status: 'running', executionStatus: 'running', answerTruncated: false, run: null, scores: null, scoreError: null, error: null, origin: 'manual', questionId: null, datasetVersion: null, ...extra });
function stream() {
  let writer;
  const body = new ReadableStream({ start(controller) { writer = controller; } });
  return { response: () => new Response(body, { headers: { 'Content-Type': 'text/event-stream' } }), push(event, data) { writer.enqueue(new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)); }, close() { writer.close(); }, fail() { writer.error(Error('连接断开')); } };
}

test('已有运行立即订阅SSE，文字不等待5秒，订阅快照不重复拼接', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const live = stream(); const calls = []; const states = [];
  const stop = watchLiveUnifiedRun(id, { onData: value => states.push(value), onError: assert.fail, request: async (url, init) => { calls.push({ url, init }); return url.endsWith('/events') ? live.response() : Response.json(snapshot()); } }); t.after(stop);
  await flush(); assert.deepEqual(calls.map(call => call.url), [base, base + '/events']);
  live.push('snapshot', { ...snapshot({ answer: '订阅时正文' }), live: true });
  live.push('text', { runId: id, delta: '新增文字' });
  live.push('text', { runId: 'other-run', delta: '不得串入' });
  await flush(); assert.equal(states.at(-1).answer, '订阅时正文新增文字');
  assert.equal(calls.length, 2); // 没有推进轮询计时器，增量已到达。
  assert.ok(calls.every(call => call.init.method === undefined));
  stop(); live.close(); await flush();
});

test('状态、评分与结束实时更新，结束后补读权限且停止继续轮询', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const live = stream(); const states = []; let reads = 0;
  const scores = { deepSeekScore: { status: 'ready' }, qwenScore: { status: 'failed' } };
  const stop = watchLiveUnifiedRun(id, { onData: value => states.push(value), onError: assert.fail, request: async url => url.endsWith('/events') ? live.response() : Response.json(snapshot(++reads === 1 ? {} : { status: 'done', canRescore: true, scores, scoringStatus: 'partial' })) }); t.after(stop);
  await flush(); live.push('state', { runId: id, run: { details: { progress: ['执行中'] } }, canReply: false });
  live.push('run', { runId: id, status: 'done', details: { progress: ['完成'] } });
  live.push('score', { runId: id, scores, scoringStatus: 'partial' });
  live.push('done', { runId: id, status: 'done', executionStatus: 'succeeded', scoringStatus: 'partial' });
  await flush(); assert.equal(states.at(-1).status, 'done'); assert.equal(states.at(-1).executionStatus, 'succeeded'); assert.equal(states.at(-1).scoringStatus, 'partial'); assert.deepEqual(states.at(-1).scores, scores);
  live.close(); await flush(); assert.equal(states.at(-1).canRescore, true); assert.equal(reads, 2);
  t.mock.timers.tick(60000); await flush(); assert.equal(reads, 2);
});

test('状态变化通知侧栏，正文增量和相同状态不会重复通知', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const originalWindow = globalThis.window;
  const events = new EventTarget(); globalThis.window = events;
  t.after(() => { if (originalWindow === undefined) delete globalThis.window; else globalThis.window = originalWindow; });
  const statuses = []; events.addEventListener('evaluation-run-status', event => statuses.push(event.detail));
  const live = stream();
  const stop = watchLiveUnifiedRun(id, { onData() {}, onError: assert.fail, request: async url => url.endsWith('/events') ? live.response() : Response.json(snapshot()) }); t.after(stop);
  await flush();
  live.push('text', { runId: id, delta: '正文' });
  live.push('run', { runId: id, status: 'done' });
  live.push('done', { runId: id, status: 'done' });
  await flush();
  assert.deepEqual(statuses.map(value => value.status), ['running', 'scoring', 'done']);
  assert.ok(statuses.every(value => value.runId === id));
  stop(); live.close(); await flush();
});

test('流中断回退为原ID只读轮询，不重复发起或无限重连', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const live = stream(); const calls = []; const states = []; const errors = []; let reads = 0;
  const stop = watchLiveUnifiedRun(id, { maxReconnects: 0, onData: value => states.push(value), onError: (message, retrying) => errors.push({ message, retrying }), request: async (url, init) => { calls.push({ url, init }); return url.endsWith('/events') ? live.response() : Response.json(snapshot({ status: ++reads < 3 ? 'running' : 'done', answer: '保存正文' })); } }); t.after(stop);
  await flush(); live.push('text', { delta: '新增' }); await flush(); assert.equal(states.at(-1).answer, '保存正文新增');
  live.fail(); await flush(); assert.equal(reads, 2); assert.equal(errors.length, 1); assert.equal(errors[0].retrying, true);
  t.mock.timers.tick(5000); await flush(); assert.equal(states.at(-1).status, 'done');
  assert.equal(calls.filter(call => call.url.endsWith('/events')).length, 1); assert.ok(calls.every(call => call.init.method === undefined && call.url.startsWith(base)));
});

test('已完成和进程外快照不建立无效实时连接，快照仍可只读刷新', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  for (const extra of [{ status: 'done' }, { status: 'running', recoveryState: 'snapshot_only' }]) {
    const calls = [];
    const stop = watchLiveUnifiedRun(id, { onData() {}, onError: assert.fail, request: async url => { calls.push(url); return Response.json(snapshot(extra)); } });
    await flush(); t.mock.timers.tick(5000); await flush(); stop();
    assert.ok(calls.every(url => url === base)); assert.equal(calls.length, extra.status === 'done' ? 1 : 2);
  }
});

test('离开页面取消订阅，迟到文字和异常不覆盖其他运行', async t => {
  const live = stream(); const states = []; const errors = []; let signal; let calls = 0;
  const stop = watchLiveUnifiedRun(id, { onData: value => states.push(value), onError: value => errors.push(value), request: async (url, init) => { calls++; if (url.endsWith('/events')) { signal = init.signal; return live.response(); } return Response.json(snapshot()); } }); t.after(stop);
  await flush(); stop(); assert.equal(signal.aborted, true);
  live.push('text', { delta: '迟到正文' }); live.fail(); await flush();
  assert.equal(states.length, 1); assert.deepEqual(errors, []); assert.equal(calls, 2);
});

test('15秒仅限制连接建立，不截断已经建立的长任务实时流', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const live = stream(); const states = []; let signal;
  const stop = watchLiveUnifiedRun(id, { onData: value => states.push(value), onError: assert.fail, request: async (url, init) => { if (url.endsWith('/events')) { signal = init.signal; return live.response(); } return Response.json(snapshot()); } }); t.after(stop);
  await flush(); t.mock.timers.tick(20000); await flush(); assert.equal(signal.aborted, false);
  live.push('text', { delta: '长任务新增' }); await flush(); assert.equal(states.at(-1).answer, '已保存长任务新增');
  stop(); live.close(); await flush();
});


test('只有心跳也维持流活跃；半开连接超时只读取原任务', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let writer; const body = new ReadableStream({ start(controller) { writer = controller; } });
  const states = []; const errors = []; const calls = []; let reads = 0;
  const stop = watchLiveUnifiedRun(id, { onData: value => states.push(value), onError: value => errors.push(value), request: async (url, init) => {
    calls.push(url); if (url.endsWith('/events')) { init.signal.addEventListener('abort', () => writer.error(Error('idle aborted')), { once: true }); return new Response(body, { headers: { 'Content-Type': 'text/event-stream' } }); }
    return Response.json(snapshot({ status: ++reads > 1 ? 'done' : 'running' }));
  } }); t.after(stop);
  await flush(); t.mock.timers.tick(45000); writer.enqueue(new TextEncoder().encode(': heartbeat\n\n')); await flush();
  t.mock.timers.tick(45000); await flush(); assert.equal(errors.length, 0);
  writer.enqueue(new TextEncoder().encode('event: state\ndata: ' + JSON.stringify({ runId: id, run: { details: { displayEvents: [{ type: 'display.team_output', event_id: 't', phase: 'delta', delta: '实时团队输出' }] } } }) + '\n\n')); await flush();
  assert.equal(states.at(-1).run.details.displayEvents[0].delta, '实时团队输出');
  t.mock.timers.tick(60000); await flush(); assert.equal(errors.length, 1); assert.equal(reads, 2); assert.equal(states.at(-1).status, 'done'); assert.equal(calls.filter(url => url.endsWith('/events')).length, 1);
});


test('临时断流按原ID重新附着实时流，快照替换后继续增量且不重发题目', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const first = stream(); const second = stream(); const states = []; const calls = []; let connections = 0;
  const stop = watchLiveUnifiedRun(id, { onData: value => states.push(value), onError() {}, request: async (url, init) => { calls.push({ url, method: init.method }); return url.endsWith('/events') ? (++connections === 1 ? first.response() : second.response()) : Response.json(snapshot({ answer: '权威快照' })); } }); t.after(stop);
  await flush(); first.fail(); await flush(); assert.equal(connections, 1); t.mock.timers.tick(1000); await flush(); assert.equal(connections, 2);
  second.push('snapshot', { ...snapshot({ answer: '最新正文' }), live: true }); second.push('text', { delta: '继续输出' }); await flush();
  assert.equal(states.at(-1).answer, '最新正文继续输出'); assert.ok(calls.every(call => call.method === undefined && call.url.startsWith(base)));
  stop(); second.close(); await flush();
});

test('实时连接重试有上限，预算耗尽继续只读轮询', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] }); let connections = 0;
  const stop = watchLiveUnifiedRun(id, { maxReconnects: 2, onData() {}, onError() {}, request: async url => url.endsWith('/events') ? (connections++, Response.json({ error: '暂不可用' }, { status: 503 })) : Response.json(snapshot()) }); t.after(stop);
  await flush(); t.mock.timers.tick(1000); await flush(); t.mock.timers.tick(2000); await flush(); assert.equal(connections, 3);
  t.mock.timers.tick(30000); await flush(); assert.equal(connections, 3);
});
