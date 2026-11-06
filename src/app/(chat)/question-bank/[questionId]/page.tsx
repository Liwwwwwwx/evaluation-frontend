import { notFound } from "next/navigation";
import { QuestionDetailPage } from "@/components/question-detail-page";
import { readQuery, safeInternalPath } from "@/lib/navigation";

function decode(value: string | undefined) {
  if (!value) return "";
  try { return decodeURIComponent(value); } catch { return value; }
}

export default async function QuestionDetailRoute({ params, searchParams }: { params: Promise<{ questionId: string }>; searchParams: Promise<{ datasetVersion?: string; tab?: string; from?: string | string[] }> }) {
  const questionId = decode((await params).questionId);
  const query = await searchParams;
  const datasetVersion = decode(query.datasetVersion);
  if (!questionId || !datasetVersion) notFound();
  const backHref = safeInternalPath(readQuery(query.from), "/question-bank");
  const initialTab = query.tab === "standards" ? "standards" : query.tab === "records" ? "records" : "question";
  return <QuestionDetailPage key={JSON.stringify([questionId, datasetVersion])} questionId={questionId} datasetVersion={datasetVersion} initialTab={initialTab} backHref={backHref} />;
}
