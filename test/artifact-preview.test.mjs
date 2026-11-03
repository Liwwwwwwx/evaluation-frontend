import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../src/lib/artifact-preview.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { parsePreviewTable } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

test('CSV 和 TSV 保留带引号的分隔符、转义引号、单元格内换行及空值', () => {
  assert.deepEqual(parsePreviewTable('\uFEFF名称,内容\r\n"一,二","a""b\n下一行"\r\n末项,', ',').rows,
    [['名称', '内容'], ['一,二', 'a"b\n下一行'], ['末项', '']]);
  assert.deepEqual(parsePreviewTable('a\tb\n1\t2', '\t').rows, [['a', 'b'], ['1', '2']]);
});

test('表格最多显示 500 行和 100 列并提示截断', () => {
  const rows = parsePreviewTable(Array.from({ length: 501 }, () => 'x').join('\n'), ',');
  assert.equal(rows.rows.length, 500); assert.equal(rows.truncated, true);
  const columns = parsePreviewTable(Array.from({ length: 101 }, () => 'x').join(','), ',');
  assert.equal(columns.rows[0].length, 100); assert.equal(columns.truncated, true);
});
