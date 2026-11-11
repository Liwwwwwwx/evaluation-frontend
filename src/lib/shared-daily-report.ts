export type SharedDailyReportResult =
  | { status: "ready"; report: { date: string; markdown: string; updatedAt: string; expiresAt: string } }
  | { status: "invalid" | "updating" | "unavailable" };

export async function readSharedDailyReport(date: string, query: Record<string, string | string[] | undefined>, backend: string, fetchImpl = fetch): Promise<SharedDailyReportResult> {
  const { expires, signature } = query;
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date
    || typeof expires !== "string" || !/^\d{10,11}$/.test(expires) || typeof signature !== "string" || !/^[a-f0-9]{64}$/.test(signature)) return { status: "invalid" };
  const url = new URL(`/api/public/daily-reports/${date}`, backend);
  url.searchParams.set("expires", expires);
  url.searchParams.set("signature", signature);
  try {
    const response = await fetchImpl(url, { headers: { Accept: "application/json" }, credentials: "omit", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000) });
    if (response.status === 404) return { status: "invalid" };
    if (response.status === 409) return { status: "updating" };
    if (!response.ok) return { status: "unavailable" };
    const value = await response.json();
    if (value?.date !== date || typeof value.markdown !== "string" || !value.markdown.trim() || value.markdown.length > 1000000
      || typeof value.updatedAt !== "string" || !Number.isFinite(Date.parse(value.updatedAt))
      || value.expiresAt !== new Date(Number(expires) * 1000).toISOString()) return { status: "unavailable" };
    return { status: "ready", report: { date, markdown: value.markdown, updatedAt: value.updatedAt, expiresAt: value.expiresAt } };
  } catch { return { status: "unavailable" }; }
}
