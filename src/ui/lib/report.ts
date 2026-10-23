import type { SkippedAction } from '@/core';
import type { Provenance } from '@/scriptgen';
import type { ReviewDecision } from '@/ui/stores/reviewStore';

/**
 * 可读报告的数据装配（设计文档第三轮「可读 PDF / Word 报告」）。
 *
 * 为什么单独抽成纯函数：
 *
 * - **屏幕预览、打印 / 另存为 PDF、Word 导出必须是同一份内容。** 三处各拼一套，
 *   迟早会出现「屏幕上写 3 条待确认、导出的文件里是 2 条」这种没人能解释的漂移。
 * - 报告的口径要能被测试钉住：改了多少单元格、哪些结论已失效、没填理由的人工决定
 *   该怎么写。写在 JSX 里就只能靠读代码相信它。
 *
 * 数据来源刻意与导出面板共用同一批产物：`buildProvenance` 的步骤 / 指纹 / 环境、
 * 已算好的「清洗前后字段变化」、reviewStore 的人工决定。**这里不另算一套**，
 * 否则同一页会出现两个「改了 3 格」。
 */

/** 报告里的人工决定文案。设计文档要求把 decision 与用户理由一起进报告。 */
export const DECISION_TEXT: Record<ReviewDecision, string> = {
  pending: '待确认',
  accepted: '接受建议',
  modified: '修改参数后接受',
  rejected: '拒绝建议、保留原值',
};

export const SEVERITY_TEXT: Record<'high' | 'medium' | 'low', string> = {
  high: '严重',
  medium: '中等',
  low: '轻微',
};

/**
 * 动作的中文名。
 *
 * 报告给的是不读代码的人，`merge_categories` 这种标识符要能变成一句人话。
 * 人工确认类动作（review_* / 不改数据的动作）统一写明「不改数据」——
 * 它们在留痕里算「已应用」，读者否则会以为数据被改了。
 */
const ACTION_TEXT: Record<string, string> = {
  merge_categories: '归并同类类别',
  trim_whitespace: '去除首尾空格',
  fill_missing: '填充缺失值',
  remove_duplicates: '删除重复行',
  review_duplicates: '人工复核重复行（不改数据）',
  fill_or_drop: '人工决定缺失值填充或删除（不改数据）',
  unify_unit: '人工统一单位（不改数据）',
  unify_unit_notation: '人工统一单位写法（不改数据）',
  review_unit_family: '人工复核单位族（不改数据）',
  review_unit_mix: '人工复核单位混用（不改数据）',
};

export function actionText(action: string): string {
  const known = ACTION_TEXT[action];
  if (known !== undefined) return known;
  if (action.startsWith('review_')) return `人工复核（不改数据）：${action}`;
  return action;
}

/**
 * 报告里的时间。
 *
 * 统一标 UTC 而不是本地时间：报告会被拿到别的机器 / 别的时区复核，
 * 一个不带时区的 `2026-10-23 09:04` 对不上到底指的是哪一刻。
 */
export function formatReportTime(iso: string): string {
  const base = iso.slice(0, 19).replace('T', ' ');
  // 只认「YYYY-MM-DD HH:mm:ss」这一种形状；其它写法原样返回，不假装解析成功
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(base)) return iso;
  return `${base}（UTC）`;
}

/** 参数写成一句人话。对象与数组用 JSON 表示，避免把 `[object Object]` 印进报告。 */
export function formatParams(params: Record<string, unknown>): string {
  const entries = Object.entries(params);
  if (entries.length === 0) return '（无参数）';
  return entries.map(([key, value]) => `${key}=${formatParamValue(value)}`).join('；');
}

function formatParamValue(value: unknown): string {
  if (value === null || value === undefined) return '空';
  if (typeof value === 'string') return `「${value}」`;
  if (Array.isArray(value)) return `[${value.map(formatParamValue).join(', ')}]`;
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export interface ReportMetaRow {
  label: string;
  value: string;
}

export interface ReadableSummary {
  /** 曾真正执行（或记成已确认）的动作条数 */
  actionCount: number;
  /** 改写的单元格数。删行动作不计入，避免与「删除行数」重复计数 */
  changedCells: number;
  deletedRows: number;
  beforeRowCount: number;
  afterRowCount: number;
  /** 与导出面板的 `changeSummary.rowDelta` 同一口径 */
  rowDelta: number;
  beforeColumnCount: number;
  afterColumnCount: number;
  /** 本次没有执行任何清洗动作 */
  isEmpty: boolean;
}

export interface ReportFieldChange {
  name: string;
  missingBefore: number;
  missingAfter: number;
  uniqueBefore: number;
  uniqueAfter: number;
}

export interface ReportStep {
  index: number;
  actionType: string;
  actionText: string;
  targetColumnsText: string;
  paramsText: string;
  appliedAt: string;
  appliedAtText: string;
  changedCells: number;
  beforeRowCount: number;
  afterRowCount: number;
  /** 「影响」一列：改了多少格 / 删了多少行 / 只是记录人工确认 */
  impactText: string;
}

export interface ReportDecision {
  title: string;
  severity: 'high' | 'medium' | 'low';
  severityText: string;
  decision: ReviewDecision;
  decisionText: string;
  /** 用户填写的理由。没填时明说，不假装有 */
  note: string;
  hasNote: boolean;
  suggestionActionText: string;
  suggestionParamsText: string;
  rationale: string;
  /** modified 时用户实际改成了什么；其它决定为 null */
  adjustmentText: string | null;
}

/**
 * 报告只需要 review item 的这一小撮字段。
 *
 * 用结构化子集而不是直接依赖 `ReviewItem`：报告是「给人读的投影」，
 * 不该因为 store 里多了一个内部字段就跟着改。
 */
export interface ReportReviewItem {
  issue: {
    title: string;
    severity: 'high' | 'medium' | 'low';
    suggestion: {
      action: string;
      params: Record<string, unknown>;
      rationale: string;
    };
  };
  decision: ReviewDecision;
  note?: string;
  override?: {
    action: string;
    params: Record<string, unknown>;
  };
}

export interface ReportRiskItem {
  title: string;
  severityText: string;
}

export interface ReportRejectedRisk extends ReportRiskItem {
  note: string;
}

export interface ReportSkippedRisk {
  actionText: string;
  reason: string;
}

export interface ReportRisks {
  pending: ReportRiskItem[];
  rejected: ReportRejectedRisk[];
  skipped: ReportSkippedRisk[];
  /** 一句话汇总，界面与 Word 共用 */
  summary: string;
  isEmpty: boolean;
}

export interface ReadableReport {
  title: string;
  /** 报告对应的文件名与数据版本。单独给出，组件不必按 meta 的下标去猜 */
  sourceFileName: string;
  dataVersion: number;
  meta: ReportMetaRow[];
  generatedAt: string;
  generatedAtText: string;
  summary: ReadableSummary;
  fieldChanges: ReportFieldChange[];
  rowDelta: number;
  steps: ReportStep[];
  decisions: ReportDecision[];
  risks: ReportRisks;
  /** 结论已失效的提示。没有失效项时为空数组 */
  staleNotices: string[];
  /** 报告是怎么来的：避免读者把它当成服务端生成的权威结论 */
  sourceNote: string;
}

export type ReportChecksStatus = 'idle' | 'running' | 'done' | 'failed';

export interface ReadableReportInput {
  sourceFileName: string;
  dataVersion: number;
  /** ISO 时间。由调用方传入，纯函数里不读时钟，测试才能确定 */
  generatedAt: string;
  provenance: Provenance;
  originalRowCount: number;
  currentRowCount: number;
  originalColumnCount: number;
  currentColumnCount: number;
  /** 与导出面板同一份「清洗前后」口径：只含统计上真的变了的字段 */
  fieldChanges: readonly ReportFieldChange[];
  rowDelta: number;
  reviewItems: readonly ReportReviewItem[];
  skipped: readonly SkippedAction[];
  runVersion?: number | null;
  executedVersion?: number | null;
  checksVersion?: number | null;
  checksStatus?: ReportChecksStatus;
}

export interface ReportVersionInput {
  dataVersion: number;
  runVersion?: number | null;
  executedVersion?: number | null;
  checksVersion?: number | null;
  checksStatus?: ReportChecksStatus;
}

/**
 * 「这份报告里的结论还属于当前数据吗」。
 *
 * 版本对不上不是小事：一份写着「已清洗」的报告配上一版没洗过的数据，
 * 在科研场景里就是一份不实的记录。所以对不上时报告必须自己说出来。
 */
export function buildStaleNotices(input: ReportVersionInput): string[] {
  const notices: string[] = [];

  if (
    input.runVersion !== null &&
    input.runVersion !== undefined &&
    input.runVersion !== input.dataVersion &&
    input.executedVersion === null
  ) {
    notices.push(
      `上一轮 AI 建议基于数据版本 v${input.runVersion}，当前数据已是 v${input.dataVersion}；` +
        '这批建议已失效，报告不把它们当作当前结论。',
    );
  }

  if (
    input.executedVersion !== null &&
    input.executedVersion !== undefined &&
    input.executedVersion !== input.dataVersion
  ) {
    notices.push(
      `处理动作与人工决定执行于数据版本 v${input.executedVersion}，当前数据已是 v${input.dataVersion}；` +
        '报告反映的是执行时那一版的结果。',
    );
  }

  if (
    input.checksStatus === 'done' &&
    input.checksVersion !== null &&
    input.checksVersion !== undefined &&
    input.checksVersion !== input.dataVersion
  ) {
    notices.push(
      `问题清单属于数据版本 v${input.checksVersion}，与当前 v${input.dataVersion} 不一致；` +
        '报告里的检查结论不是当前版本的结果。',
    );
  }

  if (input.checksStatus === 'running') {
    notices.push('正在按当前数据重新检查，报告里的检查结论尚未生成。');
  }

  if (input.checksStatus === 'failed') {
    notices.push('检查没能完成，报告里的遗留风险只来自已记录的人工决定与未执行动作。');
  }

  return notices;
}

/** 报告末尾的口径说明。界面与 Word 都从这一处取，避免两处各写一句。 */
export const REPORT_SOURCE_NOTE =
  '本报告由浏览器在本地根据本次操作记录生成，原始数据没有离开这台机器。' +
  '时间统一按 UTC 标注；清洗前后只列出统计上确实发生变化的字段，不折算综合改善幅度，' +
  '也没有变化的字段不写成「已优化」。';

export function buildReadableReport(input: ReadableReportInput): ReadableReport {
  const { provenance } = input;
  const steps = provenance.steps.map(toReportStep);
  // core 在删行的动作上把 changedCells 记成「删了多少行」；直接求和会让
  // 删除 5 行同时被算成改动 5 个单元格。按动作前后行数区分口径
  const changedCells = provenance.steps.reduce(
    (sum, step) => (step.beforeRowCount === step.afterRowCount ? sum + step.changedCells : sum),
    0,
  );
  const deletedRows = Math.max(0, input.originalRowCount - input.currentRowCount);
  const decisions = input.reviewItems.map(toReportDecision);
  const risks = summarizeRisks(decisions, input.skipped);

  return {
    title: '数据处理质量报告',
    sourceFileName: input.sourceFileName,
    dataVersion: input.dataVersion,
    meta: [
      { label: '文件名', value: input.sourceFileName },
      { label: '数据版本', value: `v${input.dataVersion}` },
      { label: '生成时间', value: formatReportTime(input.generatedAt) },
      { label: '应用版本', value: provenance.environment.appVersion },
      { label: '规则库版本', value: provenance.environment.ruleLibraryVersion },
      { label: '语义模型', value: provenance.environment.embeddingModel },
      { label: '会话开始', value: formatReportTime(provenance.sessionStartedAt) },
      { label: '留痕完成于', value: formatReportTime(provenance.completedAt) },
      { label: '清洗前数据指纹', value: provenance.datasetFingerprint },
      { label: '清洗后数据指纹', value: provenance.resultFingerprint },
    ],
    generatedAt: input.generatedAt,
    generatedAtText: formatReportTime(input.generatedAt),
    summary: {
      actionCount: provenance.steps.length,
      changedCells,
      deletedRows,
      beforeRowCount: input.originalRowCount,
      afterRowCount: input.currentRowCount,
      rowDelta: input.rowDelta,
      beforeColumnCount: input.originalColumnCount,
      afterColumnCount: input.currentColumnCount,
      isEmpty: provenance.steps.length === 0,
    },
    fieldChanges: input.fieldChanges.map((change) => ({ ...change })),
    rowDelta: input.rowDelta,
    steps,
    decisions,
    risks,
    staleNotices: buildStaleNotices({
      dataVersion: input.dataVersion,
      runVersion: input.runVersion,
      executedVersion: input.executedVersion,
      checksVersion: input.checksVersion,
      checksStatus: input.checksStatus,
    }),
    sourceNote: REPORT_SOURCE_NOTE,
  };
}

function toReportStep(step: Provenance['steps'][number]): ReportStep {
  const before = step.beforeRowCount;
  const after = step.afterRowCount;
  let impactText: string;
  if (before !== after) {
    impactText = `删除 ${before - after} 行（${before} → ${after} 行）`;
  } else if (step.changedCells > 0) {
    impactText = `改动 ${step.changedCells} 个单元格，行数不变（${before} 行）`;
  } else {
    impactText = `不改数据，行数不变（${before} 行）`;
  }

  return {
    index: step.index,
    actionType: step.actionType,
    actionText: actionText(step.actionType),
    targetColumnsText: step.targetColumns.length > 0 ? step.targetColumns.join('、') : '（整表）',
    paramsText: formatParams(step.params),
    appliedAt: step.appliedAt,
    appliedAtText: formatReportTime(step.appliedAt),
    changedCells: step.changedCells,
    beforeRowCount: before,
    afterRowCount: after,
    impactText,
  };
}

function toReportDecision(item: ReportReviewItem): ReportDecision {
  const rawNote = item.note?.trim() ?? '';
  const adjustment =
    item.decision === 'modified' && item.override !== undefined
      ? `用户把建议改为「${actionText(item.override.action)}」：${formatParams(item.override.params)}`
      : null;

  return {
    title: item.issue.title,
    severity: item.issue.severity,
    severityText: SEVERITY_TEXT[item.issue.severity],
    decision: item.decision,
    decisionText: DECISION_TEXT[item.decision],
    note:
      rawNote.length > 0
        ? rawNote
        : // 没填就是没填。空白会让人以为是「没有意见」，而「没有记录」和
          // 「同意」在复核时是两回事
          item.decision === 'pending'
          ? '尚未处理，没有理由记录'
          : '未填写理由',
    hasNote: rawNote.length > 0,
    suggestionActionText: actionText(item.issue.suggestion.action),
    suggestionParamsText: formatParams(item.issue.suggestion.params),
    rationale: item.issue.suggestion.rationale,
    adjustmentText: adjustment,
  };
}

function summarizeRisks(
  decisions: readonly ReportDecision[],
  skipped: readonly SkippedAction[],
): ReportRisks {
  const pending: ReportRiskItem[] = [];
  const rejected: ReportRejectedRisk[] = [];

  for (const decision of decisions) {
    if (decision.decision === 'pending') {
      pending.push({ title: decision.title, severityText: decision.severityText });
    } else if (decision.decision === 'rejected') {
      rejected.push({
        title: decision.title,
        severityText: decision.severityText,
        note: decision.note,
      });
    }
  }

  const skippedRisks: ReportSkippedRisk[] = skipped.map((item) => ({
    actionText: actionText(item.action.action),
    reason: item.reason,
  }));

  const parts: string[] = [];
  if (pending.length > 0) parts.push(`待确认 ${pending.length} 条`);
  if (rejected.length > 0) parts.push(`已拒绝 ${rejected.length} 条`);
  if (skippedRisks.length > 0) parts.push(`未执行 ${skippedRisks.length} 条`);

  return {
    pending,
    rejected,
    skipped: skippedRisks,
    summary:
      parts.length === 0 ? '本轮没有待确认建议、被拒建议或未执行动作。' : `${parts.join('、')}。`,
    isEmpty: parts.length === 0,
  };
}
