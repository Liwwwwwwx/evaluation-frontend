"use client";
import { createRequestKey } from "@/lib/request-key";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnswerMarkdown } from "@/components/answer-markdown";
import { ScoringRuleForm } from "@/components/scoring-rule-form";
import { Badge, Button, EmptyState, InlineAlert, Select, StatusDot, Tabs, ToastStack, type StatusTone, useToasts } from "@/components/ui";
import { requestRules, ruleDocument, stateNames, validateRuleForm, type RuleCatalog, type RuleFormValue, type RuleSnapshot, type ScoringRule } from "@/lib/scoring-rules";
const base = "/api/evaluation/rules";
const message = (error: unknown) => error instanceof Error ? error.message : "操作失败，请稍后重试。";
const actionNames: Record<string, string> = { created: "新建", saved: "保存", published: "发布", activated: "生效", archived: "归档" };
const tabs = [
  { value: "content", label: "评分与交付" },
  { value: "efficiency", label: "阶段效率" },
  { value: "preview", label: "完整文档" },
];
function formOf(rule: RuleSnapshot | ScoringRule): RuleFormValue { return {name:rule.name,changeNote:"changeNote" in rule ? rule.changeNote : "",config:structuredClone(rule.config)}; }
export function ScoringRules() {
  const [catalog,setCatalog] = useState<RuleCatalog | null>(null);
  const [selected,setSelected] = useState<RuleSnapshot | ScoringRule | null>(null);
  const [form,setForm] = useState<RuleFormValue | null>(null);
  const [creating,setCreating] = useState(false);
  const [tab,setTab] = useState("content");
  const [error,setError] = useState(""); const [reloadable,setReloadable] = useState(false);
  const { toasts, push: pushToast, dismiss: dismissToast } = useToasts();
  const [loading,setLoading] = useState(true); const [busy,setBusy] = useState(false);
  const lock = useRef(false); const createKey = useRef("");
  const choose = useCallback((rule: RuleSnapshot | ScoringRule) => { setSelected(rule);setForm(formOf(rule));setCreating(false);setTab("content");setError("");setReloadable(false); },[]);
  const load = useCallback(async (id?: string) => {
    setLoading(true);
    try {
      const data = await requestRules<RuleCatalog>(base);
      if (!Array.isArray(data.items) || !data.active?.config?.weights || !data.template?.config?.weights) throw new Error("规则服务返回格式异常。");
      setCatalog(data); choose(data.items.find(r => r.id === (id || data.active.id)) || data.active); setError("");
    } catch (e) {setError(message(e));setReloadable(true);} finally {setLoading(false);}
  },[choose]);
  useEffect(() => { void load(); },[load]);
  const dirty = !!form && !!selected && (creating || JSON.stringify(form) !== JSON.stringify(formOf(selected)));
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {event.preventDefault();};
    window.addEventListener("beforeunload",warn);return () => window.removeEventListener("beforeunload",warn);
  },[dirty]);
  const editable = !!catalog?.canWrite && (creating || (selected && "status" in selected && selected.status === "draft"));
  function switchTo(id: string) {
    if (!catalog || (dirty && !window.confirm("有未保存的修改，切换版本会放弃这些修改。继续切换？"))) return;
    const record = id === "builtin-v1" ? catalog.template : catalog.items.find(r => r.id === id);
    if (record) choose(record);
  }
  function copy() {
    if (!form || !catalog?.canWrite || busy || creating) return;
    if (dirty && !window.confirm("当前有未保存修改，使用当前内容新建草稿？")) return;
    setForm({...structuredClone(form),name:`${form.name.slice(0,88)} 新版本`,changeNote:""});setCreating(true);setTab("content");createKey.current=createRequestKey();setError("");setReloadable(false);
  }
  async function mutate(action: "save" | "publish" | "activate" | "archive") {
    if (!form || !selected || !catalog?.canWrite || lock.current) return;
    if (action === "save") {const invalid=validateRuleForm(form);if(invalid){setError(invalid);setReloadable(false);return;}}
    if (action === "publish" && !form.changeNote.trim()) {setError("发布前请填写变更说明并保存草稿。");setReloadable(false);return;}
    if (action === "activate" && !window.confirm(`将 ${selected.name} v${selected.version} 用于后续新运行？已经开始的运行及其重新评分继续使用原规则。`)) return;
    if (action === "archive" && !window.confirm("归档后该版本保留历史记录，不能再次设为生效。继续归档？")) return;
    lock.current=true;setBusy(true);setError("");setReloadable(false);
    try {
      const revision = "revision" in selected ? selected.revision : 0;
      const result = creating ? await requestRules<{item:ScoringRule}>(base,form,createKey.current)
        : await requestRules<{item:ScoringRule}>(`${base}/${selected.id}/${action}`,action === "save" ? {...form,revision} : {revision,stateRevision:catalog.stateRevision});
      await load(result.item.id);
      pushToast("success", action === "activate" ? "生效版本已更新，后续新运行将使用本版。" : action === "publish" ? "版本已发布；设为生效后用于新运行。" : action === "archive" ? "版本已归档，历史记录保留。" : "草稿已保存。");
    } catch (e) {setError(message(e));setReloadable(true);} finally {lock.current=false;setBusy(false);}
  }
  function download() {
    if (!form || !selected) return;
    const blob = new Blob([ruleDocument({...selected,...form},{draft:creating || dirty || !!draft})],{type:"text/markdown;charset=utf-8"});
    const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=`评测规则-${creating ? "草稿" : selected.version || "内置"}.md`;a.click();URL.revokeObjectURL(url);
  }
  const draft = !!selected && "status" in selected && selected.status === "draft";
  const published = !!selected && "status" in selected && selected.status === "published";
  const status = creating ? "draft" : selected?.id === "builtin-v1" ? "builtin" : selected && "status" in selected ? selected.status : "builtin";
  const statusLabel = creating ? "草稿" : selected?.id === "builtin-v1" ? "内置模板" : selected && "status" in selected ? stateNames[selected.status] : "";
  const statusTone: StatusTone = creating || status === "draft" ? "warning" : status === "published" ? "success" : "neutral";
  const isActive = !!selected && !!catalog && selected.id === catalog.active.id;
  const showSavebar = !!(catalog?.canWrite && selected && form && (editable || (published && !isActive)));
  const barState = creating ? "新草稿尚未保存" : dirty ? "有未保存的修改" : draft ? "草稿已保存" : "查看已发布版本";
  return <main className="rules-page"><div className={`rules-scroll${showSavebar ? " with-savebar" : ""}`} role="region" aria-label="规则编辑内容" tabIndex={0}>
    <header className="rules-page-head">
      <div><h1>评测规则</h1><p>维护内容、交付体验与阶段效率标准。每次运行保留自己的规则快照。</p></div>
      {catalog?.canWrite && <Button type="button" variant={editable ? "secondary" : "primary"} disabled={busy || loading || creating} onClick={copy}>复制为新草稿</Button>}
    </header>
    {error && <InlineAlert tone="danger" className="rules-feedback" action={reloadable ? <Button type="button" variant="secondary" size="sm" disabled={loading || busy} onClick={() => {if(!dirty || window.confirm("重新读取会放弃当前未保存输入。需要保留时可先复制为新草稿，继续读取？"))void load(selected?.id);}}>重新读取</Button> : undefined}>{error}</InlineAlert>}
    {loading && !catalog ? <EmptyState state="loading" title="正在读取规则…" /> : catalog && selected && form && <>
      <section className="rules-context" aria-label="当前生效规则与版本">
        <div className="rules-context-main">
          <div className="rules-active-line">
            <span className="rules-status-dot" data-state="active" aria-hidden="true" />
            <span className="rules-context-label">当前生效</span>
            <strong>{catalog.active.name}</strong>
            <span className="rules-version-tag">{catalog.active.id === "builtin-v1" ? "内置" : `v${catalog.active.version}`}</span>
          </div>
          <p>发布与生效分开；切换只影响后续新运行，历史答案不会自动重评。</p>
          {catalog.items.length === 0 && catalog.canWrite && <p>还没有自定义版本；复制内置模板为新草稿即可开始维护。</p>}
          {!catalog.canWrite && <p className="rules-readonly-note">{catalog.message || "当前为只读模式；维护需要写权限及规则写入开关。"}</p>}
        </div>
        <div className="rules-context-actions">
          <Select
            block
            label="查看版本"
            value={creating ? "__new-draft__" : selected.id}
            disabled={busy || loading || creating}
            onChange={switchTo}
            options={[
              ...(creating ? [{ value: "__new-draft__", label: "新草稿 · 未保存" }] : []),
              { value: "builtin-v1", label: "内置模板 · 默认评分规则" },
              ...catalog.items.map(r => ({ value: r.id, label: `v${r.version} · ${r.name}` })),
            ]}
          />
          <div className="rules-version-meta">
            <StatusDot tone={statusTone}>{statusLabel}</StatusDot>
            {isActive && !creating && <Badge tone="neutral">生效中</Badge>}
            {dirty && !creating && <Badge tone="warning">未保存修改</Badge>}
            <Button type="button" variant="ghost" size="sm" className="rules-export" onClick={download}>导出 Markdown</Button>
          </div>
        </div>
      </section>
      <Tabs variant="underline" ariaLabel="规则内容" idBase="rules" items={tabs} value={tab} onChange={setTab} />
      <section className="rules-panel" id="rules-panel-content" role="tabpanel" aria-labelledby="rules-tab-content" hidden={tab !== "content"}>
        <ScoringRuleForm value={form} onChange={setForm} tab="content" disabled={!editable || busy || loading} />
      </section>
      <section className="rules-panel" id="rules-panel-efficiency" role="tabpanel" aria-labelledby="rules-tab-efficiency" hidden={tab !== "efficiency"}>
        <ScoringRuleForm value={form} onChange={setForm} tab="efficiency" disabled={!editable || busy || loading} />
      </section>
      <section className="rules-document" id="rules-panel-preview" role="tabpanel" aria-labelledby="rules-tab-preview" hidden={tab !== "preview"}>
        <div className="rules-document-head"><StatusDot tone={statusTone}>{statusLabel}</StatusDot><p>{creating || dirty ? "当前编辑内容预览，尚未发布。" : "由本版结构化配置和说明生成。"}</p></div>
        <article className="rules-document-paper"><div className="run-answer rules-document-body"><AnswerMarkdown content={ruleDocument({...selected,...form},{draft:creating || dirty || !!draft})} /></div></article>
      </section>
      {catalog.events && catalog.events.length > 0 && <details className="rules-audit">
        <summary><span>最近版本操作</span><span className="rules-audit-count">{catalog.events.length} 条</span></summary>
        <ol className="rules-audit-list">{catalog.events.map((e,i) => <li key={i}>
          <time dateTime={e.createdAt}>{new Date(e.createdAt).toLocaleString("zh-CN",{month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"})}</time>
          <span className="rules-audit-action" data-action={e.action}>{actionNames[e.action] || e.action}</span>
          <span className="rules-audit-name">{catalog.items.find(r => r.id === e.ruleId)?.name || e.ruleId}</span>
          <span className="rules-audit-actor">{e.actor}</span>
        </li>)}</ol>
      </details>}
    </>}
  </div>{showSavebar && selected && form && catalog && <div className="rules-savebar" role="group" aria-label="保存与发布操作">
    <div className="rules-savebar-state">
      <StatusDot tone={creating || dirty ? "warning" : "success"}>{barState}</StatusDot>
      <span className="rules-savebar-note">生效版本用于新运行；重新评分沿用该运行的原规则。</span>
    </div>
    <div className="rules-savebar-actions">
      {editable && <>{dirty && <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => {if(window.confirm("放弃未保存修改？"))choose(selected);}}>放弃修改</Button>}{(dirty || creating) && <Button type="button" variant="primary" disabled={busy || loading} onClick={() => void mutate("save")}>{busy ? "处理中…" : "保存草稿"}</Button>}{draft && !creating && <Button type="button" variant={dirty ? "secondary" : "primary"} disabled={busy || dirty || loading} onClick={() => void mutate("publish")}>发布版本</Button>}{!dirty && !creating && <Button type="button" variant="ghost" size="sm" disabled={busy || loading} onClick={() => void mutate("archive")}>归档版本</Button>}</>}
      {published && !isActive && <><Button type="button" variant="primary" disabled={busy || loading} onClick={() => void mutate("activate")}>设为生效</Button><Button type="button" variant="ghost" size="sm" disabled={busy || loading} onClick={() => void mutate("archive")}>归档版本</Button></>}
    </div>
    </div>}
    <ToastStack toasts={toasts} onDismiss={dismissToast} />
  </main>;
}
