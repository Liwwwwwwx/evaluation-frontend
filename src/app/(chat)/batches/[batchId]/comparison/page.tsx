import { notFound } from "next/navigation";
import { BatchComparisonPage } from "@/components/batch-comparison";
import { backLabel, readQuery, safeInternalPath } from "@/lib/navigation";

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export default async function BatchComparisonRoute({ params, searchParams }: { params: Promise<{ batchId: string }>; searchParams: Promise<{ from?: string | string[] }> }) {
  const { batchId } = await params;
  if (!UUID.test(batchId)) notFound();
  const backHref = safeInternalPath(readQuery((await searchParams).from), `/batches/${batchId}`);
  const selfHref = `/batches/${batchId}/comparison${backHref !== `/batches/${batchId}` ? `?from=${encodeURIComponent(backHref)}` : ""}`;
  return <BatchComparisonPage batchId={batchId} basePath="/batches" backHref={backHref} backLabel={backLabel(backHref, "返回批次详情")} selfHref={selfHref} />;
}
