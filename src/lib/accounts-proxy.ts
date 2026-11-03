import { NextRequest, NextResponse } from "next/server";
import { backendOrigin } from "@/lib/evaluation-auth-proxy";

export async function proxyAccounts(request: NextRequest, path: string) {
  const session = request.cookies.get("evaluation_session")?.value;
  if (!session) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "请先登录" } }, { status: 401 });
  const host = request.headers.get("host");
  const origin = host ? `${request.nextUrl.protocol}//${host}` : "";
  const headers = new Headers({ Accept: "application/json", Cookie: `evaluation_session=${session}` });
  let body: string | undefined;
  if (request.method !== "GET") {
    if (!origin || request.headers.get("origin") !== origin || request.headers.get("sec-fetch-site") === "cross-site") return NextResponse.json({ error: { code: "INVALID_ORIGIN", message: "请求来源无效" } }, { status: 403 });
    headers.set("Origin", origin);
    if (request.method !== "DELETE") {
      if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return NextResponse.json({ error: { code: "INVALID_CONTENT_TYPE", message: "请求格式无效" } }, { status: 415 });
      const size = Number(request.headers.get("content-length") || 0);
      if (size > 4096) return NextResponse.json({ error: { code: "REQUEST_TOO_LARGE", message: "请求内容过大" } }, { status: 413 });
      body = await request.text();
      if (Buffer.byteLength(body) > 4096) return NextResponse.json({ error: { code: "REQUEST_TOO_LARGE", message: "请求内容过大" } }, { status: 413 });
      headers.set("Content-Type", "application/json");
    }
  }
  try {
    const url = new URL(path, backendOrigin());
    if (request.method === "GET") for (const key of ["page", "pageSize", "search"]) { const value = request.nextUrl.searchParams.get(key); if (value !== null) url.searchParams.set(key, value); }
    const response = await fetch(url, { method: request.method, headers, body, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000) });
    const data = await response.json().catch(() => ({ error: { message: "账号服务返回异常" } }));
    return NextResponse.json(data, { status: response.status, headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: { message: "无法连接账号服务，请稍后重试。" } }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
}
