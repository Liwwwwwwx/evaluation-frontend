export type QueryValue = string | string[] | undefined;

export function readQuery(value: QueryValue): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function safeInternalPath(value: string | null | undefined, fallback = "/"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return fallback;
  try {
    const url = new URL(value, "https://local.invalid");
    if (url.origin !== "https://local.invalid" || url.pathname === "/login") return fallback;
    return `${url.pathname}${url.search}`;
  } catch {
    return fallback;
  }
}

export function appendFrom(href: string, from: string | null | undefined): string {
  if (!from) return href;
  return `${href}${href.includes("?") ? "&" : "?"}from=${encodeURIComponent(from)}`;
}

export function pageNumber(value: string | undefined, fallback = 1): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function listQuery(params: Record<string, string | number | null | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === "") continue;
    search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

export function backLabel(href: string, fallback = "返回"): string {
  if (href.startsWith("/question-bank/")) return "返回题目详情";
  if (href.startsWith("/question-bank")) return "返回题库";
  if (href.startsWith("/batches/") && href.includes("/comparison")) return "返回环比";
  if (href.startsWith("/batches/")) return "返回批次";
  if (href === "/runs" || href.startsWith("/runs?")) return "返回运行记录";
  if (href.startsWith("/runs/")) return "返回运行详情";
  if (href.startsWith("/daily-reports")) return "返回测评日报";
  if (href === "/compare" || href.startsWith("/compare?")) return "返回对比创建";
  if (href.startsWith("/compare/")) return "返回对比测评";
  if (href.startsWith("/evaluate")) return "返回新建测评";
  return fallback;
}
