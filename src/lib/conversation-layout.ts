type Event = Record<string, unknown>;
export type ConversationSegment = { kind: "text"; key: string; content: string } | { kind: "event"; key: string; event: Event };

// 只在段落边界插入团队块；代码和公式保持完整，不在增量到达位置截断 Markdown。
export function conversationSegments(content: string, events: Event[]): ConversationSegment[] {
  const protectedRanges: [number, number][] = [];
  const tokens = /(^|\n)[ \t]{0,3}(`{3,}|~{3,})[^\n]*\n|\$\$|\\\[|\\\(/g;
  let match: RegExpExecArray | null;
  while ((match = tokens.exec(content))) {
    const start = match.index;
    let end: number;
    if (match[2]) {
      const close = new RegExp(`(?:^|\\n)[ \t]{0,3}${match[2][0]}{${match[2].length},}[ \t]*(?=\\n|$)`).exec(content.slice(tokens.lastIndex));
      end = close ? tokens.lastIndex + close.index + close[0].length : content.length;
    } else {
      const closer = match[0] === "$$" ? "$$" : match[0] === "\\[" ? "\\]" : "\\)";
      const close = content.indexOf(closer, tokens.lastIndex);
      end = close < 0 ? content.length : close + closer.length;
    }
    protectedRanges.push([start, end]); tokens.lastIndex = end;
  }
  const boundaries = [0];
  for (const gap of content.matchAll(/\n[ \t]*\n/g)) {
    const offset = gap.index + gap[0].length;
    if (!protectedRanges.some(([start, end]) => offset > start && offset < end)) boundaries.push(offset);
  }
  boundaries.push(content.length);
  const positioned = events.map((event, index) => {
    const raw = typeof event.text_offset === "number" && Number.isFinite(event.text_offset) ? Math.max(0, Math.min(content.length, event.text_offset)) : content.length;
    return { event, index, offset: boundaries.find(boundary => boundary >= raw) ?? content.length };
  }).sort((a, b) => a.offset - b.offset || a.index - b.index);
  const segments: ConversationSegment[] = []; let cursor = 0;
  for (const item of positioned) {
    if (item.offset > cursor) segments.push({ kind: "text", key: `text:${cursor}`, content: content.slice(cursor, item.offset) });
    segments.push({ kind: "event", key: `${String(item.event.type)}:${String(item.event.event_id || item.index)}`, event: item.event }); cursor = item.offset;
  }
  if (cursor < content.length) segments.push({ kind: "text", key: `text:${cursor}`, content: content.slice(cursor) });
  return segments;
}
