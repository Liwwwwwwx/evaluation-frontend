import { NextRequest } from "next/server";
import { proxyUnified } from "@/lib/unified-evaluation-proxy";

export async function GET(request: NextRequest, { params }: { params: Promise<{ shareId: string }> }) {
  const { shareId } = await params;
  return proxyUnified(request, `/api/evaluation/unified/shared-runs/${encodeURIComponent(shareId)}`);
}
