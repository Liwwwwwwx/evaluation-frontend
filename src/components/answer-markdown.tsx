"use client";

import { isValidElement, memo, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Markdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkBreaks from "remark-breaks";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import { normalizeAnswerMarkdown } from "@/lib/answer-markdown";

type MdNode = {
  type: string;
  value?: string;
  children?: MdNode[];
  position?: { start?: { offset?: number }; end?: { offset?: number } };
};

const COLLAPSED_CODE_LINES = 5;
const COLLAPSED_RESULT_LINES = 10;
const COLLAPSED_ERROR_LINES = 2;

const OUTPUT_LANGUAGES = new Set(["text", "txt", "plaintext", "output", "stdout", "stderr", "console", "log", "result"]);

type CodeVariant = "code" | "error" | "result" | "text";

type CodeProps = { className?: string; "data-language"?: string; children?: ReactNode };

function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return "";
}

function isPythonError(source: string) {
  const value = source.trimStart();
  if (/^Error\s*:/i.test(value) || /Traceback\s*\(most recent call last\)/i.test(value)) return true;
  const hasTraceback = /\bTraceback\b/i.test(value);
  const hasJupyterFrame = /Cell In\[\d+\], line \d+/i.test(value);
  const hasException = /\b(?:TimeoutError|AttributeError|ValueError|TypeError|NameError|RuntimeError|ImportError|ModuleNotFoundError|IndexError|KeyError|ZeroDivisionError|AssertionError|MemoryError|NotImplementedError|FileNotFoundError|PermissionError|OSError|Exception)\s*:/i.test(value);
  return hasException && (hasTraceback || hasJupyterFrame);
}

function codeVariant(language: string | undefined, source: string): CodeVariant {
  const lang = (language ?? "").trim().toLowerCase();
  if (lang === "error") return "error";
  if (OUTPUT_LANGUAGES.has(lang)) return "result";
  if (isPythonError(source)) return "error";
  return "code";
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

function CodeBlock({ code, language, streaming = false, generating = false, variant: forced }: {
  code: string;
  language?: string;
  streaming?: boolean;
  generating?: boolean;
  variant?: CodeVariant;
}) {
  const variant = forced ?? codeVariant(language, code);
  const source = code.replace(/\n$/, "");
  const lineCount = source.trimEnd().split("\n").length;
  const collapseLines = variant === "error" ? COLLAPSED_ERROR_LINES : variant === "result" || variant === "text" ? COLLAPSED_RESULT_LINES : COLLAPSED_CODE_LINES;
  const canCollapse = lineCount > collapseLines;
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const visible = streaming && !expanded && canCollapse ? source.split("\n").slice(-collapseLines).join("\n") : source;
  async function copy() {
    try {
      await copyText(source);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1200);
    } catch { /* 复制失败不打断阅读 */ }
  }
  const label = variant === "result" ? "运行结果" : variant === "error" ? "错误" : variant === "text" ? "文本" : language ? language.toUpperCase() : "代码";
  return <div className="code-block" data-variant={variant} data-collapsible={canCollapse} data-expanded={expanded} data-streaming={generating || undefined}>
    <div className="code-block-head">
      <div className="code-block-label">
        <span className="code-block-lang">{label}</span>
        {variant === "code" && <span className="code-block-status">{generating ? "代码生成中" : "代码已完成"}</span>}
      </div>
      <div className="code-block-actions">
        <button type="button" className="code-block-action" aria-label={copied ? "已复制代码" : "复制代码"} data-copied={copied || undefined} onClick={() => void copy()}>
          {copied ? <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 4 4L19 6" /></svg> : <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5h10" /></svg>}
          <span className="code-block-copy-label">{copied ? "已复制" : "复制"}</span>
        </button>
        {canCollapse && <button type="button" className="code-block-action code-block-toggle" aria-expanded={expanded} aria-label={expanded ? "收起代码" : "展开代码"} onClick={() => setExpanded((value) => !value)}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg></button>}
      </div>
    </div>
    <pre className="code-block-pre"><code className={language ? `language-${language}` : undefined} data-language={language}>{visible}</code></pre>
  </div>;
}

const oneLineDisplayMath = /^\s*\$\$(.+)\$\$\s*$/;

function promoteSingleLineDisplayMath(content: string) {
  const lines = content.split("\n");
  let fence: string | null = null;
  const fenceLine = /^(\s*)(`{3,}|~{3,})/;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = fenceLine.exec(line);
    if (fence) {
      if (match && match[2][0] === fence) fence = null;
      continue;
    }
    if (match) { fence = match[2][0]; continue; }
    const math = oneLineDisplayMath.exec(line);
    if (!math) continue;
    const formula = math[1].trim();
    if (!formula) continue;
    lines.splice(index, 1, "$$", formula, "$$");
    index += 2;
  }
  return lines.join("\n");
}

function remarkCjkBoldFallback() {
  return (tree: MdNode, file: { value?: unknown }) => {
    const source = String(file.value ?? "");
    const visit = (parent: MdNode) => {
      if (["link", "linkReference", "strong", "emphasis"].includes(parent.type)) return;
      const children: MdNode[] = [];
      for (const node of parent.children ?? []) {
        if (node.children) visit(node);
        if (node.type !== "text" || typeof node.value !== "string") { children.push(node); continue; }
        const value = node.value;
        const start = node.position?.start?.offset;
        const end = node.position?.end?.offset;
        if (typeof start !== "number" || typeof end !== "number" || source.slice(start, end) !== value || value.includes("$")) { children.push(node); continue; }
        const matches = [...value.matchAll(/\*\*([^*\n]+?)\*\*/g)];
        let cursor = 0;
        for (const match of matches) {
          const inner = match[1];
          const label = inner.trim();
          if (!/[\u3400-\u9fff]/u.test(label)) continue;
          const index = match.index;
          const leading = inner.slice(0, inner.indexOf(label));
          const trailing = inner.slice(inner.indexOf(label) + label.length);
          const before = value.slice(cursor, index) + leading;
          if (before) children.push({ type: "text", value: before });
          children.push({ type: "strong", children: [{ type: "text", value: label }] });
          if (trailing) children.push({ type: "text", value: trailing });
          cursor = index + match[0].length;
        }
        if (cursor === 0) children.push(node);
        else if (cursor < value.length) children.push({ type: "text", value: value.slice(cursor) });
      }
      parent.children = children;
    };
    visit(tree);
  };
}

const sanitizeSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), "div", "figure", "figcaption", "img", "table", "thead", "tbody", "tr", "th", "td"],
  attributes: {
    ...defaultSchema.attributes,
    a: [...(defaultSchema.attributes?.a ?? []), "target", "rel"],
    code: [["className", /^language-./, "math-inline", "math-display"]],
    span: [...(defaultSchema.attributes?.span ?? []), ["className", "math-inline", "math-display"]],
    div: [...(defaultSchema.attributes?.div ?? []), "className"],
    figure: [...(defaultSchema.attributes?.figure ?? []), "className"],
    figcaption: [...(defaultSchema.attributes?.figcaption ?? []), "className"],
    img: [...(defaultSchema.attributes?.img ?? []), "src", "alt", "title", "width", "height", "loading"],
    table: [...(defaultSchema.attributes?.table ?? []), "className"],
    td: [...(defaultSchema.attributes?.td ?? []), "align"],
    th: [...(defaultSchema.attributes?.th ?? []), "align"],
  },
  protocols: { ...defaultSchema.protocols, href: ["http", "https"], src: ["http", "https", "data"] },
};

const REMARK_FULL = (breaks: boolean) => [remarkGfm, remarkMath, ...(breaks ? [remarkBreaks] : []), remarkCjkBoldFallback];
const REHYPE_FULL = [rehypeRaw, [rehypeSanitize, sanitizeSchema], [rehypeHighlight, { detect: false, ignoreMissing: true }], [rehypeKatex, { trust: false, strict: "ignore", throwOnError: false, errorColor: "inherit" }]] as NonNullable<React.ComponentProps<typeof Markdown>["rehypePlugins"]>;
const REHYPE_LIGHT = [rehypeRaw, [rehypeSanitize, sanitizeSchema]] as NonNullable<React.ComponentProps<typeof Markdown>["rehypePlugins"]>;

function transformUrl(url: string, key: string) {
  if (key === "src" && /^data:image\/(?:png|jpeg|gif|webp|avif);base64,/i.test(url)) return url;
  return defaultUrlTransform(url);
}

type Fence = { start: number; marker: string; length: number; language: string; body: string };

function findOpenFence(content: string): Fence | null {
  if (!content.includes("```") && !content.includes("~~~")) return null;
  const lines = content.split("\n");
  let offset = 0;
  let open: Omit<Fence, "body"> | null = null;
  for (const line of lines) {
    const match = /^[ \t]{0,3}(`{3,}|~{3,})([^\n]*)$/.exec(line);
    if (open) {
      if (match && match[1][0] === open.marker && match[1].length >= open.length) open = null;
    } else if (match) {
      open = { start: offset, marker: match[1][0], length: match[1].length, language: match[2].trim().split(/\s+/)[0] ?? "" };
    }
    offset += line.length + 1;
  }
  if (!open) return null;
  const firstLine = /^[^\n]*\n?/.exec(content.slice(open.start))?.[0] ?? "";
  return { ...open, body: content.slice(open.start + firstLine.length) };
}

const components: NonNullable<React.ComponentProps<typeof Markdown>["components"]> = {
  a: ({ children, ...props }) => <a {...props} target="_blank" rel="noreferrer noopener">{children}</a>,
  img: ({ src, alt, title, width, height }) => {
    if (typeof src !== "string" || !src) return null;
    if (!/^https?:\/\//i.test(src) && !/^data:image\/(?:png|jpeg|gif|webp|avif);base64,/i.test(src)) return null;
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt ?? ""} title={title} width={width} height={height} loading="lazy" />;
  },
  table: ({ children }) => <div className="run-table-wrap"><table>{children}</table></div>,
  code: ({ className, children }) => {
    const language = /language-([\w+.-]+)/.exec(className ?? "")?.[1];
    return <code className={className} data-language={language}>{children}</code>;
  },
  pre: ({ children }) => {
    const child = Array.isArray(children) ? children[0] : children;
    const props = isValidElement<CodeProps>(child) ? child.props : null;
    const source = textOf(props?.children).replace(/\n$/, "");
    const language = props?.["data-language"] ?? /language-([\w+.-]+)/.exec(props?.className ?? "")?.[1];
    return <CodeBlock code={source} language={language} />;
  },
};

export const AnswerMarkdown = memo(function AnswerMarkdown({ content, streaming = false, breaks = false, empty = "暂无回答。" }: { content: string; streaming?: boolean; breaks?: boolean; empty?: string }) {
  const display = useMemo(() => promoteSingleLineDisplayMath(normalizeAnswerMarkdown(content, { streaming })), [content, streaming]);
  const openFence = useMemo(() => streaming ? findOpenFence(display) : null, [display, streaming]);
  if (openFence) {
    const prefix = display.slice(0, openFence.start);
    return <>
      {prefix.trim() && <Markdown remarkPlugins={REMARK_FULL(breaks)} rehypePlugins={REHYPE_LIGHT} urlTransform={transformUrl} components={components}>{prefix}</Markdown>}
      <CodeBlock code={openFence.body} language={openFence.language} streaming generating variant={codeVariant(openFence.language, openFence.body)} />
    </>;
  }
  return <Markdown remarkPlugins={REMARK_FULL(breaks)} rehypePlugins={REHYPE_FULL} urlTransform={transformUrl} components={components}>{display.trim() ? display : empty}</Markdown>;
});
