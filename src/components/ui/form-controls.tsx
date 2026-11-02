"use client";

import { useEffect, useId, useRef, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import styles from "./ui.module.css";

type FieldMeta = {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  id?: string;
  className?: string;
};

function describedBy(id: string, hint?: ReactNode, error?: ReactNode) {
  const ids = [hint ? `${id}-hint` : "", error ? `${id}-error` : ""].filter(Boolean);
  return ids.length ? ids.join(" ") : undefined;
}

export function Input({ label, hint, error, id, className, ...props }: FieldMeta & Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "className">) {
  const autoId = useId();
  const inputId = id || autoId;
  return <div className={[styles.field, className].filter(Boolean).join(" ")}>
    {label && <label className={styles.fieldLabel} htmlFor={inputId}>{label}</label>}
    <input {...props} id={inputId} className={styles.input} aria-invalid={error ? true : props["aria-invalid"]} aria-describedby={describedBy(inputId, hint, error)} />
    {error ? <span id={`${inputId}-error`} className={styles.fieldError}>{error}</span> : hint ? <span id={`${inputId}-hint`} className={styles.hint}>{hint}</span> : null}
  </div>;
}

export function Textarea({ label, hint, error, id, className, ...props }: FieldMeta & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id" | "className">) {
  const autoId = useId();
  const inputId = id || autoId;
  return <div className={[styles.field, className].filter(Boolean).join(" ")}>
    {label && <label className={styles.fieldLabel} htmlFor={inputId}>{label}</label>}
    <textarea {...props} id={inputId} className={styles.textarea} aria-invalid={error ? true : props["aria-invalid"]} aria-describedby={describedBy(inputId, hint, error)} />
    {error ? <span id={`${inputId}-error`} className={styles.fieldError}>{error}</span> : hint ? <span id={`${inputId}-hint`} className={styles.hint}>{hint}</span> : null}
  </div>;
}

export function Checkbox({ checked, indeterminate = false, onChange, label, disabled = false, className, "aria-label": ariaLabel, title }: {
  checked: boolean;
  indeterminate?: boolean;
  onChange?: (checked: boolean) => void;
  label?: ReactNode;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
  title?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate && !checked;
  }, [indeterminate, checked]);
  const input = <input
    ref={ref}
    type="checkbox"
    className={[styles.checkbox, className].filter(Boolean).join(" ")}
    checked={checked}
    disabled={disabled}
    aria-label={ariaLabel}
    aria-checked={indeterminate && !checked ? "mixed" : checked}
    title={title}
    onChange={(event) => onChange?.(event.target.checked)}
  />;
  if (!label) return input;
  return <label className={styles.checkboxRow} data-disabled={disabled || undefined}>{input}<span>{label}</span></label>;
}
