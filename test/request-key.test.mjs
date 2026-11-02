import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const compiled = ts.transpileModule(fs.readFileSync(new URL('../src/lib/request-key.ts', import.meta.url), 'utf8'), {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {createRequestKey}=await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
test('HTTP 缺少 randomUUID 时仍生成高熵幂等键，保留前导零且不使用 Math.random', t => {
  const previous=Object.getOwnPropertyDescriptor(globalThis,'crypto');
  let calls=0;
  Object.defineProperty(globalThis,'crypto',{configurable:true,value:{getRandomValues(bytes){bytes.fill(0);bytes[15]=++calls;return bytes;}}});
  t.after(()=>Object.defineProperty(globalThis,'crypto',previous));
  assert.equal(createRequestKey(),'00000000000000000000000000000001');
  assert.equal(createRequestKey(),'00000000000000000000000000000002');
});
