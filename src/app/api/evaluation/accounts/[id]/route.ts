import { NextRequest, NextResponse } from "next/server";
import { proxyAccounts } from "@/lib/accounts-proxy";

type Context = { params: Promise<{ id: string }> };
async function handle(request: NextRequest, { params }: Context) {
  const { id } = await params;
  if (!id || id === "." || id === ".." || id.length > 200) return NextResponse.json({ error: { code: "INVALID_ACCOUNT_ID", message: "用户标识无效" } }, { status: 400 });
  return proxyAccounts(request, `/api/evaluation/accounts/${encodeURIComponent(id)}`);
}
export const PATCH = handle;
export const DELETE = handle;
