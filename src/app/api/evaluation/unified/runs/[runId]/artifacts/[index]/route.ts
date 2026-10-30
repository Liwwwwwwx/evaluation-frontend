import { NextRequest, NextResponse } from "next/server";
import { proxyUnified } from "@/lib/unified-evaluation-proxy";

export async function GET(request: NextRequest, { params }: { params: Promise<{ runId: string; index: string }> }) {
  const { runId, index } = await params;
  if (!/^[a-f0-9-]{36}$/i.test(runId) || !/^\d{1,3}$/.test(index)) return NextResponse.json({ error: "产物标识无效" }, { status: 400 });
  return proxyUnified(request, `/api/evaluation/unified/runs/${encodeURIComponent(runId)}/artifacts/${index}`);
}
