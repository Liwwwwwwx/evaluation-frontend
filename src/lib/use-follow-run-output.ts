"use client";

import { useLayoutEffect, useRef } from "react";

export function isRunOutputActive(status?: string, executionStatus?: string) {
  return status === "queued" || (status === "running" && (!executionStatus || executionStatus === "running"));
}

// 仅运行期间跟随对话区域；结束后保留用户的滚动位置。
export function useFollowRunOutput(runId: string | undefined, active: boolean, answer: string | undefined, details: unknown) {
  const container = useRef<HTMLDivElement>(null);
  const previous = useRef<{ runId: string | undefined; active: boolean }>({ runId: undefined, active: false });

  useLayoutEffect(() => {
    const wasActive = previous.current.runId === runId && previous.current.active;
    if ((active || wasActive) && container.current) container.current.scrollTop = container.current.scrollHeight;
    previous.current = { runId, active };
  }, [runId, active, answer, details]);

  useLayoutEffect(() => {
    const node = container.current;
    if (!active || !node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => { node.scrollTop = node.scrollHeight; });
    observer.observe(node);
    for (const child of node.children) observer.observe(child);
    return () => observer.disconnect();
  }, [runId, active]);

  return container;
}
