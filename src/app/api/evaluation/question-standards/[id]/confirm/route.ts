import { NextRequest } from "next/server";
import { proxyUnified } from "@/lib/unified-evaluation-proxy";
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) { return proxyUnified(request, `/api/evaluation/question-standards/${encodeURIComponent((await params).id)}/confirm`); }
