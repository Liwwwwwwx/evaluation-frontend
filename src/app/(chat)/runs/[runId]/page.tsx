import { UnifiedRunDetail } from "@/components/unified-run-detail";
import { backLabel, readQuery, safeInternalPath } from "@/lib/navigation";

type QueryValue = string | string[] | undefined;

export default async function RunDetailPage({ params, searchParams }: { params: Promise<{ runId: string }>; searchParams: Promise<Record<string, QueryValue>> }) {
  const [{ runId }, query] = await Promise.all([params, searchParams]);
  const raw = readQuery(query.from);
  const backHref = safeInternalPath(raw, "/runs");
  const selfHref = `/runs/${encodeURIComponent(runId)}${raw ? `?from=${encodeURIComponent(backHref)}` : ""}`;
  return <UnifiedRunDetail key={runId} runId={runId} backHref={backHref} backLabel={backLabel(backHref, "返回运行记录")} selfHref={selfHref} />;
}
