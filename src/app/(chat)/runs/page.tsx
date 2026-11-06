import { UnifiedRunList } from "@/components/unified-run-list";
import { pageNumber, readQuery } from "@/lib/navigation";

type QueryValue = string | string[] | undefined;

export default async function RunsPage({ searchParams }: { searchParams: Promise<Record<string, QueryValue>> }) {
  const query = await searchParams;
  return <UnifiedRunList
    key={JSON.stringify([readQuery(query.q) || "", readQuery(query.domain) || "", readQuery(query.from) || "", readQuery(query.to) || "", pageNumber(readQuery(query.page))])}
    initialQuery={readQuery(query.q) || ""}
    initialDomain={readQuery(query.domain) || ""}
    initialFrom={readQuery(query.from) || ""}
    initialTo={readQuery(query.to) || ""}
    initialPage={pageNumber(readQuery(query.page))}
  />;
}
