import { NextRequest } from "next/server";
import { proxyUnified } from "@/lib/unified-evaluation-proxy";

export async function POST(request: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  return proxyUnified(request, `/api/evaluation/unified/runs/${encodeURIComponent((await params).runId)}/rerun`);
}
