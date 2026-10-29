import type { ReactNode } from "react";
import { AuthGate } from "@/components/auth-gate";
import { ChatShell } from "@/components/chat-shell";

export default function ChatLayout({ children }: { children: ReactNode }) {
  return <AuthGate><ChatShell>{children}</ChatShell></AuthGate>;
}
