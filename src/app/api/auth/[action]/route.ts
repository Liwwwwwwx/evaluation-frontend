import { NextRequest, NextResponse } from "next/server";
import { proxyEvaluationAuth } from "@/lib/evaluation-auth-proxy";

export async function GET(request: NextRequest, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  return action === "me" ? proxyEvaluationAuth(request, "me") : NextResponse.json({ error: "Not found" }, { status: 404 });
}
export async function POST(request: NextRequest, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  return action === "login" || action === "logout" ? proxyEvaluationAuth(request, action) : NextResponse.json({ error: "Not found" }, { status: 404 });
}
