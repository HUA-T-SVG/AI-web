import {
  DEFAULT_MISSING_LOW_THRESHOLD,
  MIN_OUTLIER_OBSERVATIONS,
  type ColumnProfile,
  type ColumnType,
  type DatasetProfile,
  type QualityIssue,
  type RangeRule,
} from '@/core';

/**
 * 「检查覆盖地图」的纯逻辑：按字段说清楚哪些检查真的跑过、哪些没跑到、下一步能做什么。
 *
 * 这张图存在的理由只有一条：**「没有发现问题」不等于「检查过了、数据没问题」**。
 * 检查可能还在跑、可能崩了、可能是上一版数据的结论；语义归并可能因为端侧模型不可用
 * 而降级；值域规则要用户自己配，没配就等于领域范围没确认。这些情况只要有任何一种，
 * 就不能让界面看起来像一份「全都查过了」的报告。
 *
 * 所以这里的 `completed` 只记**真正执行完成**的检查项；没覆盖到的一律进 `gaps`，
 * 连入口都没有的用 `action: null` 说明，不编一个动作出来。
 */

export type CoverageAction =
  'configure-range' | 'rerun-checks' | 'open-analysis' | 'review-pending' | null;

export type CoverageGapKind =
  | 'not-run'
  /**
   * 检查确实执行了，但样本量/缺失率没到报告阈值，因此本次没有得出可报告的结论。
   * 与 `not-run` 分开：混在一起会让「执行了但条件不足」被读成「没检查/能力边界」。
   */
  | 'below-threshold'
  | 'failed'
  | 'stale'
  | 'degraded'
  | 'not-configured'
  | 'not-applicable'
  | 'needs-review';

export interface CoverageGap {
  kind: CoverageGapKind;
  /** 能力名，如「值域规则」「语义归并」「跨表检查」 */
  capability: string;
  /** 人话解释：为什么这一列/这一项没被覆盖。禁止出现「通过」「合格」 */
  reason: string;
  /** 界面可提供的下一步；null = 当前版本没有入口，只解释 */
  action: CoverageAction;
}

export interface FieldCoverage {
  /** 字段名；表级行用「全表」 */
  column: string;
  /** 'table' 表示表级（重复记录、列名重复、跨表能力边界），其余用 ColumnType */
  type: ColumnType | 'table';
  /** 真正执行完成的检查项 id（如 'missing'、'range-rules'） */
  completed: string[];
  gaps: CoverageGap[];
}

export interface CoverageMapInput {
  profile: DatasetProfile;
  issues: QualityIssue[];
  checksStatus: 'idle' | 'running' | 'done' | 'failed';
  checksVersion: number | null;
  dataVersion: number;
  synonymStatus: 'idle' | 'pending' | 'ready' | 'degraded';
  rangeRules: readonly RangeRule[];
}

export interface CoverageMap {
  table: FieldCoverage;
  fields: FieldCoverage[];
  /** 检查全部完成且版本一致才为 true；false 时所有字段的 completed 必须为空、gaps 说明未知 */
  trustworthy: boolean;
  /** 标题旁一句话；可信时概括「已覆盖 N 个字段，M 处能力边界/配置缺口」，不可信时说明原因。禁止「通过」「合格」 */
  summary: string;
}

const TABLE_ROW_NAME = '全表';

/** 只对整表成立的两项检查，落到表级行上 */
const TABLE_ONLY_CHECKS = ['duplicates', 'duplicate-column-names'] as const;

/**
 * 每一项都按整表扫描。
 *
 * 单位检查只有真出现带单位取值时才报问题，但它确实扫过了每一列 —— 不把它算进
 * completed，会让所有普通列都凭空多一条「没查单位」的缺口。
 */
const COLUMN_BASE_CHECKS = ['missing', 'type-consistency', 'unit-consistency'] as const;

const CHECK_CAPABILITY: Record<string, string> = {
  'duplicate-column-names': '列名重复',
  missing: '缺失值',
  duplicates: '重复记录',
  'type-consistency': '类型一致性',
  outliers: '异常值',
  'range-rules': '值域规则',
  'unit-consistency': '单位一致性',
  'category-synonyms': '类别同义',
};

/**
 * 类别同义里只有「归并」那一档（置信度 0.85）可以直接给建议；低于这条线的是
 * 「待确认」—— 尤其是只靠语义模型相似度提出来的一档（0.45），它是一条问题，不是结论。
 */
const REVIEW_CONFIDENCE_LINE = 0.8;

/**
 * 从 `check-failed` 问题里取回真正崩溃的检查项。
 *
 * 这类问题的 `checkId` 统一是 `check-failed`，真实项在 id 的中间一段：
 * `check-failed:<真实checkId>:<序号>`。只认 `checkId` 会把所有崩溃都归到同一个名字上，
 * 覆盖地图就没法说清是哪项检查没跑完。
 */
function failedCheckIds(issues: readonly QualityIssue[]): Set<string> {
  const failed = new Set<string>();
  for (const issue of issues) {
    if (issue.checkId !== 'check-failed') continue;
    const [, target] = issue.id.split(':');
    if (target) failed.add(target);
  }
  return failed;
}

function failedGap(checkId: string): CoverageGap {
  return {
    kind: 'failed',
    capability: CHECK_CAPABILITY[checkId] ?? checkId,
    reason: '检查项未完成（可能崩了）',
    action: 'rerun-checks',
  };
}

/** 同一种能力只留一条缺口：一个字段上并列两条「语义归并」除了刷屏没有信息量 */
function addGap(gaps: CoverageGap[], gap: CoverageGap): void {
  if (gaps.some((existing) => existing.capability === gap.capability)) return;
  gaps.push(gap);
}

function markExecuted(
  checkId: string,
  completed: string[],
  gaps: CoverageGap[],
  failedChecks: ReadonlySet<string>,
): void {
  if (failedChecks.has(checkId)) {
    addGap(gaps, failedGap(checkId));
    return;
  }
  completed.push(checkId);
}

/** 这条问题是不是在说「我提了候选，得人来定」—— 两类判据见函数体 */
function hasReviewCandidate(columnName: string, issues: readonly QualityIssue[]): boolean {
  return issues.some((issue) => {
    if (!issue.evidence.columns.includes(columnName)) return false;
    // review_* 是检查脚本自己声明「需要人工判断」的动作，比置信度更直接
    if (issue.suggestion?.action.startsWith('review')) return true;
    // 语义归并的待确认档不一定带 review_* 动作（归并动作本身仍是 merge_categories），
    // 但置信度低于自动建议线，同样只能当候选
    return issue.checkId === 'category-synonyms' && issue.confidence < REVIEW_CONFIDENCE_LINE;
  });
}

interface BuildContext {
  failedChecks: ReadonlySet<string>;
  synonymStatus: CoverageMapInput['synonymStatus'];
  rangeRules: readonly RangeRule[];
  issues: readonly QualityIssue[];
  /** 总行数：异常值检查的「有效观测」要用它减缺失数 */
  rowCount: number;
}

function buildTableRow(context: BuildContext): FieldCoverage {
  const completed: string[] = [];
  const gaps: CoverageGap[] = [];

  for (const checkId of TABLE_ONLY_CHECKS) {
    markExecuted(checkId, completed, gaps, context.failedChecks);
  }

  // 这两条不是「漏检」，是当前产品的能力边界。固定写出来，用户才知道哪些结论
  // 这张地图永远不会给 —— 否则「没有跨表问题」会被读成「跨表也没问题」。
  addGap(gaps, {
    kind: 'not-applicable',
    capability: '跨表检查',
    reason: '当前只处理单数据集，不做跨表键匹配与多表加载',
    action: null,
  });
  addGap(gaps, {
    kind: 'not-applicable',
    capability: '跨字段口径',
    reason: '当前不检查分项求和、总分与明细一致性等跨字段口径，需人工核对',
    action: null,
  });

  return { column: TABLE_ROW_NAME, type: 'table', completed, gaps };
}

function buildFieldRow(column: ColumnProfile, context: BuildContext): FieldCoverage {
  if (column.type === 'empty') {
    // 空列没有任何有效取值，任何列级检查都不会真的得出东西。记成「已执行」会让
    // 「覆盖」这个词失真，所以 completed 留空，只说清它为什么不适用。
    return {
      column: column.name,
      type: column.type,
      completed: [],
      gaps: [
        {
          kind: 'not-applicable',
          capability: '全部列级检查',
          reason: '这一列没有有效取值，无从检查',
          action: null,
        },
      ],
    };
  }

  const completed: string[] = [];
  const gaps: CoverageGap[] = [];

  for (const checkId of COLUMN_BASE_CHECKS) {
    if (
      checkId === 'missing' &&
      !context.failedChecks.has('missing') &&
      column.missingCount > 0 &&
      column.missingRate < DEFAULT_MISSING_LOW_THRESHOLD
    ) {
      // 缺失率低于报告阈值时 core 不把它当问题报。这里也不能记「已完成」：
      // 方法草稿若照抄「已完成缺失检查」，会写出一句没发生过的处理描述。
      addGap(gaps, {
        kind: 'below-threshold',
        capability: '缺失值',
        reason: `缺失率 ${(column.missingRate * 100).toFixed(2)}% 低于 ${DEFAULT_MISSING_LOW_THRESHOLD * 100}% 的报告阈值，本次未作为问题报告（缺失仍存在于数据中）`,
        action: null,
      });
      continue;
    }
    markExecuted(checkId, completed, gaps, context.failedChecks);
  }

  if (column.type === 'number') {
    // 有效观测 = 总行数 − 缺失数；core 少于 4 个观测时不做异常值判定
    const observed = context.rowCount - column.missingCount;
    if (!context.failedChecks.has('outliers') && observed < MIN_OUTLIER_OBSERVATIONS) {
      addGap(gaps, {
        kind: 'below-threshold',
        capability: '异常值',
        reason: `有效观测 ${observed} 个，少于 ${MIN_OUTLIER_OBSERVATIONS} 个时四分位数不稳定，本次不做异常值判定`,
        action: null,
      });
    } else {
      markExecuted('outliers', completed, gaps, context.failedChecks);
    }
  } else {
    addGap(gaps, {
      kind: 'not-applicable',
      capability: '异常值',
      // 混杂列不是「非数值」：它有数值，只是数值口径被文本值打断。
      // 两句都叫「非数值列」会让人以为这一列没有数字，反而误读检查范围。
      reason:
        column.type === 'mixed'
          ? '该列数值与文本混杂，异常值检查不做（数值口径会被文本值打断）'
          : '非数值列不做异常值检查',
      action: null,
    });
  }

  if (column.type === 'category' || column.type === 'boolean') {
    if (context.failedChecks.has('category-synonyms')) {
      addGap(gaps, failedGap('category-synonyms'));
    } else if (context.synonymStatus === 'ready') {
      completed.push('category-synonyms');
    } else if (context.synonymStatus === 'degraded') {
      addGap(gaps, {
        kind: 'degraded',
        capability: '语义归并',
        reason: '端侧模型不可用，本次只检查了字面与结构规则，语义相近的写法没有检查',
        action: null,
      });
    } else {
      // pending 与 idle 都不是「查过了没问题」，而是这批取值还没进入语义检查
      addGap(gaps, {
        kind: 'not-run',
        capability: '语义归并',
        reason: '语义模型还没准备好，这一列的同义写法本次没有被检查',
        action: null,
      });
    }
  } else {
    addGap(gaps, {
      kind: 'not-applicable',
      capability: '类别同义归并',
      reason: '非类别/布尔列不适用',
      action: null,
    });
  }

  // 适用范围按列名匹配。可配置的列：
  //   - number / mixed：数值区间（checkRangeRules 逐行 parseNumeric，文本取值跳过，
  //     所以「年龄」列里混进 abc 时配 0–120 仍能检出 999）；
  //   - category / boolean：允许取值清单（例如学历只允许 本科/硕士/博士）。
  // 只把 number 当可配置，会把最典型的演示列判成「不支持」，入口就点不出来了。
  const hasRangeRule = context.rangeRules.some((rule) => rule.column === column.name);
  if (hasRangeRule) {
    markExecuted('range-rules', completed, gaps, context.failedChecks);
  } else if (
    column.type === 'number' ||
    column.type === 'mixed' ||
    column.type === 'category' ||
    column.type === 'boolean'
  ) {
    addGap(gaps, {
      kind: 'not-configured',
      capability: '值域规则',
      reason:
        column.type === 'category' || column.type === 'boolean'
          ? '领域适用取值尚未确认（这一列没有配置允许取值清单）'
          : '领域范围尚未确认（这一列没有配置值域规则）',
      action: 'configure-range',
    });
  } else {
    addGap(gaps, {
      kind: 'not-applicable',
      capability: '值域规则',
      reason: '文本/空列没有固定取值范围，不适合配置数值区间或允许清单，需人工确认',
      action: null,
    });
  }

  if (hasReviewCandidate(column.name, context.issues)) {
    addGap(gaps, {
      kind: 'needs-review',
      capability: '人工复核',
      reason: '检查已提出候选，需人工确认是否成立（不是自动结论）',
      action: 'review-pending',
    });
  }

  return { column: column.name, type: column.type, completed, gaps };
}

interface UnknownCoverage {
  /** 每行要一条独立的 gap 对象，避免界面或后续处理改动一行时串到其它行 */
  makeGap: () => CoverageGap;
  summary: string;
}

/**
 * 不可信时整张图的表述：所有行只留一条缺口，completed 清空。
 *
 * 这里刻意不保留任何按类型的细分 —— 检查都没跑完，按类型说「数值列查了异常值」
 * 是拿半份结果冒充覆盖情况。
 */
function describeUnknown(input: CoverageMapInput): UnknownCoverage | null {
  if (input.checksStatus !== 'done') {
    if (input.checksStatus === 'failed') {
      return {
        makeGap: () => ({
          kind: 'not-run',
          capability: '确定性检查',
          reason: '检查失败，覆盖情况未知',
          action: 'rerun-checks',
        }),
        summary: '检查失败，覆盖情况未知；请重新检查后再看这份地图',
      };
    }
    return {
      makeGap: () => ({
        kind: 'not-run',
        capability: '确定性检查',
        reason: '检查还没跑完，覆盖情况未知',
        action: null,
      }),
      summary: '检查还没跑完，覆盖情况未知；请等检查完成后再看这份地图',
    };
  }

  if (input.checksVersion === null || input.checksVersion !== input.dataVersion) {
    return {
      makeGap: () => ({
        kind: 'stale',
        capability: '确定性检查',
        reason: '结论属于旧数据版本，已失效',
        action: 'rerun-checks',
      }),
      summary: '检查结论无法确认对应当前数据版本，覆盖情况未知；请重新检查后再看这份地图',
    };
  }

  return null;
}

function buildUnknownRow(
  column: string,
  type: ColumnType | 'table',
  makeGap: () => CoverageGap,
): FieldCoverage {
  return { column, type, completed: [], gaps: [makeGap()] };
}

export function buildCoverageMap(input: CoverageMapInput): CoverageMap {
  const unknown = describeUnknown(input);
  if (unknown !== null) {
    return {
      table: buildUnknownRow(TABLE_ROW_NAME, 'table', unknown.makeGap),
      fields: input.profile.columns.map((column) =>
        buildUnknownRow(column.name, column.type, unknown.makeGap),
      ),
      trustworthy: false,
      summary: unknown.summary,
    };
  }

  const context: BuildContext = {
    failedChecks: failedCheckIds(input.issues),
    synonymStatus: input.synonymStatus,
    rangeRules: input.rangeRules,
    issues: input.issues,
    rowCount: input.profile.rowCount,
  };

  const table = buildTableRow(context);
  const fields = input.profile.columns.map((column) => buildFieldRow(column, context));
  const gapCount = fields.reduce((total, field) => total + field.gaps.length, table.gaps.length);

  // 文案刻意不说「通过」：缺口数量是**待补充项**的计数，不是结论好坏的背书。
  return {
    table,
    fields,
    trustworthy: true,
    summary: `已覆盖 ${fields.length} 个字段；${gapCount} 处属于能力边界、待补充配置或未达到报告条件（不代表数据没有问题）`,
  };
}
