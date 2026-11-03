import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../src/lib/assistant-draft.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { assistantDraftKey, readDraft, writeDraft, clearAssistantDrafts } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

test('两个账户的两种草稿隔离，退出只清理当前账户与无法归属的旧草稿', t => {
  const values = new Map();
  const original = globalThis.sessionStorage;
  globalThis.sessionStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  t.after(() => { if (original === undefined) delete globalThis.sessionStorage; else globalThis.sessionStorage = original; });
  for (const kind of ['score', 'standards']) {
    writeDraft(assistantDraftKey(kind, 'alice'), { question: 'Alice 的内容' });
    writeDraft(assistantDraftKey(kind, 'bob'), { question: 'Bob 的内容' });
    writeDraft(`evaluation-assistant-${kind}-v1`, { question: '旧草稿' });
    assert.equal(readDraft(assistantDraftKey(kind, 'alice')).question, 'Alice 的内容');
    assert.equal(readDraft(assistantDraftKey(kind, 'bob')).question, 'Bob 的内容');
  }
  writeDraft(assistantDraftKey('score', undefined), { question: '不应保存' });
  assert.equal(readDraft(assistantDraftKey('score', undefined)), null);
  clearAssistantDrafts('alice');
  for (const kind of ['score', 'standards']) {
    assert.equal(readDraft(assistantDraftKey(kind, 'alice')), null);
    assert.equal(readDraft(`evaluation-assistant-${kind}-v1`), null);
    assert.equal(readDraft(assistantDraftKey(kind, 'bob')).question, 'Bob 的内容');
  }
});
