import { NextRequest, NextResponse } from "next/server";
import { proxyUnified } from "@/lib/unified-evaluation-proxy";
async function proxy(request: NextRequest, params: Promise<{ date: string; action: string }>) {
  const { date, action } = await params;
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(date) || !(request.method === "GET" && action === "markdown" || request.method === "POST" && action === "generate")) return NextResponse.json({ error: "请求无效" }, { status: 400 });
  return proxyUnified(request, `/api/evaluation/unified/daily-reports/${date}/${action}`);
}
export async function GET(request: NextRequest, { params }: { params: Promise<{ date: string; action: string }> }) { return proxy(request, params); }
export async function POST(request: NextRequest, { params }: { params: Promise<{ date: string; action: string }> }) { return proxy(request, params); }
