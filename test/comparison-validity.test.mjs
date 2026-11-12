import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const compiled = ts.transpileModule(fs.readFileSync(new URL('../src/lib/comparison-validity.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { comparableJudge } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const run = () => ({ executionStatus: 'succeeded', answerTruncated: false, run: { ruleSnapshot: { hash: 'rule' } }, scores: { deepSeekScore: { status: 'ready', model: 'model', quality: { total: 80, source: { truncated: false } } } } });

test('仅在规则、评委和完整有效结果一致时允许分数比较', () => {
  const a = run(); const b = run();
  assert.equal(comparableJudge(a, b, 'deepSeekScore', false), true);
  for (const mutate of [
    value => { value.executionStatus = 'failed'; },
    value => { value.answerTruncated = true; },
    value => { value.run.ruleSnapshot.hash = 'other'; },
    value => { value.run.ruleSnapshot.hash = ''; },
    value => { value.scores.deepSeekScore.status = 'failed'; },
    value => { value.scores.deepSeekScore.model = 'other'; },
    value => { value.scores.deepSeekScore.quality.source.truncated = true; },
    value => { value.scores.deepSeekScore.quality.total = 101; },
  ]) {
    const changed = run(); mutate(changed);
    assert.equal(comparableJudge(a, changed, 'deepSeekScore', false), false);
  }
});

test('图片评分和历史纯文字评分不能直接比较', () => {
  const old = run(); const current = run();
  current.scores.deepSeekScore.quality.source.imageCoverage = { found: 2, sent: 2, overflow: false };
  assert.equal(comparableJudge(old, current, 'deepSeekScore', false), false);
  old.scores.deepSeekScore.quality.source.imageCoverage = { found: 0, sent: 0, overflow: false };
  assert.equal(comparableJudge(old, current, 'deepSeekScore', false), true);
});
