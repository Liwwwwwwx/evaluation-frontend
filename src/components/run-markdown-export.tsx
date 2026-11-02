"use client";

import { useState } from "react";
import { buildRunMarkdown, runMarkdownFilename } from "@/lib/run-markdown";
import { type UnifiedRunSnapshot } from "@/lib/unified-run-poll";

export function RunMarkdownExport({ run, readError }: { run: UnifiedRunSnapshot; readError: string }) {
  const [error, setError] = useState("");
  function download() {
    setError("");
    let url = "";
    let link: HTMLAnchorElement | undefined;
    try {
      const content = buildRunMarkdown(run, { readError });
      url = URL.createObjectURL(new Blob([content], { type: "text/markdown;charset=utf-8" }));
      link = document.createElement("a"); link.href = url; link.download = runMarkdownFilename(run.runId);
      document.body.append(link); link.click();
    } catch { setError("Markdown 导出失败，请重试。"); }
    finally { link?.remove(); if (url) window.setTimeout(() => URL.revokeObjectURL(url), 30000); }
  }
  return <div className="run-export"><button type="button" className="secondary-button run-export-button" aria-label="导出 Markdown 文件" onClick={download}>导出 MD</button>
    {error && <span className="run-export-error" role="alert">{error}</span>}</div>;
}
