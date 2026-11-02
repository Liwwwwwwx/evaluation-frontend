import { NextRequest, NextResponse } from "next/server";
import { proxyUnified } from "@/lib/unified-evaluation-proxy";

export async function GET(request: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  if (!/^[a-f0-9-]{36}$/i.test(runId)) return NextResponse.json({ ok: false, error: "运行 ID 不正确" }, { status: 400 });
  return proxyUnified(request, `/api/evaluation/unified/runs/${encodeURIComponent(runId)}`);
}
