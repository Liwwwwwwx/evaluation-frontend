import type { ReactNode } from "react";
import styles from "./ui.module.css";

export type AlertTone = "success" | "warning" | "danger" | "info" | "neutral";

export function InlineAlert({ tone = "neutral", children, action, className }: { tone?: AlertTone; children: ReactNode; action?: ReactNode; className?: string }) {
  return <div className={[styles.alert, className].filter(Boolean).join(" ")} data-tone={tone} role={tone === "danger" ? "alert" : "status"}>
    <i className={styles.alertMark} aria-hidden="true" />
    <p className={styles.alertText}>{children}</p>
    {action && <div className={styles.alertAction}>{action}</div>}
  </div>;
}
