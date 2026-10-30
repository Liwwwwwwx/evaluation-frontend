"use client";

import { memo, useMemo } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { normalizeAnswerMarkdown } from "@/lib/answer-markdown";

const remarkPlugins = [remarkGfm, remarkMath];
const rehypePlugins: NonNullable<React.ComponentProps<typeof Markdown>["rehypePlugins"]> = [[rehypeKatex, { trust: false, strict: "ignore", throwOnError: false, errorColor: "inherit" }]];
const components: NonNullable<React.ComponentProps<typeof Markdown>["components"]> = {
  table: ({ children }) => <div className="run-table-wrap"><table>{children}</table></div>,
};

export const AnswerMarkdown = memo(function AnswerMarkdown({ content, streaming = false, empty = "暂无回答。" }: { content: string; streaming?: boolean; empty?: string }) {
  const display = useMemo(() => normalizeAnswerMarkdown(content, { streaming }), [content, streaming]);
  return <Markdown skipHtml remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} components={components}>{display.trim() ? display : empty}</Markdown>;
});
