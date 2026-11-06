"use client";

import { useRef, useState } from "react";
import { StandardsAssistant, type StandardsAssistantHandle } from "@/components/standards-assistant";
import { DirectScore, type DirectScoreHandle, type StandardContent } from "@/components/direct-score";
import { BackLink, Tabs, tabButtonId, tabPanelId } from "@/components/ui";
import styles from "./standards-workspace.module.css";

const items = [{ value: "generate", label: "生成标准" }, { value: "direct", label: "回答评分" }];
export function StandardsWorkspace({ returnTo }: { returnTo?: string }) {
  const [tab, setTab] = useState<"generate" | "direct">("generate");
  const assistant = useRef<StandardsAssistantHandle>(null);
  const direct = useRef<DirectScoreHandle>(null);
  function useForScore(question: string, standard: StandardContent) {
    const error = direct.current?.useStandard(question, standard);
    if (error) return error;
    setTab("direct");
    return "";
  }
  return <div className={styles.workspace}>
    <header className={styles.top}>
      {returnTo && <BackLink href={returnTo} onClick={event => {
        if ((assistant.current?.hasWork() || direct.current?.hasWork()) && !window.confirm("返回后，助手中未保存的内容和评分结果将丢失。确定返回？")) event.preventDefault();
      }}>{returnTo.startsWith("/question-bank/") ? "返回题目详情" : "返回题库"}</BackLink>}
      <div className={styles.hero}>
        <div><h1>测评助手</h1><p>生成可审阅的题目标准，或对已有回答做独立评分。</p></div>
      </div>
      <div className={styles.tabsRow}>
        <Tabs variant="underline" items={items} value={tab} onChange={value => { if (value === "generate" || value === "direct") setTab(value); }} ariaLabel="测评助手" idBase="standards-workspace" />
      </div>
    </header>
    <section id={tabPanelId("standards-workspace", "generate")} role="tabpanel" aria-labelledby={tabButtonId("standards-workspace", "generate")} hidden={tab !== "generate"} className={styles.panel}>
      <StandardsAssistant ref={assistant} onUseForScore={useForScore} />
    </section>
    <section id={tabPanelId("standards-workspace", "direct")} role="tabpanel" aria-labelledby={tabButtonId("standards-workspace", "direct")} hidden={tab !== "direct"} className={styles.panel}>
      <DirectScore ref={direct} />
    </section>
  </div>;
}
