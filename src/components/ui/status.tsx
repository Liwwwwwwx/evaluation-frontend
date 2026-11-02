import type { ReactNode } from "react";
import styles from "./ui.module.css";

export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral";

export function StatusDot({ tone = "neutral", children, className }: { tone?: StatusTone; children: ReactNode; className?: string }) {
  return <span className={[styles.status, className].filter(Boolean).join(" ")} data-tone={tone}>
    <i className={styles.statusDot} aria-hidden="true" />
    {children}
  </span>;
}

export function Badge({ tone = "neutral", children, className }: { tone?: StatusTone; children: ReactNode; className?: string }) {
  return <span className={[styles.badge, className].filter(Boolean).join(" ")} data-tone={tone}>
    <i className={styles.badgeDot} aria-hidden="true" />
    {children}
  </span>;
}
