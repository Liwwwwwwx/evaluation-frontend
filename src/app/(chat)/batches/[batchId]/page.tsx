import { notFound } from "next/navigation";
import { BatchDetailPage } from "@/components/batch-detail";
import { backLabel, readQuery, safeInternalPath } from "@/lib/navigation";

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const EXECUTIONS = ["completed", "failed", "timeout", "unfinished"] as const;
const SORTS = ["scoreAsc", "scoreDesc", "startedAtDesc", "startedAtAsc"] as const;

type QueryValue = string | string[] | undefined;

export default async function BatchDetailRoute({ params, searchParams }: { params: Promise<{ batchId: string }>; searchParams: Promise<Record<string, QueryValue>> }) {
  const [{ batchId }, query] = await Promise.all([params, searchParams]);
  if (!UUID.test(batchId)) notFound();
  const read = (key: string) => Array.isArray(query[key]) ? query[key][0] : query[key];
  const tab = read("tab") === "problems" ? "problems" : "services";
  const execution = EXECUTIONS.find(item => item === read("execution")) || "";
  const sort = SORTS.find(item => item === read("sort")) || "scoreAsc";
  const page = Math.max(1, Number(read("page")) || 1);
  const backHref = safeInternalPath(readQuery(query.from), "/batches");
  return <BatchDetailPage
    batchId={batchId}
    basePath="/batches"
    backHref={backHref}
    backLabel={backLabel(backHref, "返回批次列表")}
    initialTab={tab}
    initialService={read("service") || ""}
    initialExecution={execution}
    initialSort={sort}
    initialPage={page}
  />;
}
