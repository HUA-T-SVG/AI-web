import { actionDisplayName, type MergeResolution, type SkippedAction } from '@/core';
import type { Provenance } from '@/scriptgen';
import type { ReviewDecision } from '@/ui/stores/reviewStore';
import type { CoverageGap, CoverageMap } from './coverageMap';
import { checkLabel } from './checkLabels';

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
 *
 * 「检查结论」同理，只读 datasetStore 已有的问题清单与检查状态。它只有检查
 * 跑完、且确实是按当前数据版本算的，才允许写成结论；没跑完、失败、属于旧版本
 * 都单独表述 —— 把空的 `issues` 说成「没问题」是这一页最严重的错误。
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
 * 映射表放在 core 的 `actionLabels.ts`：执行器的拒绝理由、导出页的「未执行」
 * 列表与这里必须叫同一个名字，三处各写一份迟早会漂移。
 *
 * 人工确认类动作（review_* / 不改数据的动作）统一写明「不改数据」——
 * 它们在留痕里算「已应用」，读者否则会以为数据被改了。
 */
export function actionText(action: string): string {
  const known = actionDisplayName(action);
  if (known !== action) return known;
  if (action.startsWith('review_')) return `人工复核（不改数据，标识：${action}）`;
  // 未知动作回退成标识本身：不编一个不存在的中文名
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
  /** 仅 merge_categories：执行时实际采用的归并方向，脚本重放与方法草稿都依赖它 */
  mergeResolution?: MergeResolution;
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

/**
 * 检查结论要用的问题清单子集。
 *
 * 只取严重度与涉及字段：证据行号、置信度是检查页排查用的材料，塞进报告
 * 会把一段结论变成长表。`checkId` 只为识别「这条其实是某个检查项没跑完」——
 * 那种情况下结论里要明说结果并不完整。
 */
export interface ReportCheckIssue {
  severity: 'high' | 'medium' | 'low';
  columns: readonly string[];
  checkId?: string;
}

/**
 * 「检查结论」的统计数字。只给 done 状态用。
 *
 * 未完成或旧版本的清单也数得出条数，但那些数字不是当前结论，报告里不呈现 ——
 * 不然读者一眼看到「检出 7 条」，很难再注意到上面那行「已失效」。
 */
export interface ReportChecksCounts {
  issueCount: number;
  high: number;
  medium: number;
  low: number;
  /** 问题涉及的不同字段数。全局性问题（如某检查项没跑完）不计字段 */
  fieldCount: number;
  /** 结论对应的数据版本 */
  dataVersion: number;
}

export interface ReportChecksConclusion {
  /**
   * - done：检查跑完且版本一致，可以给统计结论
   * - incomplete：还没跑完、失败了或还没开始，报告不给结论
   * - stale：检查跑完了，但那份清单属于旧数据版本，已经失效
   * - unavailable：调用方没有提供检查结果，报告不编造
   */
  state: 'done' | 'incomplete' | 'stale' | 'unavailable';
  /** 一句话主结论。预览与 Word 都直接用它，不各自再拼一遍 */
  summary: string;
  /** 依据与原因。空数组表示没有补充 */
  details: string[];
  /** 只有 done 有数字；其余状态一律 null */
  counts: ReportChecksCounts | null;
}

/**
 * 报告里的「检查覆盖与能力边界」。
 *
 * 检查结论回答「报了什么」，覆盖回答「查了什么、哪里没查」。两种都要进报告：
 * 只给结论的 PDF 被带到评审桌上，读者默认它是完整的；把能力边界写出来，
 * 「没有发现问题」才不会被读成「所有检查通过」。
 *
 * 与预览页共用同一份 `buildCoverageMap` 结果，报告不另算一套。
 */
/**
 * 覆盖缺口的结构化投影。
 *
 * `gapsText` 是给预览 / Word 直接渲染的一句话；方法草稿要按 kind 与能力分组写
 * 「本次未进行」，靠拆字符串既脆又容易漏 —— 同一份映射同时供两种消费者使用。
 */
export interface ReportCoverageGap {
  kind: CoverageGap['kind'];
  capability: string;
  reason: string;
}

export interface ReportCoverageRow {
  column: string;
  typeLabel: string;
  /** 已完成检查的中文名，顿号分隔；没有则「—」 */
  completedText: string;
  /** 未覆盖项：能力名 + 原因；没有则「—」 */
  gapsText: string;
  /** 未覆盖项的结构化版本（草稿用它判断哪类检查本次没得出可报告的结论） */
  gaps: ReportCoverageGap[];
}

export interface ReportCoverage {
  /** 检查没跑完 / 失败 / 旧版本时为 false，此时行内没有「已完成」 */
  trustworthy: boolean;
  summary: string;
  table: ReportCoverageRow;
  fields: ReportCoverageRow[];
  /** 写进报告的固定口径说明（不是装饰：它防止读者把覆盖表读成合格证明） */
  note: string;
}

const COVERAGE_TYPE_LABEL: Record<string, string> = {
  number: '数值',
  category: '类别',
  text: '文本',
  boolean: '布尔',
  empty: '空列',
  mixed: '混杂',
  table: '表级',
};

const COVERAGE_NOTE =
  '这张表说明检查覆盖到哪一步；「没有发现问题」不等于「所有检查通过」，' +
  '未覆盖项是能力边界或待补充的配置。';

function toCoverageRow(row: CoverageMap['table']): ReportCoverageRow {
  return {
    column: row.column,
    typeLabel: COVERAGE_TYPE_LABEL[row.type] ?? row.type,
    completedText:
      row.completed.length > 0 ? row.completed.map((id) => checkLabel(id)).join('、') : '—',
    gapsText:
      row.gaps.length > 0
        ? row.gaps.map((gap) => `${gap.capability}：${gap.reason}`).join('；')
        : '—',
    gaps: row.gaps.map((gap) => ({
      kind: gap.kind,
      capability: gap.capability,
      reason: gap.reason,
    })),
  };
}

function toReportCoverage(map: CoverageMap): ReportCoverage {
  return {
    trustworthy: map.trustworthy,
    summary: map.summary,
    table: toCoverageRow(map.table),
    fields: map.fields.map((field) => toCoverageRow(field)),
    note: COVERAGE_NOTE,
  };
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
  /** 「检查结论」段落。检查没跑完 / 属于旧版本时这里只说明原因，不给结论 */
  checks: ReportChecksConclusion;
  /** 「检查覆盖与能力边界」段落。没有画像数据时为 null（会写一句说明，不整段消失） */
  coverage: ReportCoverage | null;
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
  /** 当前数据版本的问题清单。与 checksStatus / checksVersion 一起决定「检查结论」 */
  checkIssues?: readonly ReportCheckIssue[];
  /** 检查失败的原因。界面已经有一句就直接复用，报告不另猜 */
  checksNote?: string | null;
  /** 检查覆盖地图（与检查页共用同一份纯函数结果）；不传则报告写明没有覆盖数据 */
  coverageMap?: CoverageMap | null;
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

/**
 * 「检查结论」怎么表述。
 *
 * 单独抽成函数不是为了复用，而是因为这是报告里最容易说错的一段：`issues` 为空
 * 至少有五种含义 —— 还没开始、正在跑、跑失败了、跑完了没问题、以及检查项自己
 * 出错没产出结果。后四种里只有一种能写进结论，把它写在 JSX 里，迟早会有人
 * 直接渲染出一句「这份数据没检出问题」。
 */
export function buildChecksConclusion(input: {
  dataVersion: number;
  checksStatus?: ReportChecksStatus;
  checksVersion?: number | null;
  checksNote?: string | null;
  checkIssues?: readonly ReportCheckIssue[];
}): ReportChecksConclusion {
  // 调用方没给检查状态（例如只想要一份清洗留痕）：报告只能如实说没有检查结论，
  // 不能拿动作记录去推一个「应该没问题」
  if (input.checksStatus === undefined) {
    return {
      state: 'unavailable',
      summary: '本次报告只有清洗留痕，没有可用的检查结论。',
      details: ['报告没有拿到当前数据版本的检查结果，因此不判断数据是否存在质量问题。'],
      counts: null,
    };
  }

  if (input.checksStatus === 'running') {
    return {
      state: 'incomplete',
      summary: '检查尚未完成：正在按当前数据重新检查，本次报告不给检查结论。',
      details: [`原因：数据版本 v${input.dataVersion} 的检查还在进行中。`],
      counts: null,
    };
  }

  if (input.checksStatus === 'failed') {
    const reason = input.checksNote?.trim() ?? '';
    return {
      state: 'incomplete',
      summary: '检查失败：本次报告不给检查结论。',
      details: [
        reason.length > 0 ? `原因：${reason}` : '原因：检查失败的具体原因没有记录。',
        '检查失败不等于数据没有问题；请重新检查后再导出报告。',
      ],
      counts: null,
    };
  }

  if (input.checksStatus === 'idle') {
    return {
      state: 'incomplete',
      summary: '检查尚未开始：本次报告不给检查结论。',
      details: [`原因：还没有按数据版本 v${input.dataVersion} 执行检查。`],
      counts: null,
    };
  }

  // 走到这里检查跑完了。但「跑完」不等于「能当结论用」：先确认它有归属版本，
  // 否则读者会把上一版数据的结果当成这一版的
  if (input.checksVersion === undefined || input.checksVersion === null) {
    return {
      state: 'unavailable',
      summary: '检查结果没有记录对应的数据版本，本次报告不给检查结论。',
      details: [`原因：无法确认问题清单是否属于当前数据版本 v${input.dataVersion}。`],
      counts: null,
    };
  }

  if (input.checksVersion !== input.dataVersion) {
    return {
      state: 'stale',
      summary: `检查结论属于旧数据版本 v${input.checksVersion}，当前是 v${input.dataVersion}，已失效。`,
      details: [
        `旧结论只对数据版本 v${input.checksVersion} 成立；要给出当前版本的检查结论，请等重新检查完成后再导出。`,
      ],
      counts: null,
    };
  }

  if (input.checkIssues === undefined) {
    return {
      state: 'unavailable',
      summary: '检查结果缺少问题清单，本次报告不给检查结论。',
      details: ['报告没有拿到这一版数据的问题清单，不能把「没有清单」写成「没有问题」。'],
      counts: null,
    };
  }

  const issues = input.checkIssues;
  const counts: ReportChecksCounts = {
    issueCount: issues.length,
    high: issues.filter((issue) => issue.severity === 'high').length,
    medium: issues.filter((issue) => issue.severity === 'medium').length,
    low: issues.filter((issue) => issue.severity === 'low').length,
    fieldCount: countDistinctColumns(issues),
    dataVersion: input.dataVersion,
  };

  const failedChecks = issues.filter((issue) => issue.checkId === 'check-failed').length;
  const details = [`结论基于数据版本 v${input.dataVersion}。`];
  if (failedChecks > 0) {
    // 某个检查项自己崩了时 checksStatus 仍是 done，但那份清单并不完整。
    // 不写明这点，读者会把「其余检查没报问题」理解成「都已经查过了」
    details.push(`其中 ${failedChecks} 条来自未能完成的检查项，这部分结果没有包含在本报告中。`);
  }

  return {
    state: 'done',
    summary:
      `检查已完成：检出问题 ${counts.issueCount} 条` +
      `（严重 ${counts.high} 条、中等 ${counts.medium} 条、轻微 ${counts.low} 条），` +
      `涉及 ${counts.fieldCount} 个字段。`,
    details,
    counts,
  };
}

/** 问题涉及的不同字段数。全局性问题（没有具体列）不占字段名额 */
function countDistinctColumns(issues: readonly ReportCheckIssue[]): number {
  const names = new Set<string>();
  for (const issue of issues) {
    for (const name of issue.columns) names.add(name);
  }
  return names.size;
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
  const checks = buildChecksConclusion({
    dataVersion: input.dataVersion,
    checksStatus: input.checksStatus,
    checksVersion: input.checksVersion,
    checksNote: input.checksNote,
    checkIssues: input.checkIssues,
  });

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
    checks,
    coverage: input.coverageMap === undefined || input.coverageMap === null
      ? null
      : toReportCoverage(input.coverageMap),
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
    ...(step.mergeResolution !== undefined ? { mergeResolution: step.mergeResolution } : {}),
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
