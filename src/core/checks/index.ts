import type { Dataset, QualityIssue, Severity } from '../types';
import { checkMissing, type MissingOptions } from './missing';
import { checkDuplicates, type DuplicateOptions } from './duplicates';
import { checkTypeConsistency } from './typeConsistency';
import { checkOutliers, type OutlierOptions } from './outliers';
import { checkRangeRules, type RangeRule } from './rangeRules';

export interface RunChecksOptions {
  /** 只运行这些检查项；缺省时运行全部 */
  enabled?: string[];
  missing?: MissingOptions;
  duplicates?: DuplicateOptions;
  outliers?: OutlierOptions;
  rangeRules?: RangeRule[];
}

const SEVERITY_ORDER: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

/**
 * 执行全部已启用的检查并合并结果，按严重度排序。
 *
 * 单个检查抛异常时被捕获并跳过，不影响其余检查 —— 数据里总会有
 * 意料之外的形态，一处失败不该让整份报告出不来。
 */
export function runAllChecks(
  dataset: Dataset,
  options: RunChecksOptions = {},
): QualityIssue[] {
  const enabled = options.enabled;
  const isEnabled = (id: string) => enabled === undefined || enabled.includes(id);

  const checks: { id: string; run: () => QualityIssue[] }[] = [
    { id: 'missing', run: () => checkMissing(dataset, options.missing) },
    { id: 'duplicates', run: () => checkDuplicates(dataset, options.duplicates) },
    { id: 'type-consistency', run: () => checkTypeConsistency(dataset) },
    { id: 'outliers', run: () => checkOutliers(dataset, options.outliers) },
    { id: 'range-rules', run: () => checkRangeRules(dataset, options.rangeRules ?? []) },
  ];

  const issues: QualityIssue[] = [];
  for (const check of checks) {
    if (!isEnabled(check.id)) continue;
    try {
      issues.push(...check.run());
    } catch (error) {
      console.error(`[core] 检查项 ${check.id} 执行失败，已跳过：`, error);
    }
  }

  return issues.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

export { checkMissing, checkDuplicates, checkTypeConsistency, checkOutliers, checkRangeRules };
export type { MissingOptions, DuplicateOptions, OutlierOptions, RangeRule };
export type { OutlierMethod } from './outliers';
