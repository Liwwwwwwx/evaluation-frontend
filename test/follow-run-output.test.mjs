import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

test('运行时跟随正文和内容高度变化，结束后保留滚动位置并断开观察', async t => {
  const slots = [];
  let cursor = 0;
  let pending = [];
  const hooks = {
    useRef(value) { const index = cursor++; return slots[index] ||= { current: value }; },
    useLayoutEffect(effect, deps) {
      const index = cursor++;
      const old = slots[index];
      if (!old || deps.some((value, i) => !Object.is(value, old.deps[i]))) {
        pending.push(() => { old?.cleanup?.(); slots[index] = { deps, cleanup: effect() }; });
      }
    },
  };
  const observers = [];
  const previousObserver = globalThis.ResizeObserver;
  globalThis.ResizeObserver = class {
    constructor(callback) { this.callback = callback; this.targets = []; this.disconnected = false; observers.push(this); }
    observe(target) { this.targets.push(target); }
    disconnect() { this.disconnected = true; }
  };
  globalThis.__runScrollTestHooks = hooks;
  t.after(() => { globalThis.ResizeObserver = previousObserver; delete globalThis.__runScrollTestHooks; });
  const stub = `data:text/javascript;base64,${Buffer.from('export const useRef = (...a) => globalThis.__runScrollTestHooks.useRef(...a); export const useLayoutEffect = (...a) => globalThis.__runScrollTestHooks.useLayoutEffect(...a);').toString('base64')}`;
  const source = fs.readFileSync(new URL('../src/lib/use-follow-run-output.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText.replace('from "react"', `from "${stub}"`);
  const { useFollowRunOutput, isRunOutputActive } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
  assert.equal(isRunOutputActive('running', 'running'), true);
  assert.equal(isRunOutputActive('running'), true);
  assert.equal(isRunOutputActive('queued'), true);
  assert.equal(isRunOutputActive('error', 'running'), false);
  assert.equal(isRunOutputActive('scoring', 'succeeded'), false);
  const question = {}, answerBlock = {};
  const node = { scrollTop: 0, scrollHeight: 800, children: [question, answerBlock] };
  function render(id, active, answer, details) {
    cursor = 0; pending = [];
    // 此测试使用上面的 Hook 桩模拟渲染，不是应用组件调用。
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const ref = useFollowRunOutput(id, active, answer, details);
    ref.current = node;
    for (const run of pending) run();
  }

  const details = {};
  render('a', true, '第一段', details);
  assert.equal(node.scrollTop, 800);
  assert.deepEqual(observers[0].targets, [node, question, answerBlock]);
  node.scrollTop = 100; node.scrollHeight = 1200;
  render('a', true, '第一段和增量', details);
  assert.equal(node.scrollTop, 1200);
  node.scrollTop = 200; node.scrollHeight = 1400;
  observers[0].callback();
  assert.equal(node.scrollTop, 1400);
  node.scrollTop = 300; node.scrollHeight = 1500;
  render('a', false, '最终文本', {});
  assert.equal(node.scrollTop, 1500);
  assert.equal(observers[0].disconnected, true);
  node.scrollTop = 100;
  render('a', false, '最终文本', {});
  assert.equal(node.scrollTop, 100);
  render('b', false, '历史记录', {});
  assert.equal(node.scrollTop, 100);
});
