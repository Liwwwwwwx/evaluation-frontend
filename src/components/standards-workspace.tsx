"use client";

import { useState } from "react";
import { ScoringRules } from "@/components/scoring-rules";
import { StandardsAssistant } from "@/components/standards-assistant";
import { Tabs, tabButtonId, tabPanelId } from "@/components/ui";
import styles from "./standards-workspace.module.css";

const items = [{ value: "generate", label: "生成标准" }, { value: "rules", label: "通用规则" }];
export function StandardsWorkspace({ initialTab }: { initialTab: "generate" | "rules" }) {
  const [tab, setTab] = useState(initialTab);
  const [visited, setVisited] = useState({ generate: initialTab === "generate", rules: initialTab === "rules" });
  function changeTab(value: string) {
    if (value !== "generate" && value !== "rules") return;
    setVisited(current => ({ ...current, [value]: true }));
    setTab(value);
  }
  return <div className={styles.workspace}>
    <div className={styles.navigation}><Tabs items={items} value={tab} onChange={changeTab} ariaLabel="评判标准" idBase="standards-workspace" /></div>
    <section id={tabPanelId("standards-workspace", "generate")} role="tabpanel" aria-labelledby={tabButtonId("standards-workspace", "generate")} hidden={tab !== "generate"} className={styles.panel}>
      {visited.generate && <StandardsAssistant />}
    </section>
    <section id={tabPanelId("standards-workspace", "rules")} role="tabpanel" aria-labelledby={tabButtonId("standards-workspace", "rules")} hidden={tab !== "rules"} className={styles.panel}>
      {visited.rules && <ScoringRules />}
    </section>
  </div>;
}
