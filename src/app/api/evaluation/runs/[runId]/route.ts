import { NextRequest, NextResponse } from "next/server";
import { evaluationBase, proxyEvaluation } from "@/lib/evaluation-proxy";

export async function GET(request: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(runId)) {
    return NextResponse.json({ ok: false, error: "运行 ID 不正确" }, { status: 400 });
  }
  return proxyEvaluation(request, `${evaluationBase}/runs/${encodeURIComponent(runId)}`);
}
