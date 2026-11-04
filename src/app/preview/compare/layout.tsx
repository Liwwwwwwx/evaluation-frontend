import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ChatShell } from "@/components/chat-shell";

export const metadata: Metadata = { title: "对比测评（预览）" };

export default function PreviewCompareLayout({ children }: { children: ReactNode }) {
  return <ChatShell preview>{children}</ChatShell>;
}
