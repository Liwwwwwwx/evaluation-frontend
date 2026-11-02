import { notFound } from "next/navigation";
import { BatchComparisonPage } from "@/components/batch-comparison";

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export default async function BatchComparisonRoute({ params }: { params: Promise<{ batchId: string }> }) {
  const { batchId } = await params;
  if (!UUID.test(batchId)) notFound();
  return <BatchComparisonPage batchId={batchId} basePath="/batches" />;
}
