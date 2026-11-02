import { NextRequest, NextResponse } from "next/server";
import { evaluationBase, isSameOrigin, proxyEvaluation } from "@/lib/evaluation-proxy";

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ ok: false, error: "请求来源无效" }, { status: 403 });

  let value: unknown;
  try {
    value = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "请求格式不正确" }, { status: 400 });
  }

  const body = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (question.length < 8 || question.length > 500) {
    return NextResponse.json({ ok: false, error: "题目需要 8–500 个字符" }, { status: 400 });
  }

  const forwarded: Record<string, string> = { question };
  if (typeof body.questionId === "string" && body.questionId && body.questionId.length <= 200) forwarded.questionId = body.questionId;
  if (typeof body.datasetVersion === "string" && body.datasetVersion && body.datasetVersion.length <= 100) forwarded.datasetVersion = body.datasetVersion;
  if (body.sourceType === "fixed" || body.sourceType === "random") forwarded.sourceType = body.sourceType;

  return proxyEvaluation(request, `${evaluationBase}/ask`, { method: "POST", body: forwarded });
}
