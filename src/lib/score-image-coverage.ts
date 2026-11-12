export function imageCoverageLabel(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const coverage = value as Record<string, unknown>;
  const found = coverage.found; const sent = coverage.sent;
  if (typeof found !== "number" || typeof sent !== "number" || !Number.isSafeInteger(found) || !Number.isSafeInteger(sent) || found < 0 || sent < 0 || sent > found) return "";
  const external = typeof coverage.external === "number" && Number.isSafeInteger(coverage.external) && coverage.external > 0 ? coverage.external : 0;
  const suffix = external ? `；另有 ${external} 张正文引用的外部图片未纳入评分` : "";
  if (found === 0 && coverage.overflow !== true) return external ? `未发现运行图片${suffix}` : "未发现图片";
  const total = `${found}${coverage.overflow === true ? "+" : ""}`;
  return (sent === 0 ? `发现 ${total} 张图片，未发送给模型` : `已发送 ${sent} / ${total} 张图片给模型`) + suffix;
}
