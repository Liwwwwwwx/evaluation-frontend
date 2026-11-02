import { NextRequest, NextResponse } from "next/server";
import { proxyUnified } from "@/lib/unified-evaluation-proxy";
export async function GET(request: NextRequest, { params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "日期无效" }, { status: 400 });
  return proxyUnified(request, `/api/evaluation/unified/daily-reports/${date}`);
}
