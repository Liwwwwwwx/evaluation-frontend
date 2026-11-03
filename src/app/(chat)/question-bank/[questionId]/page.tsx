import { notFound } from "next/navigation";
import { QuestionDetailPage } from "@/components/question-detail-page";

function decode(value: string | undefined) {
  if (!value) return "";
  try { return decodeURIComponent(value); } catch { return value; }
}

export default async function QuestionDetailRoute({ params, searchParams }: { params: Promise<{ questionId: string }>; searchParams: Promise<{ datasetVersion?: string; tab?: string }> }) {
  const questionId = decode((await params).questionId);
  const query = await searchParams;
  const datasetVersion = decode(query.datasetVersion);
  if (!questionId || !datasetVersion) notFound();
  return <QuestionDetailPage key={JSON.stringify([questionId, datasetVersion])} questionId={questionId} datasetVersion={datasetVersion} initialTab={query.tab === "standards" ? "standards" : "question"} />;
}
