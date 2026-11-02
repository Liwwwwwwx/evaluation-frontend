"use client";

/* eslint-disable @next/next/no-img-element -- 登录校验的同源产物直接读取，保留GIF动图及原始比例。 */

import { createElement, useCallback, useEffect, useState } from "react";
import { AnswerMarkdown } from "@/components/answer-markdown";
import { StructuredValue } from "@/components/structured-value";
import { record, safeHttpUrl, text } from "@/lib/structured-results";

function ModelPreview({ src, title }: { src: string; title: string }) {
  const [enabled, setEnabled] = useState(false); const [ready, setReady] = useState(false); const [loaded, setLoaded] = useState(false); const [error, setError] = useState(""); const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    import("@google/model-viewer").then(() => { if (active) setReady(true); }).catch(() => { if (active) setError("三维查看器加载失败，可重试或打开原文件。"); });
    return () => { active = false; };
  }, [enabled, attempt]);
  const viewerRef = useCallback((element: HTMLElement | null) => {
    if (!element) return;
    const onLoad = () => setLoaded(true); const onError = () => setError("模型加载失败，可重试或打开原文件。");
    element.addEventListener("load", onLoad); element.addEventListener("error", onError);
    return () => { element.removeEventListener("load", onLoad); element.removeEventListener("error", onError); };
  }, []);
  if (!enabled) return <button type="button" className="secondary-button" onClick={() => setEnabled(true)}>查看三维模型</button>;
  return <div className="result-model-preview">{error ? <div role="status"><p>{error}</p><button type="button" className="secondary-button" onClick={() => { setError(""); setLoaded(false); setAttempt(value => value + 1); }}>重试模型预览</button></div> : <>{!loaded && <p className="run-score-note" role="status">{ready ? "正在读取三维文件…" : "正在加载三维查看器…"}</p>}{ready && createElement("model-viewer", { key: attempt, ref: viewerRef, src: `${src}?previewAttempt=${attempt}`, alt: title, "camera-controls": true, "touch-action": "pan-y", "interaction-prompt": "none", "shadow-intensity": "0.5", class: "result-model-canvas" })}<p className="run-score-note">拖动旋转、滚轮缩放；模型内容以原服务文件为准。</p></>}</div>;
}

function ImagePreview({ src, title }: { src: string; title: string }) {
  const [error, setError] = useState(false); const [attempt, setAttempt] = useState(0);
  return error ? <div role="status"><p className="run-score-note">图片预览失败，可重试或打开原文件。</p><button type="button" className="secondary-button" onClick={() => { setError(false); setAttempt(value => value + 1); }}>重新加载图片</button></div> : <a href={src} target="_blank" rel="noopener noreferrer" aria-label={`查看原图：${title}`}><img className="result-artifact-image" src={`${src}?previewAttempt=${attempt}`} alt={title} loading="lazy" onError={() => setError(true)} /></a>;
}

function TextPreview({ src, extension }: { src: string; extension: string }) {
  const [content, setContent] = useState<string | null>(null); const [error, setError] = useState(""); const [loading, setLoading] = useState(false);
  async function load() {
    setLoading(true); setError("");
    try {
      const response = await fetch(src, { cache: "no-store" }); if (!response.ok || !response.body) throw Error("文件读取失败，请打开原文件。");
      const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
      try {
        while (true) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > 1024 * 1024) throw Error("文本超过1MiB预览上限，请下载查看。"); chunks.push(part.value); }
      } finally { await reader.cancel().catch(() => {}); }
      const data = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.length; }
      setContent(new TextDecoder().decode(data));
    } catch (err) { setError(err instanceof Error ? err.message : "文件读取失败。"); }
    finally { setLoading(false); }
  }
  let json: unknown; if (extension === "json" && content !== null) { try { json = JSON.parse(content); } catch {} }
  return <div className="result-text-preview">{content === null ? <button type="button" className="secondary-button" disabled={loading} onClick={() => void load()}>{loading ? "正在读取…" : "预览文件内容"}</button> : <><button type="button" className="secondary-button" onClick={() => setContent(null)}>收起文件预览</button>{extension === "md" ? <div className="run-answer"><AnswerMarkdown content={content} /></div> : json !== undefined ? <StructuredValue value={json} /> : <pre>{content}</pre>}</>}{error && <p className="run-score-note" role="status">{error}</p>}</div>;
}

export function ResultArtifacts({ files, runId }: { files: unknown[]; runId: string }) {
  const valid = files.map((value, index) => ({ file: record(value), index })).filter(item => safeHttpUrl(item.file?.url));
  if (!valid.length) return null;
  return <section className="run-service-section result-artifacts" aria-label="服务产物"><h3>服务产物 · {valid.length} 项</h3><p className="run-score-note">图片与模型按原文件展示；文件保留时间由被测服务决定。</p>{valid.map(({ file, index }) => {
    const original = safeHttpUrl(file?.url); const title = text(file?.name) || `产物 ${index + 1}`;
    const extension = new URL(original).pathname.split(".").pop()?.toLowerCase() || "";
    const src = `/api/evaluation/unified/runs/${encodeURIComponent(runId)}/artifacts/${index}`;
    return <div className="result-artifact" key={`${index}-${original}`}><div className="structured-section-head"><h4>{title}</h4><span className="result-file-type">{extension.toUpperCase() || "文件"}</span></div>
      {["png", "jpg", "jpeg", "gif", "webp"].includes(extension) && <ImagePreview src={src} title={title} />}
      {extension === "glb" && <ModelPreview src={src} title={title} />}
      {["md", "txt", "json", "csv", "cif"].includes(extension) && <TextPreview src={src} extension={extension} />}
      <div className="result-artifact-actions"><a href={src} target="_blank" rel="noopener noreferrer" download>打开文件</a><a href={original} target="_blank" rel="noopener noreferrer">原始地址</a></div>
    </div>;
  })}</section>;
}
