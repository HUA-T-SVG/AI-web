import type { Dataset, QualityIssue } from '../types';
import { profileColumn } from '../profile';
import { createIssueId } from './id';

export interface MissingOptions {
  /** 缺失率不低于此值判为 high，默认 0.5 */
  highThreshold?: number;
  /** 缺失率不低于此值判为 medium，默认 0.2 */
  lowThreshold?: number;
}

export function checkMissing(dataset: Dataset, options: MissingOptions = {}): QualityIssue[] {
  const highThreshold = options.highThreshold ?? 0.5;
  const lowThreshold = options.lowThreshold ?? 0.2;
  const issues: QualityIssue[] = [];

  for (const column of dataset.columns) {
    const profile = profileColumn(column);
    if (profile.missingCount === 0 || profile.missingRate < lowThreshold) continue;

    const rate = profile.missingRate;
    const allEmpty = rate === 1;

    issues.push({
      id: createIssueId('missing', column.name),
      checkId: 'missing',
      severity: rate >= highThreshold ? 'high' : 'medium',
      title: `「${column.name}」存在缺失值`,
      description: allEmpty
        ? `该列全部 ${profile.missingCount} 个取值均为空，不携带任何信息。`
        : `该列有 ${profile.missingCount} 个缺失值，占 ${(rate * 100).toFixed(1)}%。`,
      evidence: {
        columns: [column.name],
        statistics: {
          missingCount: profile.missingCount,
          missingRate: Number(rate.toFixed(4)),
          totalRows: column.values.length,
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
