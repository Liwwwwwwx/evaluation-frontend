import type { ReactNode } from "react";
import { AlertIcon, EmptyIcon, LockIcon } from "./icons";
import styles from "./ui.module.css";

export type EmptyStateKind = "empty" | "loading" | "error" | "forbidden";

export function EmptyState({ state = "empty", title, description, action, compact = false, className }: {
  state?: EmptyStateKind;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
  className?: string;
}) {
  return <div className={[styles.emptyState, className].filter(Boolean).join(" ")} data-compact={compact || undefined} role={state === "error" ? "alert" : state === "loading" ? "status" : undefined}>
    <span className={styles.emptyStateIcon} aria-hidden="true">
      {state === "loading" ? <span className={styles.emptyStateSpinner} /> : state === "error" ? <AlertIcon /> : state === "forbidden" ? <LockIcon /> : <EmptyIcon />}
    </span>
    <div className={styles.emptyStateBody}>
      <p className={styles.emptyStateTitle}>{title}</p>
      {description && <p className={styles.emptyStateDescription}>{description}</p>}
    </div>
    {action && <div className={styles.emptyStateAction}>{action}</div>}
  </div>;
}
