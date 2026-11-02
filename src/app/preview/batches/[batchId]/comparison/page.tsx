import { notFound } from "next/navigation";
import { BatchComparisonPage } from "@/components/batch-comparison";
import { previewBatchDetails } from "@/lib/batch-preview";

export default async function PreviewBatchComparisonPage({ params }: { params: Promise<{ batchId: string }> }) {
  const { batchId } = await params;
  if (!previewBatchDetails[batchId]) notFound();
  return <BatchComparisonPage batchId={batchId} basePath="/preview/batches" />;
}
