import { NextRequest, NextResponse } from "next/server";
import { proxyUnified } from "@/lib/unified-evaluation-proxy";

export async function POST(request: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(runId)) return NextResponse.json({ error: "运行 ID 不正确" }, { status: 400 });
  return proxyUnified(request, `/api/evaluation/unified/history/${encodeURIComponent(runId)}`, { maxBodyBytes: 2048 });
}
