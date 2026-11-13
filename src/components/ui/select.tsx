"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { ChevronDownIcon } from "./icons";
import styles from "./ui.module.css";

export type SelectOption = { value: string; label: string; disabled?: boolean; hint?: string };

type Props = {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
  disabled?: boolean;
  variant?: "default" | "bare";
  hideLabel?: boolean;
  block?: boolean;
  className?: string;
};

type Position = { top: number; left: number; width: number };

const MENU_GAP = 6;
const MENU_MAX_HEIGHT = 240;
const VIEWPORT_PADDING = 8;

function computePosition(trigger: HTMLButtonElement | null, menu: HTMLDivElement | null): Position | null {
  if (!trigger || typeof window === "undefined") return null;
  const rect = trigger.getBoundingClientRect();
  const width = Math.min(Math.max(rect.width, 168), window.innerWidth - VIEWPORT_PADDING * 2);
  const left = Math.max(VIEWPORT_PADDING, Math.min(rect.left, window.innerWidth - width - VIEWPORT_PADDING));
  const height = Math.min(menu?.offsetHeight || MENU_MAX_HEIGHT, MENU_MAX_HEIGHT);
  let top = rect.bottom + MENU_GAP;
  if (top + height > window.innerHeight - VIEWPORT_PADDING && rect.top - height - MENU_GAP > VIEWPORT_PADDING) {
    top = rect.top - height - MENU_GAP;
  }
  return { top, left, width };
}

export function Select({ value, options, onChange, label, placeholder = "请选择", disabled = false, variant = "default", hideLabel = false, block = false, className }: Props) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<Position | null>(null);
  const [portal, setPortal] = useState<HTMLElement | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selected = options.find((option) => option.value === value);

  function openMenu() {
    if (disabled) return;
    setPortal(trigger.current?.closest("dialog") ?? document.body);
    setPosition(computePosition(trigger.current, null));
    setOpen(true);
  }

  function closeMenu(restoreFocus = false) {
    setOpen(false);
    if (restoreFocus) trigger.current?.focus();
  }

  function choose(next: string) {
    onChange(next);
    closeMenu(true);
  }

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      setPosition(computePosition(trigger.current, menu.current));
      const optionButtons = menu.current?.querySelectorAll<HTMLButtonElement>('[role="option"]:not(:disabled)');
      const current = Array.from(optionButtons || []).find((option) => option.getAttribute("aria-selected") === "true");
      (current || optionButtons?.[0])?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (trigger.current?.contains(target) || menu.current?.contains(target)) return;
      setOpen(false);
    };
    const onFocusIn = (event: FocusEvent) => {
      const target = event.target as Node;
      if (trigger.current?.contains(target) || menu.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeMenu(true);
    };
    const onViewportChange = () => setPosition(computePosition(trigger.current, menu.current));
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
    };
  }, [open]);

  function onTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (!["Enter", " ", "ArrowDown", "ArrowUp"].includes(event.key)) return;
    event.preventDefault();
    if (open) closeMenu(true);
    else openMenu();
  }

  function onMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const nodes = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('[role="option"]:not(:disabled)') || []);
    if (!nodes.length) return;
    const index = nodes.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? nodes.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + nodes.length) % nodes.length;
    nodes[next]?.focus();
  }

  return <>
    <div className={[styles.selectField, className].filter(Boolean).join(" ")} data-variant={variant} data-block={block || undefined}>
      <span className={hideLabel ? styles.selectLabelHidden : styles.selectLabel}>{label}</span>
      <button
        ref={trigger}
        type="button"
        className={styles.selectTrigger}
        aria-label={`${label}：${selected?.label || placeholder}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        disabled={disabled}
        onClick={() => { if (open) closeMenu(true); else openMenu(); }}
        onKeyDown={onTriggerKeyDown}
      >
        <span>{selected?.label || placeholder}</span>
        <ChevronDownIcon />
      </button>
    </div>
    {open && portal && position && createPortal(
      <div
        ref={menu}
        id={listId}
        className={styles.selectMenu}
        role="listbox"
        aria-label={label}
        style={{ top: position.top, left: position.left, width: position.width }}
        onKeyDown={onMenuKeyDown}
      >
        {options.map((option) => {
          const active = option.value === value;
          return <button
            key={option.value}
            type="button"
            role="option"
            aria-selected={active}
            className={styles.selectOption}
            disabled={option.disabled}
            onClick={() => choose(option.value)}
          >
            <span className={styles.selectCheck} aria-hidden="true">{active ? "✓" : ""}</span>
            <span className={styles.selectOptionLabel}>{option.label}</span>
            {option.hint && <span className={styles.selectHint}>{option.hint}</span>}
          </button>;
        })}
      </div>,
      portal,
    )}
  </>;
}
