import { NextRequest, NextResponse } from "next/server";
import { proxyUnified } from "@/lib/unified-evaluation-proxy";
export async function POST(request: NextRequest, { params }: { params: Promise<{ruleId:string;action:string}> }) {
  const {ruleId,action} = await params;
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(ruleId) || !["save","publish","activate","archive"].includes(action)) return NextResponse.json({error:"规则操作无效"},{status:400});
  return proxyUnified(request,`/api/evaluation/rules/${ruleId}/${action}`,{maxBodyBytes:96*1024});
}
