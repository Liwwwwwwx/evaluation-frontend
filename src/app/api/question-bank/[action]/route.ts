import { NextRequest, NextResponse } from "next/server";
import { backendOrigin } from "@/lib/evaluation-auth-proxy";

const methods: Record<string, string> = { access: "GET", questions: "GET", question: "GET", "test-sets": "GET", import: "POST", "random-save": "POST", generate: "POST", domain: "PUT", update: "PUT", delete: "DELETE" };

async function proxy(request: NextRequest, action: string) {
  if (!Object.hasOwn(methods, action) || request.method !== methods[action]) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const host = request.headers.get("host");
  const origin = host ? `${request.nextUrl.protocol}//${host}` : "";
  if (request.method !== "GET" && (request.headers.get("origin") !== origin || request.headers.get("sec-fetch-site") === "cross-site")) return NextResponse.json({ error: "请求来源无效" }, { status: 403 });
  const session = request.cookies.get("evaluation_session")?.value;
  if (!session) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  try {
    const url = new URL(`/api/question-bank/${action}`, backendOrigin());
    if (action === "questions") for (const key of ["service", "runnableFor", "comparisonWith", "maxLength", "domain", "testSet", "source", "status", "search", "limit", "offset"]) { const value = request.nextUrl.searchParams.get(key); if (value) url.searchParams.set(key, value); }
    if (action === "question") for (const key of ["id", "datasetVersion"]) { const value = request.nextUrl.searchParams.get(key); if (value) url.searchParams.set(key, value); }
    const headers = new Headers({ Accept: "application/json", Cookie: `evaluation_session=${session}` });
    let body: string | undefined;
    if (request.method !== "GET") {
      if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return NextResponse.json({ error: "请求格式无效" }, { status: 415 });
      const size = Number(request.headers.get("content-length") || 0);
      if (size > 256 * 1024) return NextResponse.json({ error: "请求内容过大" }, { status: 413 });
      body = await request.text();
      if (Buffer.byteLength(body) > 256 * 1024) return NextResponse.json({ error: "请求内容过大" }, { status: 413 });
      headers.set("Content-Type", "application/json"); headers.set("Origin", origin);
    }
    const upstream = await fetch(url, { method: request.method, headers, body, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(action === "generate" ? 130000 : 15000) });
    const data = await upstream.json().catch(() => ({ error: "题库服务返回异常" }));
    return NextResponse.json(data, { status: upstream.status, headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "无法连接题库服务，请稍后重试。" }, { status: 503 }); }
}
export async function GET(request: NextRequest, { params }: { params: Promise<{ action: string }> }) { return proxy(request, (await params).action); }
export async function POST(request: NextRequest, { params }: { params: Promise<{ action: string }> }) { return proxy(request, (await params).action); }
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ action: string }> }) { return proxy(request, (await params).action); }
export async function PUT(request: NextRequest, { params }: { params: Promise<{ action: string }> }) { return proxy(request, (await params).action); }
