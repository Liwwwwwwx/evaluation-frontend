import { NextRequest, NextResponse } from "next/server";
import { proxyUnified } from "@/lib/unified-evaluation-proxy";

export async function GET(request: NextRequest, { params }: { params: Promise<{ batchId: string }> }) {
  const { batchId } = await params;
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(batchId)) return NextResponse.json({ error: "批次 ID 无效" }, { status: 400 });
  return proxyUnified(request, `/api/evaluation/unified/batches/${encodeURIComponent(batchId)}`);
}
