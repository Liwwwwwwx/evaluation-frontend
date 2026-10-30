export type DataRecord = Record<string, unknown>;
export type ResultMetric = { key: string; label: string; value: unknown; unit: string; source: string };
export type ResultCandidate = { id: string; numericId: number | null; rank: unknown; formula: string; kind: "alloy" | "crystal" | "process" | "generic"; composition: DataRecord | null; basis: string; metrics: ResultMetric[]; validation: DataRecord | null; converged: unknown; valid: unknown; warning: string; raw: DataRecord; entry: DataRecord };

export function record(value: unknown): DataRecord | null { return value && typeof value === "object" && !Array.isArray(value) ? value as DataRecord : null; }
export function text(value: unknown): string { return typeof value === "string" ? value : typeof value === "number" && Number.isFinite(value) ? String(value) : ""; }
export function records(value: unknown): DataRecord[] { return Array.isArray(value) ? value.map(record).filter((item): item is DataRecord => !!item) : []; }
export function scalar(value: unknown): string {
  if (value === null || value === undefined) return "未提供";
  if (typeof value === "boolean") return value ? "是" : "否";
  if (typeof value === "number") return Number.isFinite(value) ? new Intl.NumberFormat("zh-CN", { maximumSignificantDigits: 8 }).format(value) : "无效数值";
  if (typeof value === "string") return value || "空字符串";
  return Array.isArray(value) ? `${value.length} 项` : `${Object.keys(record(value) || {}).length} 个字段`;
}
export function safeHttpUrl(value: unknown): string {
  try { const url = new URL(text(value)); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : ""; } catch { return ""; }
}

const metricInfo: Record<string, [string, string]> = {
  yield_strength_MPa: ["屈服强度", "MPa"], yield_strength: ["屈服强度", ""], YS_MPa: ["屈服强度", "MPa"],
  uts_MPa: ["抗拉强度", "MPa"], UTS_MPa: ["抗拉强度", "MPa"], uts: ["抗拉强度", ""],
  elongation_pct: ["延伸率", "%"], elongation: ["延伸率", ""], band_gap: ["带隙", "eV"],
  bulk_modulus: ["体积模量", ""], shear_modulus: ["剪切模量", ""], density: ["密度", "g/cm³"],
  energy_above_hull: ["凸包能差", "eV/atom"], formation_energy_per_atom: ["形成能", "eV/atom"],
  laser_power_W: ["激光功率", "W"], scan_speed_mm_s: ["扫描速度", "mm/s"], hatch_spacing_mm: ["扫描间距", "mm"],
  layer_thickness_um: ["层厚", "μm"], ved_J_mm3: ["体积能量密度", "J/mm³"], base_score: ["基础评分", ""],
};
export function metric(key: string, value: unknown): ResultMetric {
  const obj = record(value); const definition = metricInfo[key];
  return { key, label: text(obj?.label) || definition?.[0] || key,
    value: obj ? Object.hasOwn(obj, "value") ? obj.value : Object.hasOwn(obj, "mean") ? obj.mean : null : value,
    unit: text(obj?.unit) || definition?.[1] || "", source: text(obj?.source) || text(obj?.model) || text(obj?.model_version) };
}
export function boolState(value: unknown, yes: string, no: string): string { return value === true ? yes : value === false ? no : "未提供"; }

export const fieldLabels: Record<string, string> = {
  constraints: "生成约束", screening_conditions: "筛选工况", raw_requirement: "原始要求", target_formula: "目标化学式", allowed_elements: "允许元素", excluded_elements: "排除元素", required_elements: "必须包含的元素", allow_open_chemical_space: "允许开放化学空间", target_properties: "目标性质", property_constraints: "性质约束", validation_targets: "评价目标", parameter_sources: "参数来源", notes: "说明", num_atoms: "原子数", formula_units: "化学式单位数", requested_candidate_count: "期望候选数量", seed: "随机种子", generation_mode: "生成模式", material_family: "材料体系",
  test_temperature_C: "试验温度（°C）", processing_category: "处理类别", element_bounds_wt_percent: "元素范围（wt.%）", sampling: "采样统计", generated: "生成数量", feasible: "可行数量", pareto_count: "Pareto候选数量", selected: "入选数量", nearest_count: "近似候选数量", model_domain: "模型领域", model_version: "模型版本", method: "方法", stop_reason: "停止原因",
  requirement_assessment: "要求落实情况", requirement_interpretation: "需求解释", default_assumptions: "默认假设", questions_to_confirm: "待明确条件", requirements: "要求", quote: "原文", verification: "服务核验状态", answer: "答复", status: "服务状态", all_user_requirements_verified: "服务是否核验全部要求", experimentally_verified: "是否有实验核验", evidence_notice: "证据边界", prediction_context: "预测条件", actual_conditions: "实际条件", prediction_screening_policy: "预测筛选策略", output_composition: "输出组成", composition_contract: "组成口径", basis: "计量基准", values: "数值", original_basis: "原始基准", admissible: "适用性", applicability_domain: "适用域", strict_screening: "严格筛选", passed: "通过", constraint_gaps: "约束差距", property_sources: "性质来源", predicted_properties: "预测性能", property_predictions: "性质预测", uncertainty_available: "是否提供不确定度", uncertainty_interval: "不确定区间",
  candidate_id: "候选编号", rank: "排序", score: "服务评分", formula_pretty: "化学式", is_valid: "结构检查有效", space_group: "空间群", validator: "评价器", errors: "错误", metadata: "详细数据", composition_ok: "组成检查", duplicate_of: "与此候选重复", mattersim: "结构优化", relaxation_converged: "结构优化收敛", screening: "筛选状态", reasons: "推荐依据", source: "来源", name: "名称", id: "编号", unit: "单位", value: "数值", mean: "均值", min: "最小值", max: "最大值",
  recommended_route: "建议路线", headline_risks: "主要风险", headline_next: "下一步", decision: "服务建议", validation_level: "验证等级", handoff_target: "交付目标", handoff_to_am: "下游交付", known_risks: "已知风险", pending_validation: "待验证事项", quality_status: "质量状态", handoff_status: "交付状态", selected_candidates: "入选方案", process_route: "工艺路线", step_type: "工序", parameters: "参数", window: "窗口", window_check: "窗口检查", engineering_rule_check: "工程规则检查", candidate_rank: "候选排序", selection_label: "选择说明", ranking_score: "排序分数", ranking_components: "评分构成", derived_features: "派生特征", literature_recipe_proximity: "文献配方相似度", evidence: "证据", transition: "阶段变换数据", visual: "可视化数据", input_count: "输入数量", output_count: "输出数量", title: "标题",
};
export function fieldLabel(key: string): string { return fieldLabels[key] || metricInfo[key]?.[0] || key; }

function uniqueValidation(rows: DataRecord[], id: string): DataRecord | null {
  if (!id) return null; const matched = rows.filter(row => text(row.candidate_id) === id); return matched.length === 1 ? matched[0] : null;
}
export function resultCandidates(result: DataRecord | null, frames: DataRecord[]): ResultCandidate[] {
  const ranked = records(result?.ranked_candidates); const generated = records(record(result?.generation)?.candidates);
  const validationRows = records(result?.validations);
  const process = frames.find(frame => Array.isArray(frame.candidates));
  let entries = ranked.length ? [...ranked] : records(result?.all_candidates).length ? records(result?.all_candidates) : records(result?.candidates).length ? records(result?.candidates) : records(process?.candidates);
  entries = [...entries];
  const candidateId = (row: DataRecord) => text(record(row.candidate)?.candidate_id) || text(row.candidate_id) || text(row.id);
  const existing = new Set(entries.map(candidateId).filter(Boolean));
  for (const candidate of [...records(result?.all_candidates), ...records(result?.candidates), ...generated]) {
    if (entries.some(entry => (record(entry.candidate) || entry) === candidate)) continue;
    const id = candidateId(candidate);
    if (!id || !existing.has(id)) { entries.push({ candidate }); if (id) existing.add(id); }
  }
  const unmatchedValidations = validationRows.filter(validation => !existing.has(text(validation.candidate_id)));
  for (const validation of unmatchedValidations) entries.push({ candidate: { candidate_id: validation.candidate_id, formula_pretty: validation.formula_pretty }, validation });
  return entries.map((entry, index) => {
    const raw = record(entry.candidate) || entry; const explicitId = text(raw.candidate_id) || text(raw.id); const embedded = record(entry.validation);
    const mismatched = embedded && text(embedded.candidate_id) && text(embedded.candidate_id) !== explicitId;
    const validation = mismatched ? uniqueValidation(validationRows, explicitId) : embedded || uniqueValidation(validationRows, explicitId);
    const compositionOutput = record(raw.output_composition); const composition = record(compositionOutput?.values) || record(raw.composition_wt_percent);
    const crystal = !!validation || !!result?.generation || (Array.isArray(result?.ranked_candidates) && !!raw.formula_pretty);
    const kind = crystal ? "crystal" : composition ? "alloy" : Object.hasOwn(raw, "laser_power_W") ? "process" : "generic";
    const properties = record(raw.predicted_properties); const metrics = properties ? Object.entries(properties).map(([key, val]) => metric(key, val)) : [];
    if (crystal) {
      for (const key of ["energy_above_hull", "formation_energy_per_atom", "band_gap", "density"]) if (validation && Object.hasOwn(validation, key)) metrics.push(metric(key, validation[key]));
      for (const [key, value] of Object.entries(record(validation?.property_predictions) || {})) { const found = metrics.findIndex(item => item.key === key); if (found >= 0) metrics[found] = metric(key, value); else metrics.push(metric(key, value)); }
    }
    if (kind === "process") for (const key of ["laser_power_W", "scan_speed_mm_s", "hatch_spacing_mm", "layer_thickness_um", "ved_J_mm3", "base_score"]) if (Object.hasOwn(raw, key)) metrics.push(metric(key, raw[key]));
    return { id: explicitId || `未提供编号 · ${index + 1}`, numericId: typeof raw.id === "number" && Number.isSafeInteger(raw.id) ? raw.id : null,
      rank: entry.rank ?? raw.rank ?? null, formula: text(raw.formula_pretty) || text(validation?.formula_pretty), kind, composition,
      basis: text(compositionOutput?.basis) || (record(raw.composition_wt_percent) ? "wt.%" : ""), metrics, validation,
      converged: record(record(validation?.metadata)?.mattersim)?.relaxation_converged, valid: validation?.is_valid,
      warning: mismatched ? "附带验证记录的编号不一致，未按排序或位置合并。" : validationRows.filter(row => text(row.candidate_id) === explicitId).length > 1 && !embedded ? "存在多条同编号验证记录，未自动合并。" : "", raw, entry };
  });
}

export function compositionSummary(candidate: ResultCandidate): string {
  if (!candidate.composition) return "未提供";
  const values = Object.entries(candidate.composition).filter(([, value]) => value !== 0);
  return values.length ? values.map(([name, value]) => `${name} ${scalar(value)}`).join(" · ") : "各组分均为0";
}
export function materialContext(result: DataRecord | null): DataRecord {
  if (!result) return {};
  const context: DataRecord = {};
  for (const key of ["constraints", "screening_conditions", "sampling", "model_domain", "model_version", "output_composition", "composition_contract", "prediction_screening_policy", "requirement_assessment", "requirement_interpretation", "decision", "recommended_route", "headline_risks", "headline_next", "validation_level", "handoff_to_am"]) if (Object.hasOwn(result, key)) context[key] = result[key];
  return context;
}
