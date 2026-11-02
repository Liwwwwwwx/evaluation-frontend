"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";
import styles from "./ui.module.css";

export type TabItem = { value: string; label: ReactNode; disabled?: boolean };

export function tabButtonId(idBase: string, value: string) {
  return `${idBase}-tab-${value}`;
}

export function tabPanelId(idBase: string, value: string) {
  return `${idBase}-panel-${value}`;
}

export function Tabs({ items, value, onChange, variant = "underline", ariaLabel, idBase, bordered = true, className }: {
  items: TabItem[];
  value: string;
  onChange: (value: string) => void;
  variant?: "underline" | "pill";
  ariaLabel: string;
  idBase?: string;
  bordered?: boolean;
  className?: string;
}) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return;
    const enabledIndexes = items.map((item, index) => item.disabled ? -1 : index).filter((index) => index >= 0);
    if (!enabledIndexes.length) return;
    const currentIndex = items.findIndex((item) => item.value === value);
    const position = Math.max(0, enabledIndexes.indexOf(currentIndex));
    const nextIndex = event.key === "Home"
      ? enabledIndexes[0]
      : event.key === "End"
        ? enabledIndexes[enabledIndexes.length - 1]
        : enabledIndexes[(position + (event.key === "ArrowRight" ? 1 : -1) + enabledIndexes.length) % enabledIndexes.length];
    event.preventDefault();
    onChange(items[nextIndex].value);
    buttons.current[nextIndex]?.focus();
  }

  return <div className={[styles.tabs, className].filter(Boolean).join(" ")} data-variant={variant} data-bordered={bordered || undefined} role="tablist" aria-label={ariaLabel} onKeyDown={onKeyDown}>
    {items.map((item, index) => {
      const selected = item.value === value;
      return <button
        key={item.value}
        ref={(node) => { buttons.current[index] = node; }}
        id={idBase ? tabButtonId(idBase, item.value) : undefined}
        type="button"
        role="tab"
        aria-selected={selected}
        aria-controls={idBase ? tabPanelId(idBase, item.value) : undefined}
        tabIndex={selected ? 0 : -1}
        disabled={item.disabled}
        className={styles.tab}
        onClick={() => onChange(item.value)}
      >
        {item.label}
      </button>;
    })}
  </div>;
}
