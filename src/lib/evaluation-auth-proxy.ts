import { NextRequest, NextResponse } from "next/server";

const sessionCookie = "evaluation_session";
const oldCookie = "evaluation_auth_session";

export function backendOrigin() {
  const configured = process.env.SCIENCE_EVALUATION_BACKEND_URL;
  if (!configured && process.env.NODE_ENV === "production") throw new Error("测评认证服务地址未配置");
  const url = new URL(configured || "http://127.0.0.1:7714");
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash || (url.protocol !== "https:" && !(url.protocol === "http:" && local))) throw new Error("测评认证服务地址无效");
  return url.origin;
}

export async function proxyEvaluationAuth(request: NextRequest, action: "login" | "me" | "logout") {
  const isWrite = action !== "me";
  const host = request.headers.get("host");
  const origin = host ? `${request.nextUrl.protocol}//${host}` : "";
  if (isWrite && (request.headers.get("origin") !== origin || request.headers.get("sec-fetch-site") === "cross-site")) {
    return NextResponse.json({ ok: false, error: { code: "INVALID_ORIGIN", message: "请求来源无效" } }, { status: 403 });
  }
  let body: string | undefined;
  if (action === "login") {
    try {
      const input = await request.json();
      if (typeof input.username !== "string" || !input.username.trim() || input.username.length > 100 || typeof input.password !== "string" || !input.password || input.password.length > 100 || (input.totpCode !== undefined && (typeof input.totpCode !== "string" || input.totpCode.length > 100))) throw new Error();
      body = JSON.stringify({ username: input.username, password: input.password, rememberMe: input.rememberMe === true, totpCode: input.totpCode });
    } catch { return NextResponse.json({ ok: false, error: { code: "INVALID_INPUT", message: "请输入有效的用户名和密码" } }, { status: 400 }); }
  }
  try {
    const session = request.cookies.get(sessionCookie)?.value;
    const headers = new Headers({ Accept: "application/json" });
    if (isWrite) headers.set("Origin", origin);
    if (body) headers.set("Content-Type", "application/json");
    if (session && action !== "login") headers.set("Cookie", `${sessionCookie}=${session}`);
    const upstream = await fetch(`${backendOrigin()}/api/auth/${action}`, { method: isWrite ? "POST" : "GET", headers, body, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000) });
    const data = await upstream.json().catch(() => ({ ok: false, error: { code: "UPSTREAM_ERROR", message: "认证服务返回异常" } }));
    const response = NextResponse.json(data, { status: upstream.status, headers: { "Cache-Control": "no-store" } });
    for (const cookie of upstream.headers.getSetCookie()) {
      const match = cookie.match(/^evaluation_session=([A-Za-z0-9_-]*)(?:;|$)/i);
      if (!match) continue;
      const age = cookie.match(/(?:^|;)\s*max-age=(\d+)/i);
      response.cookies.set(sessionCookie, match[1], { httpOnly: true, secure: request.nextUrl.protocol === "https:" || (process.env.NODE_ENV === "production" && process.env.EVALUATION_ALLOW_HTTP !== "true"), sameSite: "lax", path: "/", maxAge: age ? Number(age[1]) : undefined });
    }
    if (upstream.ok && action !== "me") response.cookies.set(oldCookie, "", { httpOnly: true, secure: request.nextUrl.protocol === "https:" || (process.env.NODE_ENV === "production" && process.env.EVALUATION_ALLOW_HTTP !== "true"), sameSite: "lax", path: "/", maxAge: 0 });
    return response;
  } catch { return NextResponse.json({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "无法连接认证服务，请稍后重试。" } }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
}
