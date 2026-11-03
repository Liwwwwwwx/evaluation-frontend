"use client";

/* eslint-disable @next/next/no-img-element -- 登录校验的同源产物直接读取，保留GIF动图及原始比例。 */

import { createElement, useCallback, useEffect, useState } from "react";
import { AnswerMarkdown } from "@/components/answer-markdown";
import { ArtifactStlPreview } from "@/components/artifact-stl-preview";
import { parsePreviewTable } from "@/lib/artifact-preview";
import { Dialog } from "@/components/ui";
import { record, safeHttpUrl, text } from "@/lib/structured-results";

const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp", "avif", "bmp"];
const TEXT_EXTENSIONS = ["md", "markdown", "txt", "log", "json", "jsonl", "csv", "tsv", "cif", "py", "js", "jsx", "ts", "tsx", "html", "css", "scss", "xml", "yaml", "yml", "sh", "sql", "toml", "ini"];

function ModelPreview({ src, title }: { src: string; title: string }) {
  const [enabled, setEnabled] = useState(true); const [ready, setReady] = useState(false); const [loaded, setLoaded] = useState(false); const [error, setError] = useState(""); const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    import("@google/model-viewer").then(() => { if (active) setReady(true); }).catch(() => { if (active) setError("三维查看器加载失败，可重试或下载原文件。"); });
    return () => { active = false; };
  }, [enabled, attempt]);
  const viewerRef = useCallback((element: HTMLElement | null) => {
    if (!element) return;
    const onLoad = () => setLoaded(true); const onError = () => setError("模型加载失败，可重试或下载原文件。");
    element.addEventListener("load", onLoad); element.addEventListener("error", onError);
    return () => { element.removeEventListener("load", onLoad); element.removeEventListener("error", onError); };
  }, []);
  if (!enabled) return <button type="button" className="secondary-button" onClick={() => setEnabled(true)}>查看三维模型</button>;
  return <div className="result-model-preview">{error ? <div role="status"><p>{error}</p><button type="button" className="secondary-button" onClick={() => { setError(""); setLoaded(false); setAttempt(value => value + 1); }}>重试模型预览</button></div> : <>{!loaded && <p className="run-score-note" role="status">{ready ? "正在读取三维文件…" : "正在加载三维查看器…"}</p>}{ready && createElement("model-viewer", { key: attempt, ref: viewerRef, src: `${src}?previewAttempt=${attempt}`, alt: title, "camera-controls": true, "touch-action": "pan-y", "interaction-prompt": "none", "shadow-intensity": "0.5", class: "result-model-canvas" })}<p className="run-score-note">拖动旋转、滚轮缩放；模型内容以原服务文件为准。</p></>}</div>;
}

function ImagePreview({ src, title }: { src: string; title: string }) {
  const [error, setError] = useState(false); const [attempt, setAttempt] = useState(0);
  if (error) return <div role="status"><p className="run-score-note">图片预览失败，可重试或下载原文件。</p><button type="button" className="secondary-button" onClick={() => { setError(false); setAttempt(value => value + 1); }}>重新加载图片</button></div>;
  return <img className="result-preview-image" src={`${src}?previewAttempt=${attempt}`} alt={title} loading="lazy" onError={() => setError(true)} />;
}

function FilePreview({ src, extension, title }: { src: string; extension: string; title: string }) {
  const [content, setContent] = useState<Uint8Array | null>(null); const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(src, { cache: "no-store", signal: controller.signal });
        if (!response.ok || !response.body) throw Error("文件读取失败，请下载原文件。");
        if (Number(response.headers.get("content-length")) > 20 * 1024 * 1024) throw Error("文件超过 20 MiB 预览上限，请下载查看。");
        const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
        try {
          while (true) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > 20 * 1024 * 1024) throw Error("文件超过 20 MiB 预览上限，请下载查看。"); chunks.push(part.value); }
        } finally { await reader.cancel().catch(() => {}); }
        const data = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.length; }
        if (!controller.signal.aborted) setContent(data);
      } catch (err) { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "文件读取失败。"); }
    }
    void load();
    return () => controller.abort();
  }, [src]);
  if (error) return <p className="run-score-note" role="status">{error}</p>;
  if (!content) return <p className="run-score-note" role="status">正在读取文件内容…</p>;
  if (extension === "pdf") return <PdfPreview content={content} title={title} />;
  let value = new TextDecoder().decode(content);
  if (extension === "md" || extension === "markdown") return <div className="run-answer result-preview-markdown"><AnswerMarkdown content={value} /></div>;
  if (extension === "csv" || extension === "tsv") {
    const table = parsePreviewTable(value, extension === "tsv" ? "\t" : ",");
    return <div className="result-preview-table">{table.truncated && <p className="run-score-note">仅展示前 500 行、100 列，请下载查看完整文件。</p>}<div className="result-preview-table-scroll"><table><tbody>{table.rows.map((row, i) => <tr key={i}>{row.map((cell, j) => i === 0 ? <th key={j}>{cell}</th> : <td key={j}>{cell}</td>)}</tr>)}</tbody></table></div></div>;
  }
  if (extension === "json") { try { value = JSON.stringify(JSON.parse(value), null, 2); } catch { /* 保留原始文本。 */ } }
  return <pre className="result-preview-text">{value}</pre>;
}

function PdfPreview({ content, title }: { content: Uint8Array; title: string }) {
  const ref = useCallback((iframe: HTMLIFrameElement | null) => {
    if (!iframe) return;
    const url = URL.createObjectURL(new Blob([content as BlobPart], { type: "application/pdf" }));
    iframe.src = url;
    return () => { iframe.removeAttribute("src"); URL.revokeObjectURL(url); };
  }, [content]);
  return <iframe ref={ref} title={title} className="result-preview-pdf" />;
}

function previewType(file: Record<string, unknown> | null) {
  if (!file) return "";
  const size = typeof file.size === "number" && Number.isFinite(file.size) ? file.size : null;
  return size && size > 0 ? `${Math.max(1, Math.round(size / 1024))} KB` : "";
}

export function ResultArtifacts({ files, runId }: { files: unknown[]; runId: string }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);
  const valid = files.map((value, index) => ({ file: record(value), index })).filter(item => safeHttpUrl(item.file?.url));
  if (!valid.length) return null;
  const active = activeIndex === null ? null : valid.find((item) => item.index === activeIndex) || null;
  const position = active ? valid.findIndex(item => item.index === active.index) : -1;
  const activeOriginal = active ? safeHttpUrl(active.file?.url) : null;
  const activeTitle = active ? text(active.file?.name) || `产物 ${active.index + 1}` : "";
  const activeExtension = activeOriginal ? new URL(activeOriginal).pathname.split(".").pop()?.toLowerCase() || "" : "";
  const activeSrc = active ? `/api/evaluation/unified/runs/${encodeURIComponent(runId)}/artifacts/${active.index}` : "";
  return <section className="run-service-section result-artifacts" aria-label="服务产物">
    <div className="result-artifacts-head"><h3>服务产物 · {valid.length} 项</h3><p className="run-score-note">点击文件卡片预览；文件保留时间由被测服务决定。</p></div>
    <ul className="result-artifact-grid">
      {valid.map(({ file, index }) => {
        const original = safeHttpUrl(file?.url) as string;
        const title = text(file?.name) || `产物 ${index + 1}`;
        const extension = new URL(original).pathname.split(".").pop()?.toLowerCase() || "";
        const src = `/api/evaluation/unified/runs/${encodeURIComponent(runId)}/artifacts/${index}`;
        const image = IMAGE_EXTENSIONS.includes(extension);
        const meta = previewType(file);
        return <li key={`${index}-${original}`}>
          <button type="button" className="result-artifact-card" onClick={() => setActiveIndex(index)} aria-label={`预览 ${title}`}>
            <span className={`result-artifact-thumb${image ? " is-image" : ""}`} aria-hidden="true">
              {image ? <img src={`${src}?previewAttempt=0`} alt="" loading="lazy" /> : <span className="result-artifact-ext">{extension.toUpperCase() || "文件"}</span>}
            </span>
            <span className="result-artifact-body"><strong title={title}>{title}</strong><span>{extension.toUpperCase() || "文件"}{meta ? ` · ${meta}` : ""} · 点击预览</span></span>
            <span className="result-artifact-open" aria-hidden="true">预览</span>
          </button>
        </li>;
      })}
    </ul>
    <Dialog
      open={active !== null}
      onClose={() => { setActiveIndex(null); setExpanded(false); }}
      title={activeTitle}
      description={`${activeExtension.toUpperCase() || "文件"} · 文件内容以服务原始产物为准`}
      className={`result-preview-dialog${expanded ? " is-expanded" : ""}`}
      contentClassName="result-preview-shell"
      headerActions={<div className="result-preview-actions">
        {active && <a className="secondary-button" href={activeSrc} download={activeTitle}>下载</a>}
        {activeOriginal && <a className="secondary-button" href={activeOriginal} target="_blank" rel="noopener noreferrer">原始地址</a>}
        <button type="button" className="secondary-button" onClick={() => setExpanded(value => !value)}>{expanded ? "退出全屏" : "全屏"}</button>
      </div>}
      footer={active ? <>
        <button type="button" className="secondary-button" disabled={position <= 0} onClick={() => setActiveIndex(valid[position - 1].index)}>上一个</button>
        <span className="result-preview-counter" aria-live="polite">{position + 1} / {valid.length}</span>
        <button type="button" className="secondary-button" disabled={position >= valid.length - 1} onClick={() => setActiveIndex(valid[position + 1].index)}>下一个</button>
      </> : undefined}
    >
      {active && <div className="result-preview-content" key={`${runId}-${active.index}`}>
        {IMAGE_EXTENSIONS.includes(activeExtension) && <ImagePreview src={activeSrc} title={activeTitle} />}
        {activeExtension === "glb" && <ModelPreview src={activeSrc} title={activeTitle} />}
        {activeExtension === "stl" && <ArtifactStlPreview src={activeSrc} />}
        {(activeExtension === "pdf" || TEXT_EXTENSIONS.includes(activeExtension)) && <FilePreview src={activeSrc} extension={activeExtension} title={activeTitle} />}
        {!IMAGE_EXTENSIONS.includes(activeExtension) && !["glb", "stl", "pdf"].includes(activeExtension) && !TEXT_EXTENSIONS.includes(activeExtension) && <p className="run-score-note">该格式暂不支持在线预览，请下载文件或打开原始地址。</p>}
      </div>}
    </Dialog>
  </section>;
}
