import type { ComparisonJudge, ComparisonRun } from "./comparison-preview";

export type JudgeKey = "deepSeekScore" | "qwenScore";

export function totalOf(value: ComparisonJudge): number | null {
  const total = value.quality?.total;
  return value.status === "ready" && typeof total === "number" && Number.isFinite(total) && total >= 0 && total <= 100 ? total : null;
}

function ruleHash(run: ComparisonRun): string | null {
  const native = run.run as { ruleSnapshot?: { hash?: unknown }; scoring?: { ruleSnapshot?: { hash?: unknown } } } | null;
  const hash = native?.scoring?.ruleSnapshot?.hash || native?.ruleSnapshot?.hash;
  return typeof hash === "string" && hash ? hash : null;
}

export function comparableJudge(left: ComparisonRun, right: ComparisonRun, key: JudgeKey, preview: boolean): boolean {
  const a = left.scores[key]; const b = right.scores[key];
  const sameRule = preview || (!!ruleHash(left) && ruleHash(left) === ruleHash(right));
  const sameImageMode = Boolean(a.quality?.source?.imageCoverage) === Boolean(b.quality?.source?.imageCoverage);
  return sameRule && left.executionStatus === "succeeded" && right.executionStatus === "succeeded"
    && sameImageMode
    && !left.answerTruncated && !right.answerTruncated && !a.quality?.source?.truncated && !b.quality?.source?.truncated
    && !!a.model && a.model === b.model && totalOf(a) !== null && totalOf(b) !== null;
}
