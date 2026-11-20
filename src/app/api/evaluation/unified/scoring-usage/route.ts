import { NextRequest } from "next/server";
import { proxyUnified } from "@/lib/unified-evaluation-proxy";

export function GET(request: NextRequest) {
  return proxyUnified(request, "/api/evaluation/unified/scoring-usage" + request.nextUrl.search);
}
