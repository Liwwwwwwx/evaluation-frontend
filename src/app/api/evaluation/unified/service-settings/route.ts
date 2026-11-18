import { NextRequest } from "next/server";
import { proxyUnified } from "@/lib/unified-evaluation-proxy";

const path = "/api/evaluation/unified/service-settings";

export function GET(request: NextRequest) { return proxyUnified(request, path); }
export function POST(request: NextRequest) { return proxyUnified(request, path, { maxBodyBytes: 8192 }); }
