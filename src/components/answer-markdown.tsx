"use client";

import { isValidElement, memo, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import { normalizeAnswerMarkdown } from "@/lib/answer-markdown";

const remarkPlugins = [remarkGfm, remarkMath];
const rehypePlugins: NonNullable<React.ComponentProps<typeof Markdown>["rehypePlugins"]> = [
  [rehypeKatex, { trust: false, strict: "ignore", throwOnError: false, errorColor: "inherit" }],
  [rehypeHighlight, { detect: false, ignoreMissing: true }],
];
const COLLAPSED_CODE_LINES = 5;

type CodeProps = { className?: string; "data-language"?: string; children?: ReactNode };

function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return "";
}

function copyText(text: string) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  const copied = document.execCommand("copy");
  area.remove();
  return copied ? Promise.resolve() : Promise.reject(new Error("copy unavailable"));
}

function CodeBlock({ children }: { children?: ReactNode }) {
  const code = isValidElement<CodeProps>(children) ? children.props : null;
  const language = code?.["data-language"] ?? /language-([\w-]+)/.exec(code?.className ?? "")?.[1];
  const source = textOf(code?.children).replace(/\n$/, "");
  const canCollapse = source.split("\n").length > COLLAPSED_CODE_LINES;
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  async function copy() {
    try {
      await copyText(source);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1200);
    } catch { /* 复制失败不打断阅读 */ }
  }
  return <div className="code-block" data-collapsible={canCollapse} data-expanded={expanded}>
    <div className="code-block-head">
      <span className="code-block-lang">{language ? language.toUpperCase() : "代码"}</span>
      <div className="code-block-actions">
        <button type="button" className="code-block-action" aria-label={copied ? "已复制代码" : "复制代码"} data-copied={copied || undefined} onClick={() => void copy()}>
          {copied ? <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 4 4L19 6" /></svg> : <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5h10" /></svg>}
          <span className="code-block-copy-label">{copied ? "已复制" : "复制"}</span>
        </button>
        {canCollapse && <button type="button" className="code-block-action code-block-toggle" aria-expanded={expanded} aria-label={expanded ? "收起代码" : "展开代码"} onClick={() => setExpanded(value => !value)}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg></button>}
      </div>
    </div>
    <pre className="code-block-pre">{children}</pre>
  </div>;
}

const components: NonNullable<React.ComponentProps<typeof Markdown>["components"]> = {
  table: ({ children }) => <div className="run-table-wrap"><table>{children}</table></div>,
  code: ({ className, children }) => {
    const language = /language-([\w-]+)/.exec(className ?? "")?.[1];
    return <code className={className} data-language={language}>{children}</code>;
  },
  pre: CodeBlock,
};

export const AnswerMarkdown = memo(function AnswerMarkdown({ content, streaming = false, empty = "暂无回答。" }: { content: string; streaming?: boolean; empty?: string }) {
  const display = useMemo(() => normalizeAnswerMarkdown(content, { streaming }), [content, streaming]);
  return <Markdown skipHtml remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} components={components}>{display.trim() ? display : empty}</Markdown>;
});
