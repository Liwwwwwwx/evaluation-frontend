"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnswerMarkdown } from "@/components/answer-markdown";
import { ScoringRuleForm } from "@/components/scoring-rule-form";
import { requestRules, ruleDocument, stateNames, validateRuleForm, type RuleCatalog, type RuleFormValue, type RuleSnapshot, type ScoringRule } from "@/lib/scoring-rules";
const base = "/api/evaluation/rules";
const message = (error: unknown) => error instanceof Error ? error.message : "操作失败，请稍后重试。";
function formOf(rule: RuleSnapshot | ScoringRule): RuleFormValue { return {name:rule.name,changeNote:"changeNote" in rule ? rule.changeNote : "",config:structuredClone(rule.config)}; }
export function ScoringRules() {
  const [catalog,setCatalog] = useState<RuleCatalog | null>(null);
  const [selected,setSelected] = useState<RuleSnapshot | ScoringRule | null>(null);
  const [form,setForm] = useState<RuleFormValue | null>(null);
  const [creating,setCreating] = useState(false);
  const [tab,setTab] = useState("content");
  const [error,setError] = useState(""); const [notice,setNotice] = useState("");
  const [loading,setLoading] = useState(true); const [busy,setBusy] = useState(false);
  const lock = useRef(false); const createKey = useRef("");
  const choose = useCallback((rule: RuleSnapshot | ScoringRule) => { setSelected(rule);setForm(formOf(rule));setCreating(false);setTab("content");setError(""); },[]);
  const load = useCallback(async (id?: string) => {
    setLoading(true);
    try {
      const data = await requestRules<RuleCatalog>(base);
      if (!Array.isArray(data.items) || !data.active?.config?.weights || !data.template?.config?.weights) throw new Error("规则服务返回格式异常。");
      setCatalog(data); choose(data.items.find(r => r.id === (id || data.active.id)) || data.active); setError("");
    } catch (e) {setError(message(e));} finally {setLoading(false);}
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
    setNotice("");
  }
  function copy() {
    if (!form || !catalog?.canWrite || busy) return;
    if (dirty && !window.confirm("当前有未保存修改，使用当前内容新建草稿？")) return;
    setForm({...structuredClone(form),name:`${form.name.slice(0,88)} 新版本`,changeNote:""});setCreating(true);setTab("content");createKey.current=crypto.randomUUID();setNotice("");setError("");
  }
  async function mutate(action: "save" | "publish" | "activate" | "archive") {
    if (!form || !selected || !catalog?.canWrite || lock.current) return;
    if (action === "save") {const invalid=validateRuleForm(form);if(invalid){setError(invalid);return;}}
    if (action === "publish" && !form.changeNote.trim()) {setError("发布前请填写变更说明并保存草稿。");return;}
    if (action === "activate" && !window.confirm(`将 ${selected.name} v${selected.version} 用于后续新运行？已经开始的运行及其重新评分继续使用原规则。`)) return;
    if (action === "archive" && !window.confirm("归档后该版本保留历史记录，不能再次设为生效。继续归档？")) return;
    lock.current=true;setBusy(true);setError("");setNotice("");
    try {
      const revision = "revision" in selected ? selected.revision : 0;
      const result = creating ? await requestRules<{item:ScoringRule}>(base,form,createKey.current)
        : await requestRules<{item:ScoringRule}>(`${base}/${selected.id}/${action}`,action === "save" ? {...form,revision} : {revision,stateRevision:catalog.stateRevision});
      await load(result.item.id);
      setNotice(action === "activate" ? "生效版本已更新，后续新运行将使用本版。" : action === "publish" ? "版本已发布；设为生效后用于新运行。" : action === "archive" ? "版本已归档，历史记录保留。" : "草稿已保存。");
    } catch (e) {setError(message(e));} finally {lock.current=false;setBusy(false);}
  }
  function download() {
    if (!form || !selected) return;
    const blob = new Blob([ruleDocument({...selected,...form},{draft:creating || dirty || !!draft})],{type:"text/markdown;charset=utf-8"});
    const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=`评测规则-${creating ? "草稿" : selected.version || "内置"}.md`;a.click();URL.revokeObjectURL(url);
  }
  const draft = selected && "status" in selected && selected.status === "draft";
  const published = selected && "status" in selected && selected.status === "published";
  const versionLabel = selected?.id === "builtin-v1" ? "内置模板" : selected && "status" in selected ? `v${selected.version} · ${stateNames[selected.status]}` : "";
  const savebar = catalog && selected && form && catalog.canWrite && <div className="rules-savebar">
        {editable && <><button type="button" className={dirty || creating ? "primary-button" : "secondary-button"} disabled={busy || loading || (!dirty && !creating)} onClick={() => void mutate("save")}>{busy ? "处理中…" : "保存草稿"}</button>{draft && !creating && <button type="button" className={!dirty ? "primary-button" : "secondary-button"} disabled={busy || dirty || loading} onClick={() => void mutate("publish")}>发布版本</button>}{dirty && <button type="button" className="text-button" disabled={busy} onClick={() => {if(window.confirm("放弃未保存修改？"))choose(selected);}}>放弃修改</button>}</>}
        {published && !creating && catalog.active.id !== selected.id && <button type="button" className="secondary-button" disabled={busy || loading} onClick={() => void mutate("activate")}>设为生效</button>}
        {"status" in selected && selected.status !== "archived" && selected.id !== catalog.active.id && !creating && <button type="button" className="text-button" disabled={busy || loading || dirty} onClick={() => void mutate("archive")}>归档版本</button>}
        <span className="run-score-note">{editable && dirty ? "保存后才能发布，发布后内容固定。" : "生效版本用于新运行；重新评分沿用该运行的原规则。"}</span>
      </div>;
  return <main className="rules-page"><div className="rules-scroll" role="region" aria-label="规则编辑内容" tabIndex={0}><header className="rules-page-head"><div><h1>评测规则</h1><p>维护内容、交付体验与阶段效率标准。每次运行保留自己的规则快照。</p></div>{catalog?.canWrite && <button type="button" className={editable ? "secondary-button" : "primary-button"} disabled={busy || loading} onClick={copy}>复制为新草稿</button>}</header>
    {error && <div className="rules-feedback" role="alert"><p>{error}</p><button type="button" className="secondary-button" disabled={loading || busy} onClick={() => {if(!dirty || window.confirm("重新读取会放弃当前未保存输入。需要保留时可先复制为新草稿，继续读取？"))void load(selected?.id);}}>重新读取</button></div>}
    {notice && <p className="rules-feedback" role="status">{notice}</p>}
    {loading && !catalog ? <p className="rules-empty">正在读取规则…</p> : catalog && selected && form && <>
      <div className="rules-active"><strong>当前生效：{catalog.active.name} {catalog.active.id === "builtin-v1" ? "· 内置" : `· v${catalog.active.version}`}</strong><p>发布与生效分开；切换只影响后续新运行，历史答案不会自动重评。</p>{!catalog.canWrite && <p>{catalog.message || "当前为只读模式；维护需要写权限及规则写入开关。"}</p>}</div>
      <div className="rules-version-bar"><label>查看版本<select value={selected.id} disabled={busy || loading || creating} onChange={e => switchTo(e.target.value)}><option value="builtin-v1">默认评分规则 · 内置模板</option>{catalog.items.map(r => <option key={r.id} value={r.id}>v{r.version} · {r.name} · {stateNames[r.status]}</option>)}</select></label><span>{creating ? "新草稿 · 未保存" : versionLabel}{dirty && !creating ? " · 有未保存修改" : ""}</span><button type="button" className="text-button" onClick={download}>导出 Markdown</button></div>
      <div className="rules-tabs" role="group" aria-label="规则内容">{[["content","评分与交付"],["efficiency","阶段效率"],["preview","完整文档"]].map(([key,label]) => <button key={key} type="button" aria-pressed={tab === key} onClick={() => setTab(key)}>{label}</button>)}</div>
      {tab === "preview" ? <section className="rules-document"><p className="run-score-note">{creating || dirty ? "当前编辑内容预览，尚未发布。" : "由本版结构化配置和说明生成。"}</p><AnswerMarkdown content={ruleDocument({...selected,...form},{draft:creating || dirty || !!draft})} /></section>
        : <ScoringRuleForm value={form} onChange={setForm} tab={tab} disabled={!editable || busy || loading} />}
      {catalog.events && catalog.events.length > 0 && <details className="rules-audit"><summary>最近版本操作（{catalog.events.length} 条）</summary><ul className="run-list">{catalog.events.map((e,i) => <li key={i}>{new Date(e.createdAt).toLocaleString("zh-CN")} · {{created:"新建",saved:"保存",published:"发布",activated:"生效",archived:"归档"}[e.action] || e.action} · {catalog.items.find(r => r.id === e.ruleId)?.name || e.ruleId} · 操作人 {e.actor}</li>)}</ul></details>}
    </>}
  </div>{savebar}</main>;
}
