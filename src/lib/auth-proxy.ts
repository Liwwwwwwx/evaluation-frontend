import { NextResponse } from "next/server";

export const localCookie = "evaluation_auth_session";
export const upstreamCookie = "app_auth_session";

export function adminOrigin() {
  const configured = process.env.SCIENCE_ADMIN_FRONTEND_URL;
  if (!configured && process.env.NODE_ENV === "production") throw new Error("认证服务地址未配置");
  const url = new URL(configured || "http://127.0.0.1:6713");
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  if (url.username || url.password || (url.protocol !== "https:" && !(url.protocol === "http:" && local && process.env.NODE_ENV !== "production"))) throw new Error("认证服务地址必须使用 HTTPS");
  return url.origin;
}

export function copySessionCookie(upstream: Response, response: NextResponse) {
  for (const cookie of upstream.headers.getSetCookie()) {
    const match = cookie.match(/^app_auth_session=([^;]*)/i);
    if (!match) continue;
    const age = cookie.match(/(?:^|;)\s*max-age=(\d+)/i);
    const deleted = !match[1] || (age && Number(age[1]) === 0);
    response.cookies.set(localCookie, deleted ? "" : match[1], { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: deleted ? 0 : age ? Number(age[1]) : undefined });
  }
}
