import { NextRequest } from "next/server";
import { proxyUnified } from "@/lib/unified-evaluation-proxy";

async function share(request: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  return proxyUnified(request, `/api/evaluation/unified/runs/${encodeURIComponent(runId)}/share`, { maxBodyBytes: 1024 });
}

export const GET = share;
export const POST = share;
