import type { Dataset, QualityIssue } from '../types';
import { isMissingValue } from '../types';
import { parseNumeric } from '../numeric';
import { createIssueId } from './id';

/** 值域规则：声明某列取值的合理区间，闭区间 */
export interface RangeRule {
  id: string;
  column: string;
  min?: number;
  max?: number;
  /** 规则依据，例如「人类年龄的合理范围」或国标出处 */
  rationale?: string;
}

export function checkRangeRules(dataset: Dataset, rules: RangeRule[]): QualityIssue[] {
  const issues: QualityIssue[] = [];

  for (const rule of rules) {
    const column = dataset.columns.find((c) => c.name === rule.column);
    if (!column) continue;

    const violations: { index: number; value: number }[] = [];
    for (let i = 0; i < column.values.length; i += 1) {
      const raw = column.values[i];
      if (isMissingValue(raw)) continue;

      const value = parseNumeric(raw);
      if (value === null) continue;

      if (rule.min !== undefined && value < rule.min) violations.push({ index: i, value });
      else if (rule.max !== undefined && value > rule.max) violations.push({ index: i, value });
    }

    if (violations.length === 0) continue;

    const bounds = [
      rule.min !== undefined ? `下界 ${rule.min}` : null,
      rule.max !== undefined ? `上界 ${rule.max}` : null,
    ]
      .filter(Boolean)
      .join('，');

    issues.push({
      id: createIssueId('range-rules', `${rule.id}-${rule.column}`),
      checkId: 'range-rules',
      severity: 'high',
      title: `「${rule.column}」有 ${violations.length} 个取值超出合理范围`,
      description: `按规则「${rule.id}」的界定（${bounds}），下列取值不合理，通常意味着录入错误，或者缺失编码没有被识别出来。`,
      evidence: {
        columns: [rule.column],
        rowIndices: violations.map((v) => v.index),
        statistics: {
          violationCount: violations.length,
          ruleId: rule.id,
          values: [...new Set(violations.map((v) => v.value))].slice(0, 5).join('、'),
        },
      },
      suggestion: {
        action: 'review_range_violations',
        params: { column: rule.column, ruleId: rule.id },
        rationale: rule.rationale ?? '请核对原始记录，确认是录入错误还是缺失编码。',
      },
      confidence: 0.95,
    });
  }

  return issues;
}
