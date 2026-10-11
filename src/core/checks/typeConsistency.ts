import type { Dataset, QualityIssue } from '../types';
import { isMissingValue } from '../types';
import { detectShape } from '../profile';
import { parseNumeric } from '../numeric';
import { createIssueId } from './id';

/**
 * 类型一致性检查：识别「本应是数值的列里混进了文本」这类冲突。
 * 只处理 mixed 类型的列 —— 单一类型的列不存在冲突。
 */
export function checkTypeConsistency(dataset: Dataset): QualityIssue[] {
  const issues: QualityIssue[] = [];

  for (const column of dataset.columns) {
    if (detectShape(column) !== 'mixed') continue;

    const present = column.values
      .map((value, index) => ({ value, index }))
      .filter((item) => !isMissingValue(item.value));

    const numeric = present.filter((item) => parseNumeric(item.value) !== null);
    const nonNumeric = present.filter((item) => parseNumeric(item.value) === null);

    // 少数派才是冲突方：数值占多数时，可疑的是文本，反之亦然
    const majorityIsNumeric = numeric.length >= nonNumeric.length;
    const offenders = majorityIsNumeric ? nonNumeric : numeric;
    if (offenders.length === 0) continue;

    const offendingValues = [...new Set(offenders.map((o) => String(o.value)))].slice(0, 5);

    issues.push({
      id: createIssueId('type-consistency', column.name),
      checkId: 'type-consistency',
      severity: 'medium',
      title: `「${column.name}」列中取值类型不一致`,
      description: majorityIsNumeric
        ? `该列以数值为主（${numeric.length} 个），但混入 ${offenders.length} 个非数值取值，统计时整列可能被当作文本处理。`
        : `该列以文本为主（${nonNumeric.length} 个），但混入 ${offenders.length} 个纯数值取值，需确认是否为编码值。`,
      evidence: {
        columns: [column.name],
        rowIndices: offenders.slice(0, 50).map((o) => o.index),
        statistics: {
          offendingCount: offenders.length,
          offendingValues: offendingValues.join('、'),
          numericCount: numeric.length,
          nonNumericCount: nonNumeric.length,
        },
      },
      suggestion: {
        action: 'normalize_type',
        params: { column: column.name, offendingValues },
        rationale: majorityIsNumeric
          ? '先核实这些取值的含义（常见为「未知」「缺失」「拒答」等编码），再决定转为缺失还是保留为分类。'
          : '确认这些数值是否为特殊编码，例如 999、-1 常被用来表示缺失。',
      },
      confidence: 0.9,
    });
  }

  return issues;
}
