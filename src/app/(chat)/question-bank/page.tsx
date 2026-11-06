import { QuestionBank } from "@/components/question-bank";
import { pageNumber, readQuery } from "@/lib/navigation";

type QueryValue = string | string[] | undefined;

export default async function QuestionBankPage({ searchParams }: { searchParams: Promise<Record<string, QueryValue>> }) {
  const query = await searchParams;
  const source = readQuery(query.source) === "random" ? "random" : "fixed";
  const search = readQuery(query.q) || "";
  const domain = readQuery(query.domain) || "";
  const page = pageNumber(readQuery(query.page));
  return <QuestionBank key={JSON.stringify([source, search, domain, page])} initialSource={source} initialSearch={search} initialDomain={domain} initialPage={page} />;
}

