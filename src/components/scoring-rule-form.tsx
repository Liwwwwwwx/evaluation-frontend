"use client";
import { dimensionNames, type RuleFormValue, type PhaseRule } from "@/lib/scoring-rules";

export function ScoringRuleForm({ value, onChange, disabled, tab }: { value: RuleFormValue; onChange: (value: RuleFormValue) => void; disabled: boolean; tab: string }) {
  const c = value.config;
  function config(patch: Partial<RuleFormValue["config"]>) { onChange({ ...value,config:{...c,...patch} }); }
  function phase(index: number, patch: Partial<PhaseRule>) { config({efficiencyRules:c.efficiencyRules.map((r,i) => i === index ? {...r,...patch} : r)}); }
  return <fieldset className="rules-fields" disabled={disabled} onWheelCapture={event => {
    // 滚动长表单时先移出数字框焦点，防止滚轮意外修改权重和阈值。
    const active = document.activeElement;
    if (active instanceof HTMLInputElement && active.type === "number" && event.currentTarget.contains(active)) active.blur();
  }}>
    {tab === "content" && <>
      <section className="rules-section"><h2>基本信息</h2><div className="rules-form-grid">
        <label>规则名称<input value={value.name} maxLength={100} onChange={e => onChange({...value,name:e.target.value})} /></label>
        <label>内容合格线<input type="number" min={0} max={100} step={0.1} value={Number.isFinite(c.passScore) ? c.passScore : ""} onChange={e => config({passScore:e.target.value === "" ? NaN : Number(e.target.value)})} /></label>
      </div><label>变更说明<textarea value={value.changeNote} maxLength={1000} rows={2} placeholder="说明本版调整了什么，发布前需填写。" onChange={e => onChange({...value,changeNote:e.target.value})} /></label></section>
      <section className="rules-section"><h2>内容评分</h2><p className="run-score-note">两家评委分别评分。权重合计100%；图文不适用时，其余维度按比例归一化。</p><div className="rules-weight-grid">{Object.entries(dimensionNames).map(([key,label]) => <label key={key}>{label}（%）<input type="number" min={0} max={100} step={1} value={Number.isFinite(c.weights[key as keyof typeof dimensionNames]) ? c.weights[key as keyof typeof dimensionNames] : ""} onChange={e => config({weights:{...c.weights,[key]:e.target.value === "" ? NaN : Number(e.target.value)}})} /></label>)}</div><label>内容评分说明<textarea rows={4} maxLength={6000} value={c.contentInstructions} onChange={e => config({contentInstructions:e.target.value})} /></label></section>
      <section className="rules-section"><h2>任务交付</h2><p className="run-score-note">核验实际成果，区分准备说明与最终交付；缺少证据时显示无法判断。</p><label>任务交付说明<textarea rows={5} maxLength={6000} value={c.completionInstructions} onChange={e => config({completionInstructions:e.target.value})} /></label></section>
      <section className="rules-section"><h2>交付体验</h2><p className="run-score-note">结合用户任务评价无关实现细节、准备替代交付、完成声明及重复准备。技术排障任务允许相关技术说明。</p><label>交付体验说明<textarea rows={6} maxLength={6000} value={c.experienceInstructions} onChange={e => config({experienceInstructions:e.target.value})} /></label></section>
      <section className="rules-section"><h2>Markdown 机检</h2><label className="rules-checkbox"><input type="checkbox" checked={c.markdownGate} onChange={e => config({markdownGate:e.target.checked})} />将原文机检错误纳入内容合格门槛</label><p className="run-score-note">检查项由程序实现。说明文字可以维护，新增检测算法需开发。</p></section>
    </>}
    {tab === "efficiency" && <section className="rules-section"><h2>阶段效率阈值</h2><p className="run-score-note">使用明确的阶段起止或运行中事件计时。总耗时不能替代团队查询耗时；缺少证据时显示无法评估。阈值需根据实际样本校准。</p><datalist id="rule-service-keys">{["*","literature","literature-aircraft","alloy","synthesis","new-material","mission-material"].map(key => <option key={key} value={key} />)}</datalist>
      {c.efficiencyRules.length === 0 && <p className="rules-empty">当前没有阶段阈值，过程耗时仍会保留。</p>}
      {c.efficiencyRules.map((r,index) => <div className="rules-phase" key={index}><div className="rules-phase-head"><h3>阶段 {index+1}</h3>{!disabled && <button type="button" className="text-button" onClick={() => config({efficiencyRules:c.efficiencyRules.filter((_,i) => i !== index)})}>移除此项</button>}</div><div className="rules-form-grid">
        <label>阶段名称<input maxLength={80} value={r.label} onChange={e => phase(index,{label:e.target.value})} /></label>
        <label>服务标识<input list="rule-service-keys" value={r.serviceKey} onChange={e => phase(index,{serviceKey:e.target.value})} /><span className="run-score-note">* 表示所有服务，具体服务配置优先。</span></label>
        <label>阶段标识<input value={r.phaseKey} placeholder="例如 team-discovery" onChange={e => phase(index,{phaseKey:e.target.value})} /><span className="run-score-note">须与实际采集的阶段标识一致；配置名称不代表服务已接入。</span></label>
        <label>提醒阈值（秒）<input type="number" min={1} max={86400} value={Number.isFinite(r.warningSeconds) ? r.warningSeconds : ""} onChange={e => phase(index,{warningSeconds:e.target.value === "" ? NaN : Number(e.target.value)})} /></label>
        <label>严重阈值（秒）<input type="number" min={2} max={86400} value={Number.isFinite(r.criticalSeconds) ? r.criticalSeconds : ""} onChange={e => phase(index,{criticalSeconds:e.target.value === "" ? NaN : Number(e.target.value)})} /></label>
      </div></div>)}
      {!disabled && <button type="button" className="secondary-button" disabled={c.efficiencyRules.length >= 20} onClick={() => config({efficiencyRules:[...c.efficiencyRules,{serviceKey:"*",phaseKey:"new-stage",label:"新阶段",warningSeconds:60,criticalSeconds:180}]})}>添加阶段阈值</button>}
    </section>}
  </fieldset>;
}
