import { NextRequest } from "next/server";
import { proxyUnified } from "@/lib/unified-evaluation-proxy";
export async function GET(request: NextRequest) { return proxyUnified(request, `/api/evaluation/question-standards${request.nextUrl.search}`); }
export async function POST(request: NextRequest) { return proxyUnified(request, "/api/evaluation/question-standards", { maxBodyBytes: 128 * 1024 }); }
