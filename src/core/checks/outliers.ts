import type { Dataset, QualityIssue } from '../types';
import { detectShape } from '../profile';
import { parseNumeric } from '../numeric';
import { iqrBounds, modifiedZScoresOf, zScoresOf } from '../stats';
import { createIssueId } from './id';

export type OutlierMethod = 'iqr' | 'z' | 'modified-z';

export interface OutlierOptions {
  method?: OutlierMethod;
}

/** 修正 Z 分数的经验阈值，Iglewicz–Hoaglin 建议取 3.5 */
const MODIFIED_Z_THRESHOLD = 3.5;
const Z_THRESHOLD = 3;

/** 少于该观测数时四分位数不稳定，不做判断 */
const MIN_OBSERVATIONS = 4;

export function checkOutliers(
  dataset: Dataset,
  options: OutlierOptions = {},
): QualityIssue[] {
  const method = options.method ?? 'iqr';
  const issues: QualityIssue[] = [];

  for (const column of dataset.columns) {
    // detectShape 不会为判定 category/text 而归一化整列文本，比 inferColumnType 省一遍
    if (detectShape(column) !== 'number') continue;

    const observed = column.values
      .map((value, index) => ({ value: parseNumeric(value), index }))
      .filter((item): item is { value: number; index: number } => item.value !== null);

    if (observed.length < MIN_OBSERVATIONS) continue;

    const numbers = observed.map((item) => item.value);
    const flags = flagOutliers(numbers, method);
    const outlierRows = observed.filter((_, i) => flags[i]).map((item) => item.index);
    if (outlierRows.length === 0) continue;

    const outlierValues = numbers.filter((_, i) => flags[i]);

    issues.push({
      id: createIssueId('outliers', column.name),
      checkId: 'outliers',
      severity: 'medium',
      title: `「${column.name}」列检出 ${outlierRows.length} 个异常值`,
      description:
        '这些取值明显偏离该列的其余观测。可能是录入错误，也可能是真实的极端情况，需结合实际语境判断。',
      evidence: {
        columns: [column.name],
        rowIndices: outlierRows,
        statistics: {
          outlierCount: outlierRows.length,
          method,
          min: Math.min(...outlierValues),
          max: Math.max(...outlierValues),
          observedCount: observed.length,
        },
      },
      suggestion: {
        action: 'review_outliers',
        params: { column: column.name, rowIndices: outlierRows, method },
        rationale:
          '不建议直接删除。先核对原始记录：录入错误就更正，真实极端值应保留并在分析中说明。',
      },
      confidence: 0.8,
    });
  }

  return issues;
}

function flagOutliers(numbers: readonly number[], method: OutlierMethod): boolean[] {
  if (method === 'iqr') {
    const { lower, upper } = iqrBounds(numbers);
    return numbers.map((n) => n < lower || n > upper);
  }
  if (method === 'z') {
    return zScoresOf(numbers).map((z) => Math.abs(z) > Z_THRESHOLD);
  }
  return modifiedZScoresOf(numbers).map((z) => Math.abs(z) > MODIFIED_Z_THRESHOLD);
}
