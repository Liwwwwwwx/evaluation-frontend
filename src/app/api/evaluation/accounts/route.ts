import { NextRequest } from "next/server";
import { proxyAccounts } from "@/lib/accounts-proxy";

export async function GET(request: NextRequest) { return proxyAccounts(request, "/api/evaluation/accounts"); }
export async function POST(request: NextRequest) { return proxyAccounts(request, "/api/evaluation/accounts"); }
