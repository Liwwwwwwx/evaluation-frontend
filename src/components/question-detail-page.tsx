"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ScoreInline } from "@/components/score-inline";
import type { ScoreSummaryValue } from "@/components/score-summary";
import { BackLink, Badge, Button, ConfirmDialog, EmptyState, InlineAlert, Pagination, StatusDot, Tabs, Textarea, ToastStack, tabButtonId, tabPanelId, useToasts, type StatusTone } from "@/components/ui";
import { questionDomains as domains } from "@/lib/question-domains";
import { createRequestKey } from "@/lib/request-key";
import { copyText } from "@/lib/clipboard";
import { isTerminalRun } from "@/lib/run-status";
import { appendFrom, backLabel } from "@/lib/navigation";
import styles from "./question-detail.module.css";

type Question = { id: string; question: string; domainKey?: string | null; serviceKey?: string | null; criteria?: unknown; sourceType: string; datasetVersion: string; createdAt?: string | null; testSet?: string | null; applicableServices?: string[] | null };
type Run = { runId: string; serviceKey: string; origin: string; status: string; scores?: ScoreSummaryValue | null; startedAt?: string | null };
type StandardContent = {
  domain: string;
  taskType: string;
  explicitRequirements: { id: string; requirement: string; critical: boolean; source: string }[];
  evaluationCriteria: { id: string; name: string; category: string; description: string; howToJudge: string; source?: string | null }[];
  missingInformation: string[];
  verification?: { status: string; message: string };
};
type StandardItem = { id: string; state: "unsaved" | "draft" | "confirmed" | "superseded"; content: StandardContent; model?: string | null; createdAt: string; confirmedAt?: string | null };

const serviceNames: Record<string, string> = { "mission-material": "Mission 主服务", literature: "文献检索", "literature-aircraft": "航空文献", alloy: "合金材料", synthesis: "合成制备", "new-material": "新材料" };
const statusNames: Record<string, string> = { queued: "排队中", running: "运行中", scoring: "评分中", done: "已完成", cancelled: "已结束", error: "失败" };
const originNames: Record<string, string> = { manual: "人工", automation: "自动", legacy: "其他" };
const standardStates: Record<string, string> = { unsaved: "未保存", confirmed: "已确认", draft: "草稿", superseded: "历史" };
const categoryNames: Record<string, string> = { required: "题目要求", recommended: "专业建议", needs_verification: "待核验" };
const PAGE_SIZE = 10;
type DetailTab = "question" | "records" | "standards";
const detailTabs = [{ value: "question", label: "题目" }, { value: "records", label: "测评记录" }, { value: "standards", label: "测评标准" }];

function statusTone(status: string): StatusTone {
  if (status === "done") return "success";
  if (status === "error") return "danger";
  if (status === "queued" || status === "running" || status === "scoring") return "info";
  return "neutral";
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}

async function readJson<T>(response: Response): Promise<T> {
  const value = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof value.error === "string" ? value.error : value.error?.message || "请求失败，请稍后重试。");
  return value as T;
}

export function QuestionDetailPage({ questionId, datasetVersion, initialTab = "question", backHref = "/question-bank" }: { questionId: string; datasetVersion: string; initialTab?: DetailTab; backHref?: string }) {
  const router = useRouter();
  const [question, setQuestion] = useState<Question | null>(null);
  const [questionError, setQuestionError] = useState("");
  const [questionRetry, setQuestionRetry] = useState(0);
  const [canManage, setCanManage] = useState(false);
  const [runs, setRuns] = useState<{ items: Run[]; total: number; page: number; pageSize: number } | null>(null);
  const [runsPage, setRunsPage] = useState(1);
  const [runsError, setRunsError] = useState("");
  const [runsRetry, setRunsRetry] = useState(0);
  const [standards, setStandards] = useState<StandardItem[] | null>(null);
  const [standardsError, setStandardsError] = useState("");
  const [standardsRetry, setStandardsRetry] = useState(0);
  const [generatedStandard, setGeneratedStandard] = useState<StandardItem | null>(null);
  const [standardBusy, setStandardBusy] = useState<"generate" | "save" | null>(null);
  const [standardActionError, setStandardActionError] = useState("");
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const [editBusy, setEditBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const { toasts, push: pushToast, dismiss: dismissToast } = useToasts();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [tab, setTab] = useState<DetailTab>(initialTab);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/question-bank/question?id=${encodeURIComponent(questionId)}&datasetVersion=${encodeURIComponent(datasetVersion)}`, { cache: "no-store", signal: controller.signal })
      .then(readJson<{ question: Question }>)
      .then((value) => { setQuestion(value.question); setQuestionError(""); })
      .catch((error) => { if (!controller.signal.aborted) { setQuestion(null); setQuestionError(error instanceof Error ? error.message : "无法读取题目。"); } });
    return () => controller.abort();
  }, [questionId, datasetVersion, questionRetry]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/question-bank/access", { cache: "no-store", signal: controller.signal })
      .then(readJson<{ access?: { permissions?: unknown } }>)
      .then((value) => {
        const permissions = value.access?.permissions;
        setCanManage(Array.isArray(permissions) && permissions.includes("team-services:write"));
      })
      .catch(() => { if (!controller.signal.aborted) setCanManage(false); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({ questionId, datasetVersion, page: String(runsPage), pageSize: String(PAGE_SIZE) });
    setRunsError("");
    fetch(`/api/evaluation/unified/runs?${query}`, { cache: "no-store", signal: controller.signal })
      .then(readJson<{ items: Run[]; total: number; page: number; pageSize: number }>)
      .then((value) => { setRuns(value); if (value.page !== runsPage) setRunsPage(value.page); })
      .catch((error) => { if (!controller.signal.aborted) { setRuns(null); setRunsError(error instanceof Error ? error.message : "无法读取测评记录。"); } });
    return () => controller.abort();
  }, [questionId, datasetVersion, runsPage, runsRetry]);

  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({ questionId, datasetVersion });
    setStandardsError("");
    fetch(`/api/evaluation/question-standards?${query}`, { cache: "no-store", signal: controller.signal })
      .then(readJson<{ items: StandardItem[] }>)
      .then((value) => { setStandards(Array.isArray(value.items) ? value.items : []); })
      .catch((error) => { if (!controller.signal.aborted) { setStandards(null); setStandardsError(error instanceof Error ? error.message : "无法读取测评标准。"); } });
    return () => controller.abort();
  }, [questionId, datasetVersion, standardsRetry]);

  async function copyQuestion() {
    if (!question) return;
    try { await copyText(question.question); setActionError(""); pushToast("success", "题目已复制到剪贴板。"); }
    catch { setActionError("无法访问剪贴板，请手动选择题目复制。"); }
  }

  async function generateStandard() {
    if (!question || standardBusy) return;
    setStandardBusy("generate"); setStandardActionError("");
    try {
      const response = await fetch("/api/evaluation/standards", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": createRequestKey() }, body: JSON.stringify({ question: question.question.trim() }) });
      const result = await readJson<StandardContent & { model?: string | null }>(response);
      if (!Array.isArray(result.explicitRequirements) || !Array.isArray(result.evaluationCriteria) || !Array.isArray(result.missingInformation) || typeof result.verification?.message !== "string") throw new Error("返回结果格式异常，请稍后重试。");
      setGeneratedStandard({ id: "", state: "unsaved", content: result, model: result.model, createdAt: new Date().toISOString() });
      pushToast("success", "标准已生成，保存草稿后可再次查看。");
    } catch (error) { setStandardActionError(error instanceof Error ? error.message : "生成失败，请稍后重试。"); }
    finally { setStandardBusy(null); }
  }

  async function saveStandard() {
    if (!question || !generatedStandard || generatedStandard.state !== "unsaved" || standardBusy) return;
    setStandardBusy("save"); setStandardActionError("");
    try {
      const response = await fetch("/api/evaluation/question-standards", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": createRequestKey() }, body: JSON.stringify({ questionId: question.id, datasetVersion: question.datasetVersion, question: question.question, content: generatedStandard.content, model: generatedStandard.model }) });
      const result = await readJson<{ id: string; state: string }>(response);
      if (typeof result.id !== "string" || !result.id || result.state !== "draft") throw new Error("保存结果格式异常，请刷新列表核实，避免重复保存。");
      const saved: StandardItem = { ...generatedStandard, id: result.id, state: "draft" };
      setStandards((items) => [saved, ...(items || [])]); setGeneratedStandard(saved);
      pushToast("success", "草稿已保存，确认后才会成为当前标准。");
    } catch (error) { setStandardActionError(`${error instanceof Error ? error.message : "保存失败。"} 若连接中断，请刷新页面核实保存结果。`); }
    finally { setStandardBusy(null); }
  }

  async function prepareEvaluation() {
    if (!question) return;
    setActionError("");
    if (sessionStorage.getItem("evaluation-unified-pending")) { setActionError("上次提交结果尚未确认，请先返回测评页面处理。"); return; }
    try {
      const current = sessionStorage.getItem("evaluation-unified-run");
      if (current) {
        const response = await fetch(`/api/evaluation/unified/runs/${encodeURIComponent(current)}`, { cache: "no-store" });
        const run = await readJson<{ status: string }>(response);
        if (!isTerminalRun(run.status)) throw new Error("当前测评尚未结束或状态未知，请先返回查看。");
      }
      sessionStorage.setItem("evaluation-selected-question", JSON.stringify(question));
      sessionStorage.removeItem("evaluation-unified-run");
      router.push("/evaluate");
    } catch (error) { setActionError(error instanceof Error ? error.message : "无法准备测评，请稍后重试。"); }
  }

  async function saveEdit() {
    if (!question || editBusy) return;
    const max = question.serviceKey === "synthesis" ? 200 : 500;
    if (editText.trim().length < 8 || editText.trim().length > max) { setActionError(`题目需要 8–${max} 个字符。`); return; }
    setEditBusy(true); setActionError("");
    try {
      const response = await fetch("/api/question-bank/update", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: question.id, datasetVersion: question.datasetVersion, question: editText.trim() }) });
      const data = await readJson<{ question: Question }>(response);
      setEditing(false);
      pushToast("success", "题目已更新，历史运行保留原版本。");
      if (data.question.datasetVersion !== question.datasetVersion) router.replace(`/question-bank/${encodeURIComponent(data.question.id)}?datasetVersion=${encodeURIComponent(data.question.datasetVersion)}${backHref !== "/question-bank" ? `&from=${encodeURIComponent(backHref)}` : ""}`);
      else setQuestion(data.question);
    } catch (error) { setActionError(error instanceof Error ? error.message : "保存失败，请稍后重试。"); }
    finally { setEditBusy(false); }
  }

  async function deleteQuestion() {
    if (!question || deleting) return;
    setDeleting(true); setDeleteError("");
    try {
      const response = await fetch("/api/question-bank/delete", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: question.id, datasetVersion: question.datasetVersion }) });
      await readJson(response);
      setDeleteOpen(false);
      router.replace(backHref);
    } catch (error) { setDeleteError(error instanceof Error ? error.message : "删除失败，请稍后重试。"); }
    finally { setDeleting(false); }
  }

  if (!question) {
    return <main className={styles.page}>
      {questionError ? <EmptyState state="error" title="无法读取题目" description={questionError} action={<div className={styles.actions}><Button variant="secondary" onClick={() => setQuestionRetry((value) => value + 1)}>重试</Button><Button href="/question-bank" variant="secondary">返回题库</Button></div>} /> : <EmptyState state="loading" title="正在读取题目…" />}
    </main>;
  }

  const savedStandard = standards?.find((item) => item.state === "confirmed") || standards?.find((item) => item.state === "draft") || standards?.[0] || null;
  const currentStandard = generatedStandard || savedStandard;
  const requirements = currentStandard?.content.explicitRequirements || [];
  const criteria = currentStandard?.content.evaluationCriteria || [];
  const missing = currentStandard?.content.missingInformation || [];
  const runsPages = Math.max(1, Math.ceil((runs?.total || 0) / PAGE_SIZE));
  const selfHref = `/question-bank/${encodeURIComponent(question.id)}?datasetVersion=${encodeURIComponent(question.datasetVersion)}${backHref !== "/question-bank" ? `&from=${encodeURIComponent(backHref)}` : ""}`;

  return <main className={styles.page} aria-labelledby="question-detail-title">
    <header className={styles.header}>
      <div>
        <div className={styles.titleRow}><h1 id="question-detail-title">题目详情</h1><Badge tone="info">{question.sourceType === "random" ? "随机题" : "固定题"}</Badge></div>
        <p>{domains[question.domainKey || ""] || "未分类"}{question.serviceKey && <> · 绑定服务 {serviceNames[question.serviceKey] || question.serviceKey}</>}{question.testSet && <> · {question.testSet}</>} · 数据集版本 {question.datasetVersion} · 题目 ID <span className={styles.mono}>{question.id}</span> · 创建 {formatDate(question.createdAt)}</p>
      </div>
      <div className={styles.actions}><BackLink href={backHref}>{backLabel(backHref, "返回题库")}</BackLink></div>
    </header>

      {actionError && <div className={styles.alerts}><InlineAlert tone="danger">{actionError}</InlineAlert></div>}

    <div className={styles.tabsWrap}>
      <Tabs variant="underline" ariaLabel="题目详情" idBase="question-detail" items={detailTabs} value={tab} onChange={(value) => setTab(value as DetailTab)} />
    </div>

    {tab === "question" && <section className={styles.panel} id={tabPanelId("question-detail", "question")} role="tabpanel" aria-labelledby={tabButtonId("question-detail", "question")}>
      <div className={styles.questionToolbar}>
        <span className={styles.eyebrow}>题目原文</span>
        <div className={styles.actions}>
          {!question.criteria && <Button variant="primary" size="sm" onClick={() => void prepareEvaluation()}>使用这道题测评</Button>}
          <Button variant="secondary" size="sm" onClick={copyQuestion}>复制</Button>
          {canManage && <Button variant="secondary" size="sm" onClick={() => { setEditing(true); setEditText(question.question); setActionError(""); }}>编辑</Button>}
          {canManage && <Button variant="danger" size="sm" onClick={() => { setDeleteOpen(true); setDeleteError(""); }}>删除</Button>}
        </div>
      </div>
      {editing ? <div className={styles.editBox}>
        <Textarea label="题目内容" value={editText} onChange={(event) => setEditText(event.target.value)} maxLength={question.serviceKey === "synthesis" ? 200 : 500} disabled={editBusy} />
        <div className={styles.actions}><Button variant="secondary" size="sm" disabled={editBusy} onClick={() => setEditing(false)}>取消</Button><Button variant="primary" size="sm" loading={editBusy} onClick={() => void saveEdit()}>保存修改</Button></div>
      </div> : <p className={styles.questionText}>{question.question}</p>}
      {question.criteria ? <InlineAlert tone="warning">该题带旧版专属评分规则，当前单题测评暂不支持，请选择无专属规则的题目。</InlineAlert> : null}
    </section>}

    {tab === "records" && <section className={styles.panel} id={tabPanelId("question-detail", "records")} role="tabpanel" aria-labelledby={tabButtonId("question-detail", "records")}>
      <div className={styles.panelHead}><div><h2>测评记录</h2><p>该题在当前版本下的最近运行</p></div><span>{runs?.total || 0} 条</span></div>
      {runsError ? <EmptyState compact state="error" title="无法读取测评记录" description={runsError} action={<Button variant="secondary" size="sm" onClick={() => setRunsRetry((value) => value + 1)}>重试</Button>} /> : !runs ? <EmptyState compact state="loading" title="正在读取测评记录…" /> : runs.items.length === 0 ? <EmptyState compact state="empty" title="暂无测评记录" description="从这道题发起一次测评后，记录会显示在这里。" action={!question.criteria ? <Button variant="secondary" size="sm" onClick={() => void prepareEvaluation()}>使用这道题测评</Button> : undefined} /> : <>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>服务</th><th>状态</th><th>评分</th><th>开始时间</th><th><span className="sr-only">操作</span></th></tr></thead>
            <tbody>{runs.items.map((run) => <tr key={run.runId}>
              <td><span className={styles.serviceCell}>{serviceNames[run.serviceKey] || run.serviceKey}</span><span className={styles.subtle}>{originNames[run.origin] || run.origin}</span></td>
              <td><StatusDot tone={statusTone(run.status)}>{statusNames[run.status] || "状态未知"}</StatusDot></td>
              <td><ScoreInline scores={run.scores} /></td>
              <td className={styles.time}>{formatDate(run.startedAt)}</td>
              <td className={styles.rowAction}><Link className={styles.tableLink} href={appendFrom(`/runs/${run.runId}`, `${selfHref}&tab=records`)}>查看</Link></td>
            </tr>)}</tbody>
          </table>
        </div>
        <Pagination page={runs.page || 1} pages={runsPages} total={runs.total} pageSize={PAGE_SIZE} onPageChange={setRunsPage} />
      </>}
    </section>}

    {tab === "standards" && <section className={styles.panel} id={tabPanelId("question-detail", "standards")} role="tabpanel" aria-labelledby={tabButtonId("question-detail", "standards")}>
      <div className={styles.panelHead}>
        <div><h2>测评标准</h2><p>由测评助手生成，供审阅；不会自动用于实际评分。</p></div>
        <div className={styles.actions}>{currentStandard && <Badge tone={currentStandard.state === "confirmed" ? "success" : currentStandard.state === "draft" || currentStandard.state === "unsaved" ? "warning" : "neutral"}>{standardStates[currentStandard.state] || "状态未知"}</Badge>}{generatedStandard && (generatedStandard.state === "unsaved" || savedStandard) && <Button variant="secondary" size="sm" disabled={!!standardBusy} onClick={() => { setGeneratedStandard(null); setStandardActionError(""); }}>{generatedStandard.state === "unsaved" ? "放弃未保存结果" : "查看已保存标准"}</Button>}{generatedStandard?.state === "unsaved" && <Button variant="secondary" size="sm" loading={standardBusy === "save"} disabled={!!standardBusy} onClick={() => void saveStandard()}>保存草稿</Button>}{currentStandard?.state === "draft" && <Button variant="secondary" size="sm" disabled={!!standardBusy} onClick={() => { sessionStorage.setItem("evaluation-standards-selected-question", JSON.stringify({ id: question.id, datasetVersion: question.datasetVersion, question: question.question, domainKey: question.domainKey || null, sourceType: question.sourceType })); router.push(`/standards?returnTo=${encodeURIComponent(`${selfHref}&tab=standards`)}`); }}>去助手确认</Button>}<Button variant="secondary" size="sm" loading={standardBusy === "generate"} disabled={!!standardBusy || !standards || !!standardsError || generatedStandard?.state === "unsaved"} onClick={() => void generateStandard()}>{standardBusy === "generate" ? "正在生成…" : currentStandard ? "重新生成" : "生成测评标准"}</Button></div>
      </div>
      {standardActionError && <InlineAlert tone="danger">{standardActionError}</InlineAlert>}
      {standardBusy === "generate" && <p role="status" className={styles.notice}>正在理解题目并整理检查项，请稍候。</p>}
      {standardsError ? <InlineAlert tone="warning" action={<Button variant="secondary" size="sm" onClick={() => setStandardsRetry((value) => value + 1)}>重试</Button>}>{standardsError}</InlineAlert> : !standards ? <EmptyState compact state="loading" title="正在读取测评标准…" /> : !currentStandard ? <EmptyState compact state="empty" title="暂无测评标准" description="可以为这道题生成一份可审阅的测评标准。" action={<Button variant="secondary" size="sm" loading={standardBusy === "generate"} disabled={!!standardBusy} onClick={() => void generateStandard()}>{standardBusy === "generate" ? "正在生成…" : "生成测评标准"}</Button>} /> : <div className={styles.standard}>
        <div className={styles.standardMeta}><span>{currentStandard.content.domain} · {currentStandard.content.taskType}</span><span>{currentStandard.model || "未记录模型"} · {formatDate(currentStandard.createdAt)}</span></div>
        {currentStandard.content.verification?.message && <p className={styles.notice}>{currentStandard.content.verification.message}</p>}
        <h3>题目明确要求 · {requirements.length}</h3>
        <ol className={styles.standardList}>{requirements.slice(0, 6).map((item) => <li key={item.id}><div className={styles.itemHead}><strong>{item.requirement}</strong>{item.critical && <Badge tone="warning">关键</Badge>}</div><span>题目原文：{item.source}</span></li>)}</ol>
        {requirements.length > 6 && <details><summary>还有 {requirements.length - 6} 条要求</summary><ol className={styles.standardList}>{requirements.slice(6).map((item) => <li key={item.id}><strong>{item.requirement}</strong><span>题目原文：{item.source}</span></li>)}</ol></details>}
        <h3>测评标准 · {criteria.length}</h3>
        <ol className={styles.standardList}>{criteria.slice(0, 6).map((item) => <li key={item.id}><div className={styles.itemHead}><strong>{item.name}</strong><Badge tone="neutral">{categoryNames[item.category] || item.category}</Badge></div><span>{item.description}</span><span>如何判断：{item.howToJudge}</span>{item.source && <span>题目原文：{item.source}</span>}</li>)}</ol>
        {criteria.length > 6 && <details><summary>还有 {criteria.length - 6} 条标准</summary><ol className={styles.standardList}>{criteria.slice(6).map((item) => <li key={item.id}><div className={styles.itemHead}><strong>{item.name}</strong><Badge tone="neutral">{categoryNames[item.category] || item.category}</Badge></div><span>{item.description}</span><span>如何判断：{item.howToJudge}</span></li>)}</ol></details>}
        {missing.length > 0 && <><h3>待补充信息</h3><ul className={styles.standardList}>{missing.map((item, index) => <li key={index}><span>{item}</span></li>)}</ul></>}
      </div>}
    </section>}

    <ConfirmDialog open={deleteOpen} onClose={() => { if (!deleting) setDeleteOpen(false); }} onConfirm={() => void deleteQuestion()} title="删除这道题？" description="删除后题目不再出现在题库，也不再参与评测。" hint="此操作无法通过本页面撤销" danger busy={deleting} confirmLabel={deleting ? "删除中…" : "删除"}>
      <p className={styles.deleteText}>{question.question}</p>
      {deleteError && <InlineAlert tone="danger">{deleteError}</InlineAlert>}
    </ConfirmDialog>
    <ToastStack toasts={toasts} onDismiss={dismissToast} />
  </main>;
}
