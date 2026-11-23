import type { Metadata } from "next";
import { AuthGate } from "@/components/auth-gate";
import { SharedRun } from "@/components/shared-run";

export const metadata: Metadata = { title: "评测结果 · 团队分享", robots: { index: false, follow: false, nocache: true }, referrer: "no-referrer" };

export default async function SharedRunPage({ params }: { params: Promise<{ shareId: string }> }) {
  const { shareId } = await params;
  return <AuthGate><SharedRun key={shareId} shareId={shareId} /></AuthGate>;
}
