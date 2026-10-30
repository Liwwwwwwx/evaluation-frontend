export type UnifiedEvent = { event: string; data: Record<string, unknown> };

export async function readUnifiedStream(response: Response, onEvent: (event: UnifiedEvent) => void) {
  if (!response.body || !response.headers.get("content-type")?.includes("text/event-stream")) throw new Error("评测服务未返回流式数据。");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let event = "message";
  let data: string[] = [];
  const line = (value: string) => {
    if (!value) {
      if (data.length) {
        const parsed: unknown = JSON.parse(data.join("\n"));
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("流式事件格式异常。");
        onEvent({ event, data: parsed as Record<string, unknown> });
      }
      event = "message"; data = []; return;
    }
    if (value.startsWith(":")) return;
    const colon = value.indexOf(":");
    const field = colon < 0 ? value : value.slice(0, colon);
    const content = colon < 0 ? "" : value.slice(colon + 1).replace(/^ /, "");
    if (field === "event") event = content;
    if (field === "data") data.push(content);
  };
  try {
    while (true) {
      const chunk = await reader.read();
      buffer += decoder.decode(chunk.value, { stream: !chunk.done });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const item of lines) line(item.replace(/\r$/, ""));
      if (chunk.done) { if (buffer) line(buffer); if (data.length) line(""); break; }
    }
  } finally { reader.releaseLock(); }
}
