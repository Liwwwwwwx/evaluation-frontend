import { NextRequest } from "next/server";
import { evaluationBase, proxyEvaluation } from "@/lib/evaluation-proxy";

function pageNumber(value: string | null, fallback: number, max: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= max ? parsed : fallback;
}

export async function GET(request: NextRequest) {
  const page = pageNumber(request.nextUrl.searchParams.get("page"), 1, 100000);
  const pageSize = pageNumber(request.nextUrl.searchParams.get("pageSize"), 20, 100);
  return proxyEvaluation(request, `${evaluationBase}/runs?page=${page}&pageSize=${pageSize}`);
}
