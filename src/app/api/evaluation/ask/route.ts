import { NextResponse } from "next/server";

export function POST() {
  return NextResponse.json({ error: "旧测评入口已停用，请在测评工作台新建。" }, { status: 410 });
}
