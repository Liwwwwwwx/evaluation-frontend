"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import styles from "./ui.module.css";

export type ToastTone = "success" | "error" | "info";
export type ToastItem = { id: number; tone: ToastTone; text: string };

const DURATION: Record<ToastTone, number> = { success: 2400, info: 2400, error: 4200 };

export function useToasts(max = 3) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    setToasts((list) => list.filter((item) => item.id !== id));
  }, []);

  const push = useCallback((tone: ToastTone, text: string) => {
    const id = ++nextId.current;
    setToasts((list) => [...list.slice(-(max - 1)), { id, tone, text }]);
    const timer = setTimeout(() => dismiss(id), DURATION[tone]);
    timers.current.set(id, timer);
    return id;
  }, [dismiss, max]);

  useEffect(() => () => {
    for (const timer of timers.current.values()) clearTimeout(timer);
    timers.current.clear();
  }, []);

  return { toasts, push, dismiss };
}

const subscribeNoop = () => () => {};

export function ToastStack({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss?: (id: number) => void }) {
  const mounted = useSyncExternalStore(subscribeNoop, () => true, () => false);
  if (!mounted) return null;
  return createPortal(
    <div className={styles.toastStack}>
      {toasts.map((item) => <div key={item.id} className={styles.toast} data-tone={item.tone} role={item.tone === "error" ? "alert" : "status"} onClick={() => onDismiss?.(item.id)}>
        <i className={styles.toastMark} aria-hidden="true" />
        {item.text}
      </div>)}
    </div>,
    document.body,
  );
}
