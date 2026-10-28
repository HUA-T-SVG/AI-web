import type { Dataset, QualityIssue } from '../types';
import { isMissingValue } from '../types';
import { createIssueId } from './id';

/**
 * 缺失率的两条报告阈值（低 = 当问题报，高 = 判严重）。
 * 导出是为了让覆盖地图与报告引用同一个数：阈值改了，「本次未进行」的判断跟着变，
 * 不能两边各写一份 0.2 / 0.5。
 */
export const DEFAULT_MISSING_LOW_THRESHOLD = 0.2;
export const DEFAULT_MISSING_HIGH_THRESHOLD = 0.5;

export interface MissingOptions {
  /** 缺失率不低于此值判为 high，默认 0.5 */
  highThreshold?: number;
  /** 缺失率不低于此值判为 medium，默认 0.2 */
  lowThreshold?: number;
}

export function checkMissing(dataset: Dataset, options: MissingOptions = {}): QualityIssue[] {
  const highThreshold = options.highThreshold ?? DEFAULT_MISSING_HIGH_THRESHOLD;
  const lowThreshold = options.lowThreshold ?? DEFAULT_MISSING_LOW_THRESHOLD;
  const issues: QualityIssue[] = [];

  for (const column of dataset.columns) {
    const total = column.values.length;
    if (total === 0) continue;

    // 只数缺失个数，不走整轮剖析 —— 后者会对每列重跑一遍类型推断与归一化
    let missingCount = 0;
    for (const value of column.values) {
      if (isMissingValue(value)) missingCount += 1;
    }
    if (missingCount === 0) continue;

    const rate = missingCount / total;
    if (rate < lowThreshold) continue;

    const allEmpty = missingCount === total;

    issues.push({
      id: createIssueId('missing', column.name),
      checkId: 'missing',
      severity: rate >= highThreshold ? 'high' : 'medium',
      title: `「${column.name}」存在缺失值`,
      description: allEmpty
        ? `该列全部 ${missingCount} 个取值均为空，不携带任何信息。`
        : `该列有 ${missingCount} 个缺失值，占 ${(rate * 100).toFixed(1)}%。`,
      evidence: {
        columns: [column.name],
        statistics: {
          missingCount,
          missingRate: Number(rate.toFixed(4)),
          totalRows: total,
        },
      },
      suggestion: {
        action: 'fill_or_drop',
        params: { column: column.name },
        rationale: allEmpty
          ? '全空列无法用于分析，建议删除或补充数据来源。'
          : '先判断缺失机制（完全随机 / 随机 / 非随机）再决定插补还是剔除，直接插补可能引入偏差。',
      },
      confidence: 1,
    });
  }

  return issues;
}
