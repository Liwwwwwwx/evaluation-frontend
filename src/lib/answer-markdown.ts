/**
 * 基础展示规则参考 XIMUALPHA-NEXT 的 message.markdown 与 MarkdownRenderer。
 * 只处理展示副本：不改原始回答，不猜测无定界符的普通文本是公式。
 */
function escaped(text: string, index: number) {
  let slashes = 0;
  while (index > 0 && text[--index] === "\\") slashes++;
  return slashes % 2 === 1;
}
function closing(text: string, token: string, from: number) {
  let index = text.indexOf(token, from);
  while (index >= 0 && escaped(text, index)) index = text.indexOf(token, index + token.length);
  return index;
}
const FLOW = /^\[(?:start|end|done|completed|content_start|content_end)\]/i;
const BLOCK = /^<<<(?:(?:CONTENT|PAPER)_(?:START|END)(?::[^>\n]+)?|(?:START|END)(?::[^>\n]+)?)>>>/i;
const VIEWER = /^<<<(?:STL_VIEWER|GENERATED_FILES_VIEWER|IMAGE_VIEWER):[^\n]*?>>>/;
const PLACEHOLDER = /^【XXX\s*(?:开始|结束|完成|已完成)\s*[:：][^】\n]*】/i;
const PARTIAL = ["[start]", "[end]", "[done]", "[completed]", "<<<CONTENT_START:", "<<<CONTENT_END:", "<<<PAPER_START:", "<<<PAPER_END:", "<<<STL_VIEWER:", "<<<GENERATED_FILES_VIEWER:", "<<<IMAGE_VIEWER:", "<think>"];
const MATH_ENV = /^\\begin\{(aligned|alignedat|gathered|matrix|pmatrix|bmatrix|cases|array)\}/;
const BAD_MATH_BOUNDARY = /(?:^|\n)[ \t]{0,3}(?:#{1,6}\s|`{3,}|~{3,})/;

export function normalizeAnswerMarkdown(source: string, { streaming = false }: { streaming?: boolean } = {}) {
  let result = ""; let index = 0;
  while (index < source.length) {
    const rest = source.slice(index);
    const lineStart = index === 0 || source[index - 1] === "\n";
    if (lineStart) {
      const fence = /^[ ]{0,3}(`{3,}|~{3,})[^\n]*(?:\n|$)/.exec(rest);
      if (fence) {
        const end = new RegExp(`(?:^|\\n) {0,3}${fence[1][0]}{${fence[1].length},}[ \\t]*(?=\\n|$)`).exec(rest.slice(fence[0].length));
        const length = end ? fence[0].length + end.index + end[0].length : rest.length;
        result += rest.slice(0, length); index += length; continue;
      }
      if (/^(?: {4}|\t)/.test(rest)) {
        const newline = rest.indexOf("\n"); const length = newline < 0 ? rest.length : newline + 1;
        result += rest.slice(0, length); index += length; continue;
      }
    }
    if (source[index] === "`" && !escaped(source, index)) {
      const ticks = /^`+/.exec(rest)![0];
      let end = source.indexOf(ticks, index + ticks.length);
      while (end >= 0 && (source[end - 1] === "`" || source[end + ticks.length] === "`")) end = source.indexOf(ticks, end + ticks.length);
      if (end >= 0) { result += source.slice(index, end + ticks.length); index = end + ticks.length; continue; }
    }
    // 闭合数学区间优先于协议过滤：公式里的 [start] 等不是流程标记。
    const bracket = !escaped(source, index) && (rest.startsWith("\\(") ? "\\)" : rest.startsWith("\\[") ? "\\]" : null);
    const dollar = source[index] === "$" && !escaped(source, index) ? (rest.startsWith("$$") ? "$$" : "$") : null;
    if (bracket || dollar) {
      const open = bracket ? rest.slice(0, 2) : dollar!; const close = bracket || dollar!;
      const end = closing(source, close, index + open.length);
      const body = end < 0 ? "" : source.slice(index + open.length, end);
      const display = open === "\\[" || open === "$$";
      // 文献服务常用转义方括号编号；行首“\[12\] 文献标题”不是块公式。
      const prefix = source.slice(source.lastIndexOf("\n", index - 1) + 1, index);
      const suffix = end < 0 ? "" : source.slice(end + close.length).split("\n", 1)[0];
      if (open === "\\[" && /^\s*\d{1,3}\s*$/.test(body) && (/^\s*$/.test(prefix) || /[;；]\s*$/.test(prefix)) && /^\s+\S/.test(suffix)) {
        result += `[${body.trim()}]`; index = end + close.length; continue;
      }
      const currency = open === "$" && /^\d/.test(body) && (!body.includes("\\") && /\p{Script=Han}/u.test(body) || /\d/.test(source[end + 1] || ""));
      const complete = end >= 0 && body.trim() && !BAD_MATH_BOUNDARY.test(body) && (display || !body.includes("\n"));
      if (complete && !currency) {
        result += display ? `\n\n$$\n${body.trim()}\n$$\n\n` : `$${body.trim()}$`;
        index = end + close.length; continue;
      }
      // 未闭合的 $$ 不交给 remark-math 吞掉后续段落；货币符号按文本显示。
      result += open.startsWith("$") ? open.replaceAll("$", "\\$") : `\\${open}`;
      index += open.length; continue;
    }
    if (rest.startsWith("\\begin{") && (lineStart || (index > 0 && /^\s*$/.test(source.slice(source.lastIndexOf("\n", index - 1) + 1, index))))) {
      const environment = MATH_ENV.exec(rest);
      if (environment) {
        const token = `\\end{${environment[1]}}`; const end = source.indexOf(token, index + environment[0].length);
        if (end >= 0 && !BAD_MATH_BOUNDARY.test(source.slice(index, end))) {
          result += `\n\n$$\n${source.slice(index, end + token.length)}\n$$\n\n`; index = end + token.length; continue;
        }
      }
    }
    if (!escaped(source, index)) {
      if (rest.startsWith("<think>")) {
        const end = source.indexOf("</think>", index + 7);
        index = end < 0 ? source.length : end + 8; continue;
      }
      const flow = FLOW.exec(rest);
      // 链接标签 [start](url) 和 [start][ref] 保持普通 Markdown。
      if (flow && !["(", "["].includes(source[index + flow[0].length])) { index += flow[0].length; continue; }
      const marker = BLOCK.exec(rest) || VIEWER.exec(rest) || PLACEHOLDER.exec(rest);
      if (marker) { result += "\n\n"; index += marker[0].length; continue; }
      const heartbeat = /^\{[^{}\n]*"type"\s*:\s*"(?:heartbeat\.ping|heart_beat)"[^{}\n]*\}/.exec(rest);
      if (heartbeat) {
        try {
          const value = JSON.parse(heartbeat[0]);
          const keys = value.type === "heartbeat.ping" ? ["type", "timestamp"] : ["type", "ignore", "task_id", "elapsed_seconds"];
          const valid = value.type === "heartbeat.ping" ? typeof value.timestamp === "number" : (value.ignore === undefined || value.ignore === true) && (typeof value.task_id === "string" || typeof value.elapsed_seconds === "number");
          if (valid && Object.keys(value).every(key => keys.includes(key))) { index += heartbeat[0].length; continue; }
        } catch { /* 普通 JSON 不清除。 */ }
      }
      if (rest.startsWith("%Line Break%")) { result += "\n\n"; index += 12; continue; }
      if (streaming && rest.length >= 3 && rest.length <= 32 && ["[", "<"].includes(source[index]) && PARTIAL.some(marker => marker.toLowerCase().startsWith(rest.toLowerCase()))) break;
    }
    result += source[index++];
  }
  return result;
}
