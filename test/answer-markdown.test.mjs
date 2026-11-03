import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// 使用现有 TypeScript 编译器加载纯展示组件，不增加测试运行器依赖。
function loadSource(path, aliases = {}) {
  const source = fs.readFileSync(new URL(path, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const code = compiled.replace(/from "([^"]+)"/g, (_, specifier) => `from "${aliases[specifier] || import.meta.resolve(specifier)}"`);
  return `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
}
const normalizerUrl = loadSource('../src/lib/answer-markdown.ts');
const { normalizeAnswerMarkdown: normalize } = await import(normalizerUrl);
const { AnswerMarkdown } = await import(loadSource('../src/components/answer-markdown.tsx', { '@/lib/answer-markdown': normalizerUrl }));
const render = (content, streaming = false) => renderToStaticMarkup(React.createElement(AnswerMarkdown, { content, streaming }));

test('显式公式定界符、同行块公式和 aligned 均进入 KaTeX', () => {
  for (const source of [String.raw`$E=mc^2$`, String.raw`\(\sigma=F/A\)`, String.raw`\[a^2+b^2=c^2\]`, String.raw`$$\frac{a}{b}$$`, '$$ \\begin{aligned}a &= b \\\\\nc &= d\\end{aligned} $$', String.raw`\begin{aligned}a&=b\end{aligned}`]) {
    const html = render(source);
    assert.match(html, /class="katex"/, source); assert.doesNotMatch(html, /class="katex-error"/, source);
  }
  assert.match(render('$$x+y$$'), /katex-display/);
});

test('代码围栏、行内代码、缩进代码中的公式和标记原样保留', () => {
  const source = '```json\n{"example":"[start] $x$ \\(x\\) <think>示例</think>"}\n```\n`[end] $y$`\n\n    <<<CONTENT_START:code>>> $z$';
  assert.equal(normalize(source), source);
  const html = render(source); assert.doesNotMatch(html, /class="katex"/); assert.match(html, /\[start\]/); assert.match(html, /示例/); assert.match(html, /CONTENT_START:code/);
});

test('只隐藏已知控制标记，保留文献正文与数学区间中的标记', () => {
  const source = '【XXX 开始: xxxx】[start]标题\n<<<CONTENT_START:s1>>>正文\n<<<PAPER_START:RAW_LITERATURE>>>论文内容<<<PAPER_END:RAW_LITERATURE>>>\n<think>内部思考内容</think>[end]【XXX 已完成: xxxx】';
  const html = render(source); assert.match(html, /论文内容/); assert.match(html, /正文/);
  assert.doesNotMatch(html, /XXX|CONTENT_START|PAPER_START|\[start\]|\[end\]|内部思考内容/);
  assert.ok(normalize(String.raw`$[start, end]$`).includes('[start, end]'));
  assert.ok(normalize(String.raw`$x_{[start]}$`).includes('[start]'));
});

test('普通 JSON、链接标签、业务标题、金额及无定界符代码不误删或公式化', () => {
  const source = '[start](https://example.com)\n\n【实验完成】\n\n{"type":"progress","value":25}\n\n价格 $5 和 $10；sigma_h = F / A';
  const html = render(source); assert.match(html, /href="https:\/\/example.com"/); assert.match(html, /实验完成/); assert.match(html, /progress/); assert.match(html, /\$5/); assert.match(html, /\$10/); assert.doesNotMatch(html, /class="katex"/);
  const citation = render(String.raw`\[12\] 材料界面研究论文`);
  assert.match(citation, /\[12\]/); assert.doesNotMatch(citation, /class="katex"/);
});

test('未闭合数学不吞标题，未闭合思考与流式协议尾巴不泄露', () => {
  const html = render('$$\\frac{a}{b}\n\n# 后续内容\n这段仍然可读。', true);
  assert.match(html, /<h1>后续内容<\/h1>/); assert.doesNotMatch(html, /class="katex"/);
  assert.doesNotMatch(render('正文<think>内部秘密', true), /内部秘密/);
  assert.equal(normalize('正文<<<PAPER_STA', { streaming: true }), '正文');
  assert.equal(normalize('正文[sta', { streaming: true }), '正文');
  assert.match(render(String.raw`\[x+y`), /x\+y/);
});

test('心跳仅过滤已知字段，代码及业务字段不误删；非法 HTML 不执行', () => {
  assert.equal(normalize('前{"type":"heartbeat.ping","timestamp":1}后'), '前后');
  const business = '{"type":"heartbeat.ping","timestamp":1,"business":"保留"}';
  assert.equal(normalize(business), business);
  assert.equal(normalize('`{"type":"heartbeat.ping","timestamp":1}`'), '`{"type":"heartbeat.ping","timestamp":1}`');
  const html = render('<script>alert(1)</script>\n\n[危险](javascript:alert(1))\n\n**正文**');
  assert.doesNotMatch(html, /<script|javascript:/); assert.match(html, /<strong>正文<\/strong>/);
});

test('表格可横向滚动，非法公式降级为原文而不是错误堆栈', () => {
  assert.match(render('| 项 | 值 |\n|---|---|\n| 强度 | $F/A$ |'), /class="run-table-wrap"/);
  const html = render(String.raw`$\unsupportedcommand{x}$`);
  assert.match(html, /unsupportedcommand/); assert.doesNotMatch(html, /color:#cc0000|KaTeX parse error/);
});

test('HTML 表格、中文加粗和单行块公式按 XIMUALPHA 的结构渲染', () => {
  const html = render('<table><thead><tr><th>样本</th><th>结果</th></tr></thead><tbody><tr><td>A</td><td>通过</td></tr></tbody></table>\n\n**中文加粗**\n\n$$\\frac{a}{b}$$');
  assert.match(html, /<table>/);
  assert.match(html, /<strong>中文加粗<\/strong>/);
  assert.match(html, /katex-display/);
  assert.match(html, /class="run-table-wrap"/);
});

test('代码块使用语言/状态工具条，未闭合围栏在流式阶段降级为代码块', () => {
  const complete = render('```python\nprint(1)\n```');
  assert.match(complete, /code-block-lang">PYTHON/);
  assert.match(complete, /代码已完成/);
  assert.match(complete, /data-variant="code"/);
  const streaming = render('前言\n\n```python\nprint(1)', true);
  assert.match(streaming, /代码生成中/);
  assert.doesNotMatch(streaming, /```python/);
});

test('已闭合代码块保留语法高亮，未知语言和流式代码仍保留原文', () => {
  const highlighted = render('```javascript\nconst answer = "hello";\n```');
  assert.match(highlighted, /<span class="hljs-keyword">const<\/span>/);
  assert.match(highlighted, /<span class="hljs-string">&quot;hello&quot;<\/span>/);
  assert.match(render('```unknown-language\nplain <text>\n```'), /plain &lt;text&gt;/);
  assert.match(render('```javascript\nconst pending = 1;', true), /const pending = 1;/);
});

test('逐段流式输入与最终完整输入使用同一套基础规则', () => {
  const source = '[start]正文\n\n\\[a^2+b^2=c^2\\]\n\n<think>不显示的思考</think>\n<<<PAPER_START:RAW_LITERATURE>>>文献内容<<<PAPER_END:RAW_LITERATURE>>>[end]';
  for (let i = 1; i <= source.length; i++) assert.doesNotThrow(() => render(source.slice(0, i), true));
  assert.equal(render(source, true), render(source, false));
});
