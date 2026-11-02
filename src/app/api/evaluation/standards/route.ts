import { NextRequest } from "next/server";
import { proxyUnified } from "@/lib/unified-evaluation-proxy";

export async function POST(request: NextRequest) {
  return proxyUnified(request, "/api/evaluation/standards", { maxBodyBytes: 32 * 1024 });
}
