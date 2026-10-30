import { UnifiedRunDetail } from "@/components/unified-run-detail";

export default async function RunDetailPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  return <UnifiedRunDetail key={runId} runId={runId} />;
}
