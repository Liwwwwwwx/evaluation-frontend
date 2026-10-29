import { NextRequest, NextResponse } from "next/server";
import { proxyAuth } from "@/lib/auth-proxy";

export async function GET(request: NextRequest, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  return action === "me" ? proxyAuth(request, "me") : NextResponse.json({ error: "Not found" }, { status: 404 });
}
export async function POST(request: NextRequest, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  return action === "login" || action === "logout" ? proxyAuth(request, action) : NextResponse.json({ error: "Not found" }, { status: 404 });
}
