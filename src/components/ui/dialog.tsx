"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { Button } from "./button";
import { CloseIcon } from "./icons";
import styles from "./ui.module.css";

type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  footerStart?: ReactNode;
  busy?: boolean;
  closeLabel?: string;
  className?: string;
  contentClassName?: string;
  headerActions?: ReactNode;
  footerSticky?: boolean;
};

export function Dialog({ open, onClose, title, description, children, footer, footerStart, busy = false, closeLabel = "关闭", className, contentClassName, headerActions, footerSticky = false }: DialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const restore = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (open && !node.open) {
      restore.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      node.showModal();
    } else if (!open && node.open) {
      node.close();
    }
  }, [open]);

  useEffect(() => () => {
    if (dialog.current?.open) dialog.current.close();
  }, []);

  return <dialog
    ref={dialog}
    className={[styles.dialog, className].filter(Boolean).join(" ")}
    aria-labelledby={titleId}
    aria-describedby={description ? descriptionId : undefined}
    onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}
    onClick={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}
    onClose={() => {
      requestAnimationFrame(() => {
        if (!document.querySelector("dialog[open]")) restore.current?.focus();
      });
    }}
  >
    <div className={[styles.dialogContent, contentClassName].filter(Boolean).join(" ")}>
      <div className={styles.dialogHead}>
        <div className={styles.dialogHeadings}>
          <h2 id={titleId} className={styles.dialogTitle}>{title}</h2>
          {description && <p id={descriptionId} className={styles.dialogDescription}>{description}</p>}
        </div>
        {headerActions}
        <button type="button" className={styles.dialogClose} aria-label={closeLabel} disabled={busy} onClick={onClose}><CloseIcon /></button>
      </div>
      {children}
      {(footer || footerStart) && <div className={[styles.dialogFooter, footerSticky && styles.dialogFooterSticky].filter(Boolean).join(" ")}>
        {footerStart && <div className={styles.dialogFooterStart}>{footerStart}</div>}
        {footer && <div className={styles.dialogActions}>{footer}</div>}
      </div>}
    </div>
  </dialog>;
}

export function ConfirmDialog({ open, onClose, onConfirm, title, description, children, confirmLabel = "确认", cancelLabel = "取消", busy = false, danger = false, hint }: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  confirmLabel?: ReactNode;
  cancelLabel?: ReactNode;
  busy?: boolean;
  danger?: boolean;
  hint?: ReactNode;
}) {
  return <Dialog
    open={open}
    onClose={onClose}
    title={title}
    description={description}
    busy={busy}
    footerStart={hint}
    footer={<>
      <Button variant="secondary" disabled={busy} onClick={onClose}>{cancelLabel}</Button>
      <Button variant={danger ? "danger" : "primary"} loading={busy} onClick={onConfirm}>{confirmLabel}</Button>
    </>}
  >
    {children}
  </Dialog>;
}
