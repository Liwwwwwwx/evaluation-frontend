"use client";

import { useState } from "react";
import { fieldLabel, record, scalar, type DataRecord } from "@/lib/structured-results";

const privateField = /^(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret|authorization|cookie|private[_-]?key)$/i;

export function DataDisclosure({ title, value, initialOpen = false }: { title: string; value: unknown; initialOpen?: boolean }) {
  const [open, setOpen] = useState(initialOpen);
  return <details className="structured-disclosure" open={open} onToggle={event => setOpen(event.currentTarget.open)}><summary>{title}</summary>{open && <StructuredValue value={value} />}</details>;
}

export function StructuredValue({ value }: { value: unknown }) {
  const [limit, setLimit] = useState(12);
  if (!value || typeof value !== "object") return <span className="structured-scalar">{scalar(value)}</span>;
  const obj = record(value);
  const entries: [string, unknown][] = obj ? Object.entries(obj) : (value as unknown[]).map((item, index) => [String(index + 1), item]);
  if (!entries.length) return <span className="run-score-note">{obj ? "空对象" : "空列表"}</span>;
  return <div className="structured-tree"><dl>{entries.slice(0, limit).map(([key, item]) => <div key={key}><dt>{obj ? fieldLabel(key) : `第 ${key} 项`}</dt><dd>{privateField.test(key) ? "已隐藏" : item && typeof item === "object" ? <DataDisclosure title={scalar(item)} value={item} /> : <span className="structured-scalar" title={typeof item === "number" ? String(item) : undefined}>{scalar(item)}</span>}</dd></div>)}</dl>{entries.length > limit && <button type="button" className="secondary-button" onClick={() => setLimit(current => current + 24)}>继续显示（剩余{entries.length - limit}项）</button>}</div>;
}

export function ResultContext({ value, title = "要求与计算条件" }: { value: DataRecord; title?: string }) {
  if (!Object.keys(value).length) return null;
  return <section className="run-service-section"><h3>{title}</h3><StructuredValue value={value} /></section>;
}
