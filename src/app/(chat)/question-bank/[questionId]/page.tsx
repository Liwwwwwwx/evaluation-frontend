import { notFound } from "next/navigation";
import { QuestionDetailPage } from "@/components/question-detail-page";

function decode(value: string | undefined) {
  if (!value) return "";
  try { return decodeURIComponent(value); } catch { return value; }
}

export default async function QuestionDetailRoute({ params, searchParams }: { params: Promise<{ questionId: string }>; searchParams: Promise<{ datasetVersion?: string }> }) {
  const questionId = decode((await params).questionId);
  const datasetVersion = decode((await searchParams).datasetVersion);
  if (!questionId || !datasetVersion) notFound();
  return <QuestionDetailPage questionId={questionId} datasetVersion={datasetVersion} />;
}
