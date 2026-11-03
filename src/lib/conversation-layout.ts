type Event = Record<string, unknown>;
export type ConversationSegment = { kind: "text"; key: string; content: string } | { kind: "event"; key: string; event: Event };
export type TimelineSegment =
  | { kind: "text"; key: string; content: string }
  | { kind: "steps"; key: string; offset: number; steps: Event[] }
  | { kind: "team"; key: string; offset: number; event: Event }
  | { kind: "followup"; key: string; offset: number; event: Event };

type Range = { start: number; end: number };

function blockRanges(content: string): Range[] {
  const ranges: Range[] = [];
  const lines = content.split("\n");
  const starts: number[] = [0];
  for (let index = 0; index < content.length; index += 1) if (content[index] === "\n") starts.push(index + 1);
  const lineStart = (index: number) => starts[index] ?? content.length;
  const lineEnd = (index: number) => index + 1 < starts.length ? starts[index + 1] - 1 : content.length;
  let index = 0;
  while (index < lines.length) {
    const fence = /^\s*(?:>\s*)*(`{3,}|~{3,}|\$\$(?=\s*$))/.exec(lines[index]);
    if (!fence) { index += 1; continue; }
    const marker = fence[1][0];
    const length = fence[1].length;
    let end = content.length;
    let next = lines.length;
    const close = new RegExp(`^\\s*(?:>\\s*)*${marker === "$" ? "\\$" : marker}{${length},}\\s*$`);
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      if (close.test(lines[cursor])) { end = lineEnd(cursor); next = cursor + 1; break; }
    }
    ranges.push({ start: lineStart(index), end });
    index = next;
  }
  const fences = [...ranges];
  let fenceIndex = 0;
  let blockStart: number | null = null;
  let blockKind: "list" | "quote" | "table" | "code" | null = null;
  const nextNonBlank: number[] = new Array(lines.length + 1).fill(lines.length);
  for (let cursor = lines.length - 1; cursor >= 0; cursor -= 1) nextNonBlank[cursor] = lines[cursor].trim() ? cursor : nextNonBlank[cursor + 1];
  for (let cursor = 0; cursor <= lines.length; cursor += 1) {
    const line = lines[cursor];
    const start = lineStart(cursor);
    while (fenceIndex < fences.length && start > fences[fenceIndex].end) fenceIndex += 1;
    const inside = fenceIndex < fences.length && start >= fences[fenceIndex].start;
    if (line === undefined || line.trim().length === 0) {
      const after = lines[nextNonBlank[cursor]] ?? "";
      if (line !== undefined && blockStart !== null && ((blockKind === "list" && /^(?:\s*(?:[-+*]\s+|\d+[.)]\s+)| {2,}\S|\t\S)/.test(after)) || (blockKind === "code" && /^(?: {4}|\t)/.test(after)))) continue;
      if (blockStart !== null) ranges.push({ start: lineStart(blockStart), end: lineEnd(cursor - 1) });
      blockStart = null; blockKind = null;
    } else if (!inside && blockStart === null) {
      if (/^ {0,3}#{1,6}(?:\s|$)/.test(line)) ranges.push({ start, end: lineEnd(cursor) });
      else if (/^(?: {4}|\t)/.test(line) && (cursor === 0 || !lines[cursor - 1].trim())) { blockStart = cursor; blockKind = "code"; }
      else if (/^\s*(?:[-+*]\s+|\d+[.)]\s+|>\s?)/.test(line)) { blockStart = cursor; blockKind = /^\s*>/.test(line) ? "quote" : "list"; }
      else if (cursor > 0 && lines[cursor - 1].includes("|") && /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/.test(line)) { blockStart = cursor - 1; blockKind = "table"; }
    }
  }
  const think = /<think>([\s\S]*?)<\/think>/gi;
  let match: RegExpExecArray | null;
  while ((match = think.exec(content))) ranges.push({ start: match.index, end: match.index + match[0].length });
  const openThink = content.lastIndexOf("<think>");
  const closeThink = content.lastIndexOf("</think>");
  if (openThink > closeThink) ranges.push({ start: openThink, end: content.length });
  return ranges.sort((left, right) => left.start - right.start).reduce<Range[]>((merged, range) => {
    const last = merged.at(-1);
    if (last && range.start < last.end) last.end = Math.max(last.end, range.end);
    else merged.push({ ...range });
    return merged;
  }, []);
}

function moveOutside(offset: number, ranges: Range[]) {
  let left = 0;
  let right = ranges.length;
  while (left < right) {
    const middle = (left + right) >>> 1;
    const range = ranges[middle];
    if (offset <= range.start) right = middle;
    else if (offset >= range.end) left = middle + 1;
    else return range.start;
  }
  return offset;
}

function position(value: unknown, contentLength: number, ranges: Range[]) {
  const raw = typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(contentLength, value)) : contentLength;
  return moveOutside(raw, ranges);
}

export function conversationTimeline(content: string, steps: Event[], teamOutputs: Event[], followupAnswers: Event[]): TimelineSegment[] {
  const ranges = blockRanges(content);
  const positioned: Event[] = [];
  const unpositioned: Event[] = [];
  for (const step of steps) {
    if (typeof step.text_offset === "number" && Number.isFinite(step.text_offset)) positioned.push(step);
    else unpositioned.push(step);
  }
  positioned.sort((left, right) => Number(left.text_offset) - Number(right.text_offset) || Number(left.received_order ?? 0) - Number(right.received_order ?? 0));
  const groups: { offset: number; steps: Event[] }[] = [];
  let previous = 0;
  for (const step of positioned) {
    const offset = position(step.text_offset, content.length, ranges);
    const gap = content.slice(previous, offset);
    previous = offset;
    const current = groups.at(-1);
    if (current && gap.trim().length === 0) current.steps.push(step);
    else groups.push({ offset, steps: [step] });
  }
  if (unpositioned.length > 0) {
    const last = groups.at(-1);
    if (last && last.offset >= content.length) last.steps.push(...unpositioned);
    else groups.push({ offset: content.length, steps: unpositioned });
  }
  type Anchor = { kind: "steps" | "team" | "followup"; offset: number; rank: number; order: number; segment: TimelineSegment };
  const anchors: Anchor[] = groups.map((group) => ({
    kind: "steps", offset: group.offset, rank: 0, order: Number(group.steps[0]?.received_order ?? 0),
    segment: { kind: "steps", key: `steps:${group.offset}:${String(group.steps[0]?.step_id ?? "")}`, offset: group.offset, steps: group.steps },
  }));
  for (const event of teamOutputs) {
    const offset = position(event.text_offset, content.length, ranges);
    anchors.push({
      kind: "team", offset, rank: 1, order: Number(event.received_order ?? event.seq ?? 0),
      segment: { kind: "team", key: `team:${String(event.event_id ?? "")}`, offset, event },
    });
  }
  for (const event of followupAnswers) {
    const offset = position(event.text_offset, content.length, ranges);
    anchors.push({
      kind: "followup", offset, rank: 2, order: Number(event.received_order ?? event.seq ?? 0),
      segment: { kind: "followup", key: `followup:${String(event.event_id ?? "")}`, offset, event },
    });
  }
  anchors.sort((left, right) => left.offset - right.offset || left.rank - right.rank || left.order - right.order);
  const segments: TimelineSegment[] = [];
  let cursor = 0;
  for (const anchor of anchors) {
    const offset = Math.max(cursor, anchor.offset);
    if (offset > cursor) segments.push({ kind: "text", key: `text:${cursor}`, content: content.slice(cursor, offset) });
    segments.push({ ...anchor.segment, offset } as TimelineSegment);
    cursor = offset;
  }
  if (cursor < content.length) segments.push({ kind: "text", key: `text:${cursor}`, content: content.slice(cursor) });
  return segments;
}

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
