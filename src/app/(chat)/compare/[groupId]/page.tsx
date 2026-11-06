import { notFound } from "next/navigation";
import { ComparisonWorkspace } from "@/components/comparison-workspace";
import { backLabel, readQuery, safeInternalPath } from "@/lib/navigation";

type QueryValue = string | string[] | undefined;

export default async function CompareDetailPage({ params, searchParams }: { params: Promise<{ groupId: string }>; searchParams: Promise<Record<string, QueryValue>> }) {
  const [{ groupId }, query] = await Promise.all([params, searchParams]);
  if (!/^[a-f0-9]{16,64}$/i.test(groupId)) notFound();
  const backHref = safeInternalPath(readQuery(query.from), "/runs");
  return <ComparisonWorkspace key={groupId} groupId={groupId} backHref={backHref} backLabel={backLabel(backHref, "返回运行记录")} />;
}
