import { NextRequest, NextResponse } from "next/server";
import { adminOrigin, copySessionCookie, localCookie, upstreamCookie } from "@/lib/auth-proxy";

export const evaluationBase = "/api/admin/team-services/evaluations/alpha-rsi";

export function isSameOrigin(request: NextRequest) {
  const host = request.headers.get("host");
  return Boolean(host) && request.headers.get("origin") === `${request.nextUrl.protocol}//${host}` && request.headers.get("sec-fetch-site") !== "cross-site";
}

export async function proxyEvaluation(request: NextRequest, path: string, options: { method?: "GET" | "POST"; body?: unknown } = {}) {
  const session = request.cookies.get(localCookie)?.value;
  if (!session) return NextResponse.json({ ok: false, error: "请先登录" }, { status: 401 });

  try {
    const origin = adminOrigin();
    const headers = new Headers({ Accept: "application/json", Origin: origin, Cookie: `${upstreamCookie}=${session}` });
    const body = options.body === undefined ? undefined : JSON.stringify(options.body);
    if (body) headers.set("Content-Type", "application/json");
    const upstream = await fetch(new URL(path, origin), {
      method: options.method ?? "GET",
      headers,
      body,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(30000),
    });
    const data = await upstream.json().catch(() => ({ ok: false, error: "评测服务返回异常" }));
    const response = NextResponse.json(data, { status: upstream.status, headers: { "Cache-Control": "no-store" } });
    copySessionCookie(upstream, response);
    return response;
  } catch {
    return NextResponse.json({ ok: false, error: "无法连接评测服务，请稍后重试。" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
