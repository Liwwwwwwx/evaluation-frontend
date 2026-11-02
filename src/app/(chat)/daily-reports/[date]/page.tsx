import { notFound } from "next/navigation";
import { DailyReportDetail } from "@/components/daily-reports";
export default async function DailyReportPage({ params, searchParams }: { params: Promise<{ date: string }>; searchParams: Promise<{ generating?: string }> }) {
  const { date } = await params;
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) notFound();
  return <DailyReportDetail key={date} date={date} pending={(await searchParams).generating === "1"} />;
}
