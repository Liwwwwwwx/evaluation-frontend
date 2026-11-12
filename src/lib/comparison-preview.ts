export type ComparisonRequirement = {
  id: string;
  requirement: string;
  status: string;
  critical?: boolean;
  note?: string;
  evidence?: string;
};

export type ComparisonJudge = {
  status: "ready" | "pending" | "failed" | "unavailable" | "absent";
  model: string;
  quality: {
    version: "evaluation-v1";
    total: number;
    source?: { truncated?: boolean; imageCoverage?: { found: number; sent: number; overflow?: boolean; external?: number } };
    dimensions: Record<string, { label: string; score: number; weight: number; applicable?: boolean; note?: string }>;
    taskCompletion?: { status: string; reason?: string; requirements?: ComparisonRequirement[] };
    qualification?: { status: string; passScore?: number };
    gaps?: string[];
    suggestions?: string[];
    comment: string;
  } | null;
  error?: string | null;
};

export type ComparisonRun = {
  runId: string;
  serviceKey: string;
  serviceLabel: string;
  executionStatus: string;
  scoringStatus: string;
  answer: string;
  answerTruncated?: boolean;
  elapsedMs: number | null;
  scores: { deepSeekScore: ComparisonJudge; qwenScore: ComparisonJudge };
  run?: unknown;
  startedAt?: string | null;
  scoreError?: string | null;
  error?: string | null;
};

export type Comparison = {
  groupId: string;
  question: string;
  rule: { name: string; version: number };
  createdAt: string;
  runs: ComparisonRun[];
};

function judge(total: number, gaps: string[], suggestions: string[], comment: string, dimensions: Record<string, { label: string; score: number; weight: number; note?: string }>, task: string, qualification: string, model: string, requirements: ComparisonRequirement[]): ComparisonJudge {
  return {
    status: "ready",
    model,
    quality: {
      version: "evaluation-v1",
      total,
      dimensions,
      taskCompletion: { status: task, requirements },
      qualification: { status: qualification, passScore: 60 },
      gaps,
      suggestions,
      comment,
    },
  };
}

function req(id: string, requirement: string, status: string, note: string): ComparisonRequirement {
  return { id, requirement, status, critical: true, note };
}

const missionDeepSeek = judge(
  84,
  [
    "屈服强度与抗拉强度均给出区间，但未说明测试标准或数据来源。",
    "Co20Cr20Fe20Ni40 在 900°C 的相稳定性依据较薄，缺少相图或文献支撑。",
  ],
  [
    "补充所采用的本构模型、外推区间与误差范围。",
    "引用同类高熵合金的高温拉伸数据，说明与预测值的偏差。",
  ],
  "回答覆盖了成分、温度和目标性能，给出了可用估算与工程取舍，但证据链仍偏经验。",
  { readability: { label: "可读性", score: 88, weight: 0.4 }, professionalism: { label: "专业性", score: 83, weight: 0.4, note: "公式与单位基本完整，缺少数据来源。" }, visualAids: { label: "图文辅助", score: 78, weight: 0.2, note: "使用表格对比温度区间，未提供相图。" } },
  "completed",
  "qualified",
  "deepseek-chat",
  [
    req("R1", "给出屈服强度与抗拉强度的数值和单位", "met", "给出了 210–260 MPa 和 320–380 MPa，单位完整。"),
    req("R2", "说明预测依据与适用条件", "met", "给出了温度外推和固溶强化依据，并说明适用条件。"),
    req("R3", "说明数据来源或验证情况", "partial", "引用同类合金数据，但未给出测试标准。"),
    req("R4", "覆盖 900°C 的相稳定性", "missing", "未展开相稳定性判断。"),
    req("R5", "结论明确并区分估算与实验值", "met", "明确标注为工程估算，未冒充实验值。"),
  ],
);

const missionQwen = judge(
  82,
  [
    "关键性能值以区间给出，未说明置信度或适用边界。",
    "对 Cr、Ni 元素在高温氧化中的作用解释不足。",
  ],
  [
    "补充预测方法及与实验数据的对照。",
    "明确结论的适用温度与应力区间。",
  ],
  "回答结构清晰，能回答题目核心问题；对依据的展开还可以更具体。",
  { readability: { label: "可读性", score: 86, weight: 0.4 }, professionalism: { label: "专业性", score: 80, weight: 0.4, note: "专业术语使用准确，依据偏概括。" }, visualAids: { label: "图文辅助", score: 82, weight: 0.2, note: "表格有助于理解，但缺少图例说明。" } },
  "completed",
  "qualified",
  "qwen3.7-flash",
  [
    req("R1", "给出屈服强度与抗拉强度的数值和单位", "met", "数值与单位完整。"),
    req("R2", "说明预测依据与适用条件", "partial", "依据偏概括，适用边界不够明确。"),
    req("R3", "说明数据来源或验证情况", "missing", "未说明数据来源或实验对照。"),
    req("R4", "覆盖 900°C 的相稳定性", "partial", "提到高温软化，但未给相稳定性依据。"),
    req("R5", "结论明确并区分估算与实验值", "met", "结论明确，标注为估算。"),
  ],
);

const alphaDeepSeek = judge(
  78,
  [
    "输出包含较多过程性描述，直接结论不够突出。",
    "未给出屈服强度与抗拉强度的明确数值区间，只有定性判断。",
  ],
  [
    "把最终性能预测放到回答前半部分，并附单位和适用条件。",
    "补充与同类合金的横向对比。",
  ],
  "回答覆盖了材料背景和计算过程，但对题目要求的两个性能指标回答不够直接。",
  { readability: { label: "可读性", score: 82, weight: 0.4 }, professionalism: { label: "专业性", score: 76, weight: 0.4, note: "计算假设说明不足，结论缺少数值支撑。" }, visualAids: { label: "图文辅助", score: 74, weight: 0.2, note: "没有使用表格或图辅助说明。" } },
  "partial",
  "qualified",
  "deepseek-chat",
  [
    req("R1", "给出屈服强度与抗拉强度的数值和单位", "partial", "只给了定性区间，缺少明确数值。"),
    req("R2", "说明预测依据与适用条件", "met", "推理过程完整，说明了适用条件。"),
    req("R3", "说明数据来源或验证情况", "partial", "引用趋势，但未给实验数据。"),
    req("R4", "覆盖 900°C 的相稳定性", "met", "讨论了高温相稳定性和氧化影响。"),
    req("R5", "结论明确并区分估算与实验值", "partial", "结论分散，估算属性说明不足。"),
  ],
);

const alphaQwen = judge(
  80,
  [
    "回答较长，关键结论分散在多个段落。",
    "未明确给出 900°C 下的强度预测值。",
  ],
  [
    "在开头给出结论摘要，再展开计算依据。",
    "补充误差范围和适用条件。",
  ],
  "内容较完整，术语使用正确；但题目要求的定量结果没有直接给出。",
  { readability: { label: "可读性", score: 80, weight: 0.4 }, professionalism: { label: "专业性", score: 79, weight: 0.4, note: "材料机理说明充分，量化不足。" }, visualAids: { label: "图文辅助", score: 82, weight: 0.2, note: "使用了分点说明，便于阅读。" } },
  "partial",
  "qualified",
  "qwen3.7-flash",
  [
    req("R1", "给出屈服强度与抗拉强度的数值和单位", "partial", "数值不够直接。"),
    req("R2", "说明预测依据与适用条件", "met", "依据和条件说明充分。"),
    req("R3", "说明数据来源或验证情况", "partial", "有文献趋势，但没有逐项对照。"),
    req("R4", "覆盖 900°C 的相稳定性", "partial", "提到相稳定性，但依据一般。"),
    req("R5", "结论明确并区分估算与实验值", "partial", "结论较分散。"),
  ],
);

export const previewComparison: Comparison = {
  groupId: "preview-compare-0001",
  question: "预测 Co20Cr20Fe20Ni40（at%）在 900°C 的屈服强度与抗拉强度，给出单位和适用条件，并说明预测依据。",
  rule: { name: "默认评分规则", version: 0 },
  createdAt: "2026-11-04T10:20:00+08:00",
  runs: [
    {
      runId: "preview-alloy-run",
      serviceKey: "alloy",
      serviceLabel: "合金材料",
      executionStatus: "succeeded",
      scoringStatus: "ready",
      elapsedMs: 431000,
      answer: [
        "## 结论",
        "",
        "在 900°C、无外加应力且组织接近均匀的条件下，Co20Cr20Fe20Ni40 的屈服强度估计为 **210–260 MPa**，抗拉强度估计为 **320–380 MPa**。该区间适用于短时拉伸测试，不适用于长期蠕变或氧化严重工况。",
        "",
        "## 预测依据",
        "",
        "- 该成分为单相 FCC 高熵合金，Co、Cr、Fe、Ni 的原子半径接近，固溶强化贡献有限。",
        "- 900°C 已接近再结晶温度，晶界滑移和扩散主导变形，强度随温度明显下降。",
        "- 参考同族 CoCrFeNi 系合金在 800–1000°C 的拉伸数据，按温度外推并结合固溶原子尺寸差修正。",
        "",
        "| 温度 | 屈服强度估计 | 抗拉强度估计 | 主要限制 |",
        "| --- | --- | --- | --- |",
        "| 800°C | 260–310 MPa | 380–440 MPa | 晶粒长大 |",
        "| 900°C | 210–260 MPa | 320–380 MPa | 氧化与晶界滑移 |",
        "| 1000°C | 150–200 MPa | 240–300 MPa | 相稳定性下降 |",
        "",
        "## 适用条件",
        "",
        "上述为工程估算，未做实验验证；实际值受晶粒度、氧分压、加载速率和热处理历史影响。若用于设计，应补充同批次材料的 900°C 拉伸试验。",
      ].join("\n"),
      scores: { deepSeekScore: missionDeepSeek, qwenScore: missionQwen },
    },
    {
      runId: "preview-alpha-rsi-run",
      serviceKey: "alpha-rsi",
      serviceLabel: "ALPHA 材料 RSI · 1110",
      executionStatus: "succeeded",
      scoringStatus: "ready",
      elapsedMs: 448000,
      answer: [
        "## 材料与分析范围",
        "",
        "Co20Cr20Fe20Ni40 为等原子比附近的 FCC 高熵合金。900°C 下，合金处于高温软化和氧化敏感区间，强度主要受晶粒尺寸、固溶原子和晶界状态影响。",
        "",
        "## 推理过程",
        "",
        "1. 根据混合法则估算合金的弹性模量与熔点，判断 900°C 约为同系合金熔点的 0.55–0.6。",
        "2. 采用 Hall–Petch 关系估算晶界强化贡献，假设晶粒尺寸为 50–100 μm。",
        "3. 结合 CoCrFeNi 系合金的高温拉伸趋势，按温度对屈服强度进行外推。",
        "",
        "该成分在高温下没有明显的第二相强化，因此强度不会出现显著峰值；Cr 的加入主要改善抗氧化性，对强度的直接贡献有限。",
        "",
        "## 需要补充的条件",
        "",
        "题目未给出晶粒度、氧分压和加载速率。若晶粒粗化到 200 μm 以上，或在氧化气氛中长时间保温，实际强度可能低于上述估算区间。建议在 900°C 下进行短时拉伸测试，并同时记录氧化增重。",
      ].join("\n"),
      scores: { deepSeekScore: alphaDeepSeek, qwenScore: alphaQwen },
    },
  ],
};
