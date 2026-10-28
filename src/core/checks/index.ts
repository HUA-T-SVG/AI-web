import type { CheckFn, Dataset, QualityIssue, Severity } from '../types';
import { checkDuplicateColumnNames } from './columnNames';
import { checkMissing, type MissingOptions } from './missing';
import { checkDuplicates, type DuplicateOptions } from './duplicates';
import { checkTypeConsistency } from './typeConsistency';
import { checkOutliers, type OutlierOptions } from './outliers';
import { checkRangeRules, type RangeRule } from './rangeRules';
import { checkUnitConsistency } from './units';
import { checkCategorySynonyms } from '../synonyms';
import type { SynonymThresholds } from '../synonyms';
import { createIssueId } from './id';

/** 一个可调度的检查项 */
export interface CheckDefinition {
  id: string;
  /** 一句话说明这一项在查什么，给人和大模型看 */
  title: string;
  description: string;
  run: CheckFn;
}

/** 对外暴露的检查项元数据，不含执行函数 */
export interface CheckInfo {
  id: string;
  title: string;
  description: string;
}

export interface RunChecksOptions {
  /** 只运行这些检查项；缺省时运行全部。传入未知标识会抛错。 */
  enabled?: string[];
  missing?: MissingOptions;
  duplicates?: DuplicateOptions;
  outliers?: OutlierOptions;
  rangeRules?: RangeRule[];
  /**
   * 类别归并的参数。
   *
   * 向量由调用方算好传进来 —— core 不做 embedding（那是平台相关且异步的，
   * 会破坏 `src/core/platform.test.ts` 守着的「core 平台无关」）。
   * 不传向量时这一项仍然工作，只是少了 L3 的佐证：L1/L2 能定的照样能定。
   */
  synonyms?: {
    thresholds?: Partial<SynonymThresholds>;
    vectors?: Map<string, number[]>;
    maxUniqueValues?: number;
  };
  /** 追加自定义检查项，主要供测试注入故障与扩展使用 */
  extraChecks?: CheckDefinition[];
}

const SEVERITY_ORDER: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

function buildChecks(options: RunChecksOptions): CheckDefinition[] {
  return [
    // 重名列放最前：它会让其余按列名定位的检查失去意义
    {
      id: 'duplicate-column-names',
      title: '列名重复',
      description: '表头里出现了两个同名列，会让按列名定位的后续检查失去意义。',
      run: (ds) => checkDuplicateColumnNames(ds),
    },
    {
      id: 'missing',
      title: '缺失值',
      description: '统计各列缺失率，并区分随机缺失与按其他列分组的系统性缺失。',
      run: (ds) => checkMissing(ds, options.missing),
    },
    {
      id: 'duplicates',
      title: '重复记录',
      description: '检出完全重复的行，以及键字段高度相似但写法不同的模糊重复。',
      run: (ds) => checkDuplicates(ds, options.duplicates),
    },
    {
      id: 'type-consistency',
      title: '类型一致性',
      description: '识别「数值列里混进文本」「同一列既有日期又有数字」这类类型冲突。',
      run: (ds) => checkTypeConsistency(ds),
    },
    {
      id: 'outliers',
      title: '异常值',
      description: '用 IQR、Z 分数、修正 Z 分数三种方法分别检出数值异常，便于交叉印证。',
      run: (ds) => checkOutliers(ds, options.outliers),
    },
    {
      id: 'range-rules',
      title: '值域越界',
      description:
        '按领域规则检查取值是否符合适用范围：数值列检查区间（例如年龄 0–120），分类列检查允许取值清单（例如学历只允许 本科/硕士/博士）。',
      run: (ds) => checkRangeRules(ds, options.rangeRules ?? []),
    },
    {
      id: 'unit-consistency',
      title: '单位混用',
      description:
        '同一列里混用了不同量级（mg／g）或不同量纲（cm／kg）的单位，' +
        '或一部分取值带单位、一部分不带。混用会让该列的均值与最值整体失真。',
      run: (ds) => checkUnitConsistency(ds),
    },
    {
      id: 'category-synonyms',
      title: '类别同义写法',
      description:
        '检出同一类别的多种写法（如「硕士／硕士研究生」）。字面层能定的直接建议归并；' +
        '字面零重叠但语义相近的（如「硕士／研究生」）只作为「待确认」提出，需人工判断。',
      run: (ds) => checkCategorySynonyms(ds, options.synonyms),
    },
    ...(options.extraChecks ?? []),
  ];
}

/**
 * 当前可用的检查项清单。
 *
 * 阶段 2（规划）要把它交给大模型，让它决定这份数据该重点查什么。
 * 清单从 buildChecks 动态导出而不另写一份常量：新增检查项时只改一处，
 * 提示词与工具清单会自动跟上，不会出现「模型以为能查、实际查不了」。
 *
 * 不含 extraChecks —— 那是调用方临时注入的东西，不属于产品能力，
 * 出现在交给模型的清单里会让它计划一项根本不存在的检查。
 */
export function listChecks(): CheckInfo[] {
  return buildChecks({}).map(({ id, title, description }) => ({ id, title, description }));
}

/**
 * 单个检查抛错时产出的诊断问题。
 *
 * 之所以要变成一条可见的问题，而不是只打日志：检查崩掉与「没发现问题」
 * 在返回值上必须能区分开，否则用户会看到一份错误的「全部合格」报告。
 */
function checkFailedIssue(checkId: string, error: unknown): QualityIssue {
  return {
    id: createIssueId('check-failed', checkId),
    checkId: 'check-failed',
    severity: 'high',
    title: `检查项「${checkId}」未能完成`,
    description: '该项检查执行过程中出错，其结果未包含在本报告中。其余检查不受影响。',
    evidence: {
      columns: [],
      statistics: {
        failedCheckId: checkId,
        reason: error instanceof Error ? error.message : String(error),
      },
    },
    confidence: 1,
  };
}

/**
 * 执行全部已启用的检查并合并结果，按严重度排序。
 *
 * 单个检查失败不会中断整体 —— 数据里总有意料之外的形态，一处出错
 * 不该让整份报告出不来。
 */
export function runAllChecks(
  dataset: Dataset,
  options: RunChecksOptions = {},
): QualityIssue[] {
  const checks = buildChecks(options);
  const enabled = options.enabled;

  if (enabled !== undefined) {
    const known = new Set(checks.map((check) => check.id));
    const unknown = enabled.filter((id) => !known.has(id));
    if (unknown.length > 0) {
      // 静默忽略会让工具分发层的一个拼写错误看起来像「数据很干净」
      throw new Error(
        `未知的检查项标识：${unknown.join('、')}。可用项：${[...known].join('、')}`,
      );
    }
  }

  const issues: QualityIssue[] = [];
  for (const check of checks) {
    if (enabled !== undefined && !enabled.includes(check.id)) continue;
    try {
      issues.push(...check.run(dataset));
    } catch (error) {
      issues.push(checkFailedIssue(check.id, error));
    }
  }

  return issues.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

export { checkDuplicateColumnNames, checkMissing, checkDuplicates, checkTypeConsistency, checkOutliers, checkRangeRules };
export type { MissingOptions, DuplicateOptions, OutlierOptions, RangeRule };
export type { OutlierMethod } from './outliers';
/**
 * 覆盖地图与报告要引用同一组阈值：core 因为样本量/缺失率不足而不判定时，
 * 那边必须写「本次未进行」，不能写成「已检查」。
 */
export { MIN_OUTLIER_OBSERVATIONS } from './outliers';
export { DEFAULT_MISSING_HIGH_THRESHOLD, DEFAULT_MISSING_LOW_THRESHOLD } from './missing';
