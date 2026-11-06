import { BatchListPage } from "@/components/batch-list";
import type { BatchSource, BatchState } from "@/lib/batch-types";
import { pageNumber, readQuery } from "@/lib/navigation";

const SOURCES: ("all" | "nightly" | BatchSource)[] = ["all", "nightly", "trial", "mission", "manual"];
const STATES: ("all" | BatchState)[] = ["all", "done", "partial", "running", "failed"];
const TABS = ["configs", "batches", "reports"] as const;

type QueryValue = string | string[] | undefined;

export default async function BatchesPage({ searchParams }: { searchParams: Promise<Record<string, QueryValue>> }) {
  const query = await searchParams;
  const source = SOURCES.find(value => value === readQuery(query.source)) || "all";
  const state = STATES.find(value => value === readQuery(query.state)) || "all";
  const tab = TABS.find(value => value === readQuery(query.tab)) || "configs";
  const from = readQuery(query.from) || "";
  const to = readQuery(query.to) || "";
  const page = pageNumber(readQuery(query.page));
  const schemeId = readQuery(query.schemeId) || "";
  const schemeName = readQuery(query.schemeName) || "";
  return <BatchListPage
    key={JSON.stringify([tab, source, state, from, to, page, schemeId, schemeName])}
    basePath="/batches"
    initialTab={tab}
    initialSource={source}
    initialState={state}
    initialFrom={from}
    initialTo={to}
    initialPage={page}
    initialSchemeId={schemeId}
    initialSchemeName={schemeName}
  />;
}
