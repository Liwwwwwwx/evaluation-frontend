import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ChatShell } from "@/components/chat-shell";

export const metadata: Metadata = { title: "测评批次（预览）" };

export default function PreviewBatchesLayout({ children }: { children: ReactNode }) {
  return <ChatShell preview>{children}</ChatShell>;
}
