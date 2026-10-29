import { NextRequest, NextResponse } from "next/server";
import { adminOrigin, copySessionCookie, localCookie, upstreamCookie } from "@/lib/auth-proxy";

const fixedCaseBase = "/api/admin/team-services/evaluations/question-bank/fixed-cases";
const routes: Record<string, { path: string; method: "GET" | "POST" | "DELETE" }> = {
  access: { path: "/api/admin/auth/me", method: "GET" },
  questions: { path: "/api/admin/team-services/evaluations/question-bank/questions", method: "GET" },
  import: { path: fixedCaseBase, method: "POST" },
  delete: { path: fixedCaseBase, method: "DELETE" },
};

function sameOrigin(request: NextRequest) {
  const host = request.headers.get("host");
  return !!host && request.headers.get("origin") === `${request.nextUrl.protocol}//${host}` && request.headers.get("sec-fetch-site") !== "cross-site";
}

async function proxy(request: NextRequest, action: string) {
  const route = routes[action];
  if (!route || request.method !== route.method) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  if (route.method !== "GET" && !sameOrigin(request)) return NextResponse.json({ ok: false, error: "请求来源无效" }, { status: 403 });
  const session = request.cookies.get(localCookie)?.value;
  if (!session) return NextResponse.json({ ok: false, error: "请先登录" }, { status: 401 });

  let body: string | undefined;
  let path = route.path;
  if (action === "import") {
    try {
      const value = await request.json();
      if (!Array.isArray(value.items) || value.items.length < 1 || value.items.length > 100 || value.items.some((item: unknown) => !item || typeof item !== "object" || typeof (item as Record<string, unknown>).serviceKey !== "string" || typeof (item as Record<string, unknown>).question !== "string" || ((item as Record<string, string>).question.length > 500))) throw new Error();
      body = JSON.stringify({ items: value.items.map((item: { serviceKey: string; question: string }) => ({ serviceKey: item.serviceKey, question: item.question })) });
    } catch { return NextResponse.json({ ok: false, error: "导入数据格式不正确" }, { status: 400 }); }
  }
  if (action === "delete") {
    try {
      const value = await request.json();
      const id = value?.id;
      const datasetVersion = value?.datasetVersion;
      if (typeof id !== "string" || !id || id.length > 200 || typeof datasetVersion !== "string" || !datasetVersion || datasetVersion.length > 100) throw new Error();
      path = `${fixedCaseBase}/${encodeURIComponent(id)}`;
      body = JSON.stringify({ datasetVersion });
    } catch { return NextResponse.json({ ok: false, error: "删除参数不正确" }, { status: 400 }); }
  }

  try {
    const origin = adminOrigin();
    const url = new URL(path, origin);
    if (action === "questions") for (const key of ["service", "source", "status", "search", "limit", "offset"]) { const value = request.nextUrl.searchParams.get(key); if (value) url.searchParams.set(key, value); }
    const headers = new Headers({ Accept: "application/json", Origin: origin, Cookie: `${upstreamCookie}=${session}` });
    if (body) headers.set("Content-Type", "application/json");
    const upstream = await fetch(url, { method: route.method, headers, body, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000) });
    const data = await upstream.json().catch(() => ({ ok: false, error: "题库服务返回异常" }));
    const response = NextResponse.json(data, { status: upstream.status, headers: { "Cache-Control": "no-store" } });
    copySessionCookie(upstream, response);
    return response;
  } catch { return NextResponse.json({ ok: false, error: "无法连接题库服务，请稍后重试。" }, { status: 503 }); }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ action: string }> }) { return proxy(request, (await params).action); }
export async function POST(request: NextRequest, { params }: { params: Promise<{ action: string }> }) { return proxy(request, (await params).action); }
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ action: string }> }) { return proxy(request, (await params).action); }
