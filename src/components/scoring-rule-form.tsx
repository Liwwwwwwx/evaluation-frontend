"use client";
import { dimensionNames, type RuleFormValue, type PhaseRule } from "@/lib/scoring-rules";

const clamp = (value: number) => Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;

function PlusIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>;
}

export function ScoringRuleForm({ value, onChange, disabled, tab }: { value: RuleFormValue; onChange: (value: RuleFormValue) => void; disabled: boolean; tab: string }) {
  const c = value.config;
  const total = Object.values(c.weights).reduce((sum, item) => sum + (Number.isFinite(item) ? item : 0), 0);
  const passPercent = Number.isFinite(c.passScore) ? Math.max(0, Math.min(100, c.passScore)) : 0;
  function config(patch: Partial<RuleFormValue["config"]>) { onChange({ ...value,config:{...c,...patch} }); }
  function phase(index: number, patch: Partial<PhaseRule>) { config({efficiencyRules:c.efficiencyRules.map((r,i) => i === index ? {...r,...patch} : r)}); }
  return <fieldset className="rules-fields" disabled={disabled} onWheelCapture={event => {
    // 滚动长表单时先移出数字框焦点，防止滚轮意外修改权重和阈值。
    const active = document.activeElement;
    if (active instanceof HTMLInputElement && active.type === "number" && event.currentTarget.contains(active)) active.blur();
  }}>
    {tab === "content" && <>
      <section className="rules-section" aria-labelledby="rules-basic-heading">
        <header className="rules-section-head">
          <div><h2 id="rules-basic-heading">基本信息</h2><p>用于识别版本，并判断内容是否达到合格线。</p></div>
        </header>
        <div className="rules-field-grid rules-field-grid-basic">
          <label className="rules-field">规则名称<input value={value.name} maxLength={100} placeholder="例如：科学服务评测规则" onChange={e => onChange({...value,name:e.target.value})} /></label>
          <label className="rules-field">
            <span className="rules-field-label">内容合格线</span>
            <span className="rules-unit-input"><input aria-label="内容合格线" type="number" min={0} max={100} step={0.1} value={Number.isFinite(c.passScore) ? c.passScore : ""} onChange={e => config({passScore:e.target.value === "" ? NaN : Number(e.target.value)})} /><span aria-hidden="true">分</span></span>
            <span className="rules-pass-track" aria-hidden="true"><span style={{ left: `${passPercent}%` }} /></span>
            <span className="rules-field-hint">0–100，低于合格线记为未通过</span>
          </label>
        </div>
        <label className="rules-field">
          <span className="rules-field-label">变更说明<span className="rules-field-count">{value.changeNote.length} / 1000</span></span>
          <textarea rows={2} value={value.changeNote} maxLength={1000} placeholder="说明本版调整了什么，发布前需填写。" onChange={e => onChange({...value,changeNote:e.target.value})} />
        </label>
      </section>

      <section className="rules-section" aria-labelledby="rules-content-heading">
        <header className="rules-section-head">
          <div><h2 id="rules-content-heading">内容评分</h2><p>两家评委分别评分。权重合计 100%；图文不适用时，其余维度按比例归一化。</p></div>
          <span className={`rules-total${total === 100 ? " ok" : " bad"}`}>{total === 100 ? "合计 100%" : `合计 ${Number.isFinite(total) ? total : 0}%`}</span>
        </header>
        <div className="rules-weight-grid">
          {Object.entries(dimensionNames).map(([key,label]) => {
            const weight = c.weights[key as keyof typeof dimensionNames];
            return <label className="rules-weight" key={key}>
              <span className="rules-weight-label">{label}</span>
              <span className="rules-weight-field"><input aria-label={`${label}权重（%）`} inputMode="numeric" type="number" min={0} max={100} step={1} value={Number.isFinite(weight) ? weight : ""} onChange={e => config({weights:{...c.weights,[key]:e.target.value === "" ? NaN : Number(e.target.value)}})} /><span aria-hidden="true">%</span></span>
              <span className="rules-weight-track" aria-hidden="true"><span style={{ width: `${clamp(weight)}%` }} /></span>
            </label>;
          })}
        </div>
        <label className="rules-field">
          <span className="rules-field-label">内容评分说明<span className="rules-field-count">{c.contentInstructions.length} / 6000</span></span>
          <textarea rows={4} maxLength={6000} value={c.contentInstructions} onChange={e => config({contentInstructions:e.target.value})} />
        </label>
      </section>

      <section className="rules-section" aria-labelledby="rules-delivery-heading">
        <header className="rules-section-head">
          <div><h2 id="rules-delivery-heading">任务交付与体验</h2><p>核验实际成果，并把准备说明、完成声明与最终交付分开判断。</p></div>
        </header>
        <div className="rules-subfield">
          <div className="rules-subfield-head"><h3>任务交付说明</h3><span className="rules-field-count">{c.completionInstructions.length} / 6000</span></div>
          <p className="rules-field-hint">缺少文件内容或其他证据时显示无法判断；不以中间进展替代最终交付。</p>
          <textarea rows={5} maxLength={6000} value={c.completionInstructions} onChange={e => config({completionInstructions:e.target.value})} />
        </div>
        <div className="rules-subfield">
          <div className="rules-subfield-head"><h3>交付体验说明</h3><span className="rules-field-count">{c.experienceInstructions.length} / 6000</span></div>
          <p className="rules-field-hint">技术排障任务允许相关技术说明；引用原文并说明上下文，不只匹配关键词。</p>
          <textarea rows={6} maxLength={6000} value={c.experienceInstructions} onChange={e => config({experienceInstructions:e.target.value})} />
        </div>
      </section>

      <section className="rules-section" aria-labelledby="rules-markdown-heading">
        <header className="rules-section-head">
          <div><h2 id="rules-markdown-heading">Markdown 机检</h2><p>检查项由程序实现。说明文字可以维护，新增检测算法仍需开发。</p></div>
        </header>
        <label className="rules-toggle">
          <span className="rules-toggle-text"><strong>将原文机检错误纳入内容合格门槛</strong><span>关闭时只独立展示机检结果，不影响内容合格判断。</span></span>
          <input type="checkbox" checked={c.markdownGate} onChange={e => config({markdownGate:e.target.checked})} />
          <span className="rules-switch" aria-hidden="true"><span /></span>
        </label>
      </section>
    </>}
    {tab === "efficiency" && <section className="rules-section" aria-labelledby="rules-efficiency-heading">
      <header className="rules-section-head">
        <div><h2 id="rules-efficiency-heading">阶段效率阈值</h2><p>使用明确的阶段起止或运行中事件计时。总耗时不能替代团队查询耗时；缺少证据时显示无法评估。</p></div>
        {!disabled && <span className="rules-total">{c.efficiencyRules.length} / 20 项</span>}
      </header>
      <datalist id="rule-service-keys">{["*","literature","literature-aircraft","alloy","synthesis","new-material","mission-material"].map(key => <option key={key} value={key} />)}</datalist>
      {c.efficiencyRules.length === 0 ? <div className="rules-empty-card">
        <p>当前没有阶段阈值。过程耗时仍会保留，但不会判定阶段超时。</p>
        {!disabled && <button type="button" className="secondary-button" onClick={() => config({efficiencyRules:[{serviceKey:"*",phaseKey:"new-stage",label:"新阶段",warningSeconds:60,criticalSeconds:180}]})}>添加阶段阈值</button>}
      </div> : <div className="rules-phase-list">
        {c.efficiencyRules.map((r,index) => {
          const ratio = Number.isFinite(r.warningSeconds) && Number.isFinite(r.criticalSeconds) && r.criticalSeconds > 0 ? Math.min(100, Math.max(0, r.warningSeconds / r.criticalSeconds * 100)) : null;
          return <article className="rules-phase" key={index}>
            <header className="rules-phase-head">
              <div className="rules-phase-title"><span className="rules-phase-index">阶段 {index + 1}</span><h3>{r.label.trim() || "未命名阶段"}</h3></div>
              {!disabled && <button type="button" className="rules-text-button" onClick={() => config({efficiencyRules:c.efficiencyRules.filter((_,i) => i !== index)})}>移除此项</button>}
            </header>
            <div className="rules-phase-grid">
              <label className="rules-field">阶段名称<input maxLength={80} value={r.label} placeholder="例如：团队查询" onChange={e => phase(index,{label:e.target.value})} /></label>
              <label className="rules-field">服务标识<input list="rule-service-keys" value={r.serviceKey} onChange={e => phase(index,{serviceKey:e.target.value})} /><span className="rules-field-hint">* 表示所有服务，具体服务配置优先。</span></label>
              <label className="rules-field">阶段标识<input value={r.phaseKey} placeholder="例如 team-discovery" onChange={e => phase(index,{phaseKey:e.target.value})} /><span className="rules-field-hint">须与实际采集的阶段标识一致；配置名称不代表服务已接入。</span></label>
              <div className="rules-field rules-threshold-fields" role="group" aria-label={`阶段 ${index + 1} 阈值`}>
                <span className="rules-field-label">阈值</span>
                <div className="rules-threshold-row">
                  <label>提醒<span className="rules-unit-input"><input aria-label={`阶段 ${index + 1} 提醒阈值（秒）`} type="number" min={1} max={86400} value={Number.isFinite(r.warningSeconds) ? r.warningSeconds : ""} onChange={e => phase(index,{warningSeconds:e.target.value === "" ? NaN : Number(e.target.value)})} /><span aria-hidden="true">秒</span></span></label>
                  <span className="rules-threshold-arrow" aria-hidden="true">→</span>
                  <label>严重<span className="rules-unit-input"><input aria-label={`阶段 ${index + 1} 严重阈值（秒）`} type="number" min={2} max={86400} value={Number.isFinite(r.criticalSeconds) ? r.criticalSeconds : ""} onChange={e => phase(index,{criticalSeconds:e.target.value === "" ? NaN : Number(e.target.value)})} /><span aria-hidden="true">秒</span></span></label>
                </div>
                {ratio !== null && <><span className="rules-threshold-track" aria-hidden="true"><span className="rules-threshold-warning" style={{ left: `${ratio}%` }} /></span><span className="rules-threshold-caption">{r.warningSeconds} 秒提醒 · {r.criticalSeconds} 秒严重</span></>}
              </div>
            </div>
          </article>;
        })}
      </div>}
      {!disabled && c.efficiencyRules.length > 0 && c.efficiencyRules.length < 20 && <button type="button" className="rules-add-phase" onClick={() => config({efficiencyRules:[...c.efficiencyRules,{serviceKey:"*",phaseKey:"new-stage",label:"新阶段",warningSeconds:60,criticalSeconds:180}]})}><PlusIcon />添加阶段阈值</button>}
      {!disabled && c.efficiencyRules.length >= 20 && <p className="rules-field-hint">最多配置 20 项阶段阈值。</p>}
    </section>}
  </fieldset>;
}
