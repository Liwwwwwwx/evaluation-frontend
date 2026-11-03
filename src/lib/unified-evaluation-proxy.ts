import { NextRequest, NextResponse } from "next/server";
import { backendOrigin } from "@/lib/evaluation-auth-proxy";

export async function proxyUnified(request: NextRequest, path: string, options: {maxBodyBytes?: number} = {}) {
  // 受信服务端带 Authorization 调用时原样透传，由测评后端做最终鉴权；
  // 浏览器跨站请求无法自定义 Authorization 头（会先被预检拦下），跳过会话与同源校验不引入 CSRF 面。
  const authorization = request.headers.get("authorization");
  const session = request.cookies.get("evaluation_session")?.value;
  if (!session && !authorization) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const host = request.headers.get("host");
  const origin = host ? `${request.nextUrl.protocol}//${host}` : "";
  const headers = new Headers({ Accept: path.endsWith("/events") ? "text/event-stream" : "application/json" });
  if (session) headers.set("Cookie", `evaluation_session=${session}`);
  // 令牌头对 GET 与 POST 一视同仁地转发，凭据是否有效始终由后端判定。
  if (authorization) headers.set("Authorization", authorization);
  let body: string | undefined;
  if (request.method === "POST") {
    if (!authorization) {
      if (!origin || request.headers.get("origin") !== origin || request.headers.get("sec-fetch-site") === "cross-site") return NextResponse.json({ error: "请求来源无效" }, { status: 403 });
      const key = request.headers.get("Idempotency-Key") || "";
      if (!/^[\x21-\x7e]{1,128}$/.test(key)) return NextResponse.json({ error: "幂等键无效" }, { status: 400 });
    }
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return NextResponse.json({ error: "请求格式无效" }, { status: 415 });
    body = await request.text();
    if (Buffer.byteLength(body) > (options.maxBodyBytes || 16 * 1024)) return NextResponse.json({ error: "请求内容过大" }, { status: 413 });
    if (!authorization) headers.set("Origin", origin);
    headers.set("Content-Type", "application/json");
    if (!authorization) headers.set("Idempotency-Key", request.headers.get("Idempotency-Key") || "");
  }
  try {
    const upstream = await fetch(new URL(path, backendOrigin()), { method: request.method, headers, body, cache: "no-store", redirect: "error", signal: request.signal });
    const responseHeaders = new Headers({ "Content-Type": upstream.headers.get("content-type") || "application/json", "Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no" });
    for (const name of ["Content-Disposition", "Content-Security-Policy", "X-Content-Type-Options"]) { const value = upstream.headers.get(name); if (value) responseHeaders.set(name, value); }
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  } catch { return NextResponse.json({ error: "无法连接独立测评服务，请稍后重试。" }, { status: 503 }); }
}
