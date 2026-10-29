import { NextRequest, NextResponse } from "next/server";

const localCookie = "evaluation_auth_session";
const upstreamCookie = "app_auth_session";

function adminOrigin() {
  const configured = process.env.SCIENCE_ADMIN_FRONTEND_URL;
  if (!configured && process.env.NODE_ENV === "production") throw new Error("认证服务地址未配置");
  const url = new URL(configured || "http://127.0.0.1:6713");
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  if (url.username || url.password || (url.protocol !== "https:" && !(url.protocol === "http:" && local && process.env.NODE_ENV !== "production"))) throw new Error("认证服务地址必须使用 HTTPS");
  return url.origin;
}

export async function proxyAuth(request: NextRequest, action: "login" | "me" | "logout") {
  const isWrite = action !== "me";
  const host = request.headers.get("host");
  const expectedOrigin = host ? `${request.nextUrl.protocol}//${host}` : "";
  if (isWrite && (request.headers.get("origin") !== expectedOrigin || request.headers.get("sec-fetch-site") === "cross-site")) {
    return NextResponse.json({ ok: false, error: "请求来源无效" }, { status: 403 });
  }
  let body: string | undefined;
  if (action === "login") {
    try {
      const input = await request.json();
      if (typeof input.username !== "string" || !input.username.trim() || input.username.length > 100 || typeof input.password !== "string" || !input.password || input.password.length > 100) throw new Error();
      body = JSON.stringify({ username: input.username, password: input.password, rememberMe: input.rememberMe === true, locale: "zh" });
    } catch { return NextResponse.json({ ok: false, error: "请输入有效的用户名和密码" }, { status: 400 }); }
  }
  try {
    const origin = adminOrigin();
    const session = request.cookies.get(localCookie)?.value;
    const headers = new Headers({ Accept: "application/json", Origin: origin });
    if (body) headers.set("Content-Type", "application/json");
    if (session && action !== "login") headers.set("Cookie", `${upstreamCookie}=${session}`);
    const upstream = await fetch(`${origin}/api/auth/${action}`, { method: isWrite ? "POST" : "GET", headers, body, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000) });
    const data = await upstream.json().catch(() => ({ ok: false, error: "认证服务返回异常" }));
    const response = NextResponse.json(data, { status: upstream.status, headers: { "Cache-Control": "no-store" } });
    for (const cookie of upstream.headers.getSetCookie()) {
      const match = cookie.match(/^app_auth_session=([^;]*)/i);
      if (!match) continue;
      const age = cookie.match(/(?:^|;)\s*max-age=(\d+)/i);
      const deleted = !match[1] || (age && Number(age[1]) === 0);
      response.cookies.set(localCookie, deleted ? "" : match[1], { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: deleted ? 0 : age ? Number(age[1]) : undefined });
    }
    return response;
  } catch { return NextResponse.json({ ok: false, error: "无法连接认证服务，请稍后重试。" }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
}
