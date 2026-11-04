import { notFound } from "next/navigation";
import { ComparisonWorkspace } from "@/components/comparison-workspace";

export default async function CompareDetailPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  if (!/^[a-f0-9]{16,64}$/i.test(groupId)) notFound();
  return <ComparisonWorkspace key={groupId} groupId={groupId} />;
}
