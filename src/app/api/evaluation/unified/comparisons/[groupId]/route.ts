import { NextRequest, NextResponse } from "next/server";
import { proxyUnified } from "@/lib/unified-evaluation-proxy";

export async function GET(request: NextRequest, { params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  if (!/^[a-f0-9]{16,64}$/i.test(groupId)) return NextResponse.json({ error: "对比组 ID 不正确" }, { status: 400 });
  return proxyUnified(request, `/api/evaluation/unified/comparisons/${encodeURIComponent(groupId)}`);
}
