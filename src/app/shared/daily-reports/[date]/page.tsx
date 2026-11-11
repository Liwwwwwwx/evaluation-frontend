import type { Metadata } from "next";
import { SharedDailyReport } from "@/components/shared-daily-report";
import { backendOrigin } from "@/lib/evaluation-auth-proxy";
import { readSharedDailyReport, type SharedDailyReportResult } from "@/lib/shared-daily-report";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "测评日报 · 只读分享", robots: { index: false, follow: false, nocache: true }, referrer: "no-referrer" };

export default async function SharedDailyReportPage({ params, searchParams }: {
  params: Promise<{ date: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { date } = await params;
  const query = await searchParams;
  let result: SharedDailyReportResult;
  try { result = await readSharedDailyReport(date, query, backendOrigin()); }
  catch { result = { status: "unavailable" }; }
  return <SharedDailyReport result={result} />;
}
