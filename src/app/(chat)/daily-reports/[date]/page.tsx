import { notFound } from "next/navigation";
import { DailyReportDetail } from "@/components/daily-reports";
import { backLabel, readQuery, safeInternalPath } from "@/lib/navigation";
export default async function DailyReportPage({ params, searchParams }: { params: Promise<{ date: string }>; searchParams: Promise<{ generating?: string; from?: string | string[] }> }) {
  const { date } = await params;
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) notFound();
  const query = await searchParams;
  const backHref = safeInternalPath(readQuery(query.from), "/daily-reports");
  return <DailyReportDetail key={date} date={date} pending={query.generating === "1"} backHref={backHref} backLabel={backLabel(backHref, "返回测评日报")} />;
}
