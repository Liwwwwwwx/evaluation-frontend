import { notFound } from "next/navigation";
import { BatchDetailPage } from "@/components/batch-detail";

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export default async function BatchDetailRoute({ params }: { params: Promise<{ batchId: string }> }) {
  const { batchId } = await params;
  if (!UUID.test(batchId)) notFound();
  return <BatchDetailPage batchId={batchId} basePath="/batches" />;
}
