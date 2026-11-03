import { NextRequest, NextResponse } from "next/server";
import { proxyAccounts } from "@/lib/accounts-proxy";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id || id === "." || id === ".." || id.length > 200) return NextResponse.json({ error: { code: "INVALID_ACCOUNT_ID", message: "用户标识无效" } }, { status: 400 });
  return proxyAccounts(request, `/api/evaluation/accounts/${encodeURIComponent(id)}/reset-password`);
}
