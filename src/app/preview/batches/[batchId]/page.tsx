import { notFound } from "next/navigation";
import { BatchDetailPage } from "@/components/batch-detail";
import { previewBatchDetails } from "@/lib/batch-preview";

export default async function PreviewBatchDetailPage({ params }: { params: Promise<{ batchId: string }> }) {
  const { batchId } = await params;
  if (!previewBatchDetails[batchId]) notFound();
  return <BatchDetailPage batchId={batchId} basePath="/preview/batches" preview />;
}
