import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

const cache = new Map();
function source(path) {
  if (cache.has(path)) return cache.get(path);
  const compiled = ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const code = compiled.replace(/from "([^"]+)"/g, (_, specifier) => {
    if (!specifier.startsWith("@/")) return `from "${import.meta.resolve(specifier)}"`;
    const base = "../src/" + specifier.slice(2);
    const relative = fs.existsSync(new URL(base + ".tsx", import.meta.url)) ? base + ".tsx" : base + ".ts";
    return `from "${source(relative)}"`;
  });
  const url = `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`; cache.set(path, url); return url;
}
const { buildServiceMarkdown, buildComparisonMarkdown, comparisonServiceFilename, comparisonOverviewFilename } = await import(source("../src/lib/comparison-export.ts"));

function requirement(id, requirement, status, note = "") {
  return { id, requirement, status, critical: true, note };
}

function judge(total, requirements, gaps = ["缺少挤压路线"], suggestions = ["补充固溶时效参数"]) {
  return {
    status: "ready",
    model: "deepseek-chat",
    quality: {
      version: "evaluation-v1",
      total,
      dimensions: {
        readability: { label: "可读性", score: 70, weight: 0.5, applicable: true },
        professionalism: { label: "专业性", score: 60, weight: 0.5, applicable: true },
      },
      taskCompletion: { status: "partial", requirements },
      qualification: { status: "not_qualified", passScore: 60 },
      gaps,
      suggestions,
      comment: `${total} 分总评`,
    },
  };
}

function run(serviceKey, serviceLabel, answer, total, requirements) {
  return {
    runId: `${serviceKey}-run`,
    serviceKey,
    serviceLabel,
    executionStatus: "succeeded",
    scoringStatus: "ready",
    answer,
    elapsedMs: 26000,
    scores: { deepSeekScore: judge(total, requirements), qwenScore: judge(total - 2, requirements) },
    run: { ruleSnapshot: { hash: "rule-1" } },
    startedAt: "2026-11-04T05:44:00.000Z",
    scoreError: null,
    error: null,
  };
}

const leftRequirements = [
  requirement("R1", "给出成分优化方案", "missing", "只有通用流程"),
  requirement("R2", "给出挤压工艺路线", "missing", "没有挤压"),
  requirement("R3", "左侧独有要求", "met", "已给出"),
];
const rightRequirements = [
  requirement("R1", "给出成分优化方案", "partial", "引入额外元素"),
  requirement("R2", "给出挤压工艺路线", "missing", "缺少模具参数"),
  requirement("R4", "右侧独有要求", "partial", "只给假设"),
];
const comparison = {
  groupId: "d55b35780b250ea651fe7206d6384b8dd7ae347fd19ecfdec025b566541ef518",
  question: "航空用 Al-Zn-Mg-Cu 合金的成分优化与挤压+固溶时效路线。",
  rule: { name: "默认评分规则", version: 0 },
  createdAt: "2026-11-04T05:44:00.000Z",
  runs: [
    run("synthesis", "合成制备", "合成制备的完整回答", 37.5, leftRequirements),
    run("alpha-rsi", "材料 RSI", "1110 的完整回答", 55, rightRequirements),
  ],
};

test("单服务导出包含问题、回答和双评委评分", () => {
  const value = buildServiceMarkdown(comparison, comparison.runs[0]);
  assert.match(value, /合成制备 · 问题 \/ 回答 \/ 评分/);
  assert.match(value, /航空用 Al-Zn-Mg-Cu 合金/);
  assert.match(value, /合成制备的完整回答/);
  assert.match(value, /### DeepSeek/);
  assert.match(value, /### 千问/);
  assert.match(value, /总分：37.5 \/ 100/);
  assert.match(value, /给出成分优化方案/);
});

test("对比内容导出包含概览、逐项核对和差异摘要", () => {
  const value = buildComparisonMarkdown(comparison);
  assert.match(value, /对比测评 · 对比内容/);
  assert.match(value, /合成制备/);
  assert.match(value, /材料 RSI/);
  assert.match(value, /## 逐项核对/);
  assert.match(value, /给出挤压工艺路线/);
  assert.match(value, /## 差异摘要/);
  assert.match(value, /模型评分不等于独立事实核验/);
});

test("导出文件名带对比组前缀和服务名称", () => {
  assert.match(comparisonServiceFilename(comparison, comparison.runs[0]), /^对比测评-d55b3578-合成制备\.md$/);
  assert.match(comparisonOverviewFilename(comparison), /^对比测评-d55b3578-对比内容\.md$/);
});

test("缺少可选评分字段时仍可导出完整回答和对比", () => {
  const sparse = structuredClone(comparison);
  for (const run of sparse.runs) for (const key of ["deepSeekScore", "qwenScore"]) {
    delete run.scores[key].quality.taskCompletion;
    delete run.scores[key].quality.qualification;
    delete run.scores[key].quality.gaps;
    delete run.scores[key].quality.suggestions;
  }
  assert.match(buildServiceMarkdown(sparse, sparse.runs[0]), /任务完成度：无法确认/);
  assert.match(buildServiceMarkdown(sparse, sparse.runs[0]), /内容判定：无法判断/);
  assert.match(buildComparisonMarkdown(sparse), /对比测评/);
});

test("规则不一致或评分原文截断时，导出不显示领先、逐项优劣或数值分差", () => {
  for (const invalidate of [
    value => { value.runs[1].run.ruleSnapshot.hash = "different"; },
    value => { value.runs[1].scores.deepSeekScore.quality.source = { truncated: true }; },
    value => { value.runs[1].scores.deepSeekScore.model = "other-model"; },
  ]) {
    const value = structuredClone(comparison); invalidate(value);
    const md = buildComparisonMarkdown(value);
    assert.match(md, /评分暂不可比较/);
    assert.doesNotMatch(md, /总分领先/);
    const ds = md.split("### DeepSeek")[1].split("### 千问")[0];
    assert.doesNotMatch(ds, /右侧更好|左侧更好|\| [+-]\d+(?:\.\d+)? \|/);
    assert.match(ds, /不可比/);
    assert.doesNotMatch(md, /双方共同缺少/);
  }
});

test("回答导出保留科学不等式、代码和团队最终交付", () => {
  const value = structuredClone(comparison); const run = value.runs[0];
  run.answer = "温度 0 < T < 100，压力 > 5 MPa。\n\n```js\nconst check = a < b && b > c;\n```";
  run.run.details = { displayEvents: [
    { type: "display.team_output", phase: "end", team: { name: "材料团队" }, content: "团队交付结果" },
    { type: "display.final_answer", phase: "end", content: "最终结论" },
  ] };
  const md = buildServiceMarkdown(value, run);
  assert.match(md, /温度 0 < T < 100，压力 > 5 MPa/);
  assert.match(md, /const check = a < b && b > c/);
  assert.match(md, /团队交付结果/);
  assert.match(md, /最终结论/);
});
