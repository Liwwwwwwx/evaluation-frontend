"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui";
import { RunComparison } from "@/components/run-comparison";
import { comparisonErrorMessage, normalizeComparisonRun } from "@/lib/comparison-api";
import type { Comparison } from "@/lib/comparison-preview";
import { watchLiveUnifiedRun } from "@/lib/unified-run-watch";
import type { UnifiedRunSnapshot } from "@/lib/unified-run-poll";

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function ComparisonWorkspace({ groupId, backHref = "/runs", backLabel = "返回运行记录" }: { groupId: string; backHref?: string; backLabel?: string }) {
  const [runs, setRuns] = useState<UnifiedRunSnapshot[] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const activeStops = new Map<string, () => void>();
    let active = true;
    fetch(`/api/evaluation/unified/comparisons/${encodeURIComponent(groupId)}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const value = await response.json().catch(() => null);
        if (!response.ok) throw new Error(comparisonErrorMessage(value, response.status));
        return value;
      })
      .then((value) => {
        if (!active) return;
        if (!value || !Array.isArray(value.runs) || value.runs.length === 0) throw new Error("对比组格式异常，请稍后重试。");
        setRuns(value.runs);
        setLoading(false);
        window.dispatchEvent(new Event("evaluation-unified-change"));
        for (const run of value.runs) {
          if (!["queued", "running", "scoring"].includes(run.status) || activeStops.has(run.runId)) continue;
          const stop = watchLiveUnifiedRun(run.runId, {
            onData: (data) => {
              setRuns((current) => current ? current.map((item) => item.runId === data.runId ? { ...item, ...data } : item) : current);
              if (!["queued", "running", "scoring"].includes(data.status)) window.dispatchEvent(new Event("evaluation-unified-change"));
            },
            onError: (message) => setError(message),
          });
          activeStops.set(run.runId, stop);
        }
      })
      .catch((err) => {
        if (!active || controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "无法读取对比结果。");
        setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
      for (const stop of activeStops.values()) stop();
      activeStops.clear();
    };
  }, [groupId, retry]);

  function retryLoad() {
    setRuns(null);
    setError("");
    setLoading(true);
    setRetry((value) => value + 1);
  }

  const comparison = useMemo<Comparison | null>(() => {
    if (!runs || runs.length === 0 || !runs[0].question) return null;
    const native = record(runs[0].run);
    const snapshot = record(record(native?.scoring)?.ruleSnapshot) || record(native?.ruleSnapshot);
    return {
      groupId,
      question: runs[0].question,
      rule: {
        name: typeof snapshot?.name === "string" ? snapshot.name : "默认评分规则",
        version: typeof snapshot?.version === "number" ? snapshot.version : 0,
      },
      createdAt: runs[0].startedAt || new Date().toISOString(),
      runs: runs.map(normalizeComparisonRun),
    };
  }, [runs, groupId]);

  if (loading && !runs) return <div className="chat-state">正在读取对比结果…</div>;
  if (!comparison) {
    return <div className="chat-state">
      <p role={error ? "alert" : undefined}>{error || "对比组不存在或尚未创建。"}</p>
      <div className="run-review-actions">
        <Button type="button" variant="secondary" onClick={retryLoad}>重试读取</Button>
        <Button href="/compare" variant="secondary">新建对比</Button>
      </div>
    </div>;
  }
  if (comparison.runs.length < 2) {
    return <div className="chat-state">
      <p>对比组只创建了一条运行，另一条可能创建失败。</p>
      <div className="run-review-actions">
        <Button href="/runs" variant="secondary">查看运行记录</Button>
        <Button type="button" variant="secondary" onClick={retryLoad}>重试读取</Button>
      </div>
    </div>;
  }
  return <RunComparison comparison={comparison} backHref={backHref} backLabel={backLabel} notice={error || undefined} />;
}
