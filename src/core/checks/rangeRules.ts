import type { Dataset, QualityIssue } from '../types';
import { isMissingValue } from '../types';
import { parseNumeric } from '../numeric';
import { createIssueId } from './id';

/** 值域规则：声明某列取值的合理范围与/或允许取值清单 */
export interface RangeRule {
  id: string;
  column: string;
  /** 数值下界（闭区间），对可解析为数字的取值生效 */
  min?: number;
  /** 数值上界（闭区间） */
  max?: number;
  /**
   * 允许取值清单（用于分类列，例如「学历」的合法取值）。
   *
   * 与 min/max 可以同时存在，但同一列通常只用一种：数值列用区间，
   * 分类列用清单。比较前会 trim；缺失值不参与。
   */
  allowedValues?: string[];
  /** 规则依据，例如「人类年龄的合理范围」或国标出处 */
  rationale?: string;
}

/**
 * 按用户配置的适用范围检查一列。
 *
 * 两种判据各管一类列：
 *   - `min/max`：数值区间（混杂列里能解析成数字的取值才参与，文本取值跳过）；
 *   - `allowedValues`：分类列的合法取值清单（trim 后逐字比较）。
 *
 * 同一列两种都配置时合并成一条问题，而不是同一列报两条 —— 用户看到的应当
 * 是「这一列有 N 个值不合规」，不该因为配置了两种判据就被计两次。
 */
export function checkRangeRules(dataset: Dataset, rules: RangeRule[]): QualityIssue[] {
  const issues: QualityIssue[] = [];

  for (const rule of rules) {
    // 同名列可能不止一个，规则对每一列都要生效；用下标区分问题 ID
    const matches = dataset.columns
      .map((column, index) => ({ column, index }))
      .filter((item) => item.column.name === rule.column);

    const allowed = (rule.allowedValues ?? []).map((value) => value.trim()).filter(Boolean);
    const hasAllowed = allowed.length > 0;
    const allowedSet = new Set(allowed);
    const hasBound = rule.min !== undefined || rule.max !== undefined;

    // 配置了一个既无数值区间、又无允许清单的规则没有意义：跳过而不是报空问题
    if (!hasAllowed && !hasBound) continue;

    for (const { column, index: columnIndex } of matches) {
      const numericViolations: { index: number; value: number }[] = [];
      const allowedViolations: { index: number; value: string }[] = [];

      for (let i = 0; i < column.values.length; i += 1) {
        const raw = column.values[i];
        if (isMissingValue(raw)) continue;

        if (hasBound) {
          const value = parseNumeric(raw);
          if (value !== null) {
            if (rule.min !== undefined && value < rule.min) numericViolations.push({ index: i, value });
            else if (rule.max !== undefined && value > rule.max) {
              numericViolations.push({ index: i, value });
            }
          }
        }

        if (hasAllowed) {
          // 分类列按「去掉首尾空白后的字符串」比较：`本科 ` 与 `本科` 是同一个取值
          const text = String(raw).trim();
          if (!allowedSet.has(text)) allowedViolations.push({ index: i, value: text });
        }
      }

      if (numericViolations.length === 0 && allowedViolations.length === 0) continue;

      // 同一行可能同时踩中两种判据：行号去重，顺序按原始行序
      const rowIndices = [...new Set([
        ...numericViolations.map((item) => item.index),
        ...allowedViolations.map((item) => item.index),
      ])].sort((left, right) => left - right);

      const bounds = [
        rule.min !== undefined ? `下界 ${rule.min}` : null,
        rule.max !== undefined ? `上界 ${rule.max}` : null,
      ]
        .filter(Boolean)
        .join('，');
      const allowedText = hasAllowed ? `允许取值：${allowed.join('、')}` : '';
      const ruleText = [bounds, allowedText].filter(Boolean).join('；');
      const violationCount = rowIndices.length;

      const title =
        hasAllowed && hasBound
          ? `「${rule.column}」有 ${violationCount} 个取值不符合适用范围`
          : hasAllowed
            ? `「${rule.column}」有 ${violationCount} 个取值不在允许清单内`
            : `「${rule.column}」有 ${violationCount} 个取值超出合理范围`;

      const examples = [
        ...new Set([
          ...numericViolations.map((item) => String(item.value)),
          ...allowedViolations.map((item) => item.value),
        ]),
      ].slice(0, 5);

      issues.push({
        id: createIssueId('range-rules', `${rule.id}-${columnIndex}`),
        checkId: 'range-rules',
        severity: 'high',
        title,
        description:
          `按规则「${rule.id}」的界定（${ruleText}），下列取值不符合适用范围，` +
          `通常意味着录入错误、缺失编码没有被识别出来，或者该取值不在业务允许清单内。`,
        evidence: {
          columns: [rule.column],
          rowIndices,
          statistics: {
            violationCount,
            ruleId: rule.id,
            // 证据是给人看的：列序号与界面其它地方一致从 1 起。
            // 行下标仍在 rowIndices 里保持 0 基，由展示层 +1（内部统一的约定）
            columnNumber: columnIndex + 1,
            values: examples.join('、'),
            ...(hasAllowed ? { allowedValues: allowed.join('、') } : {}),
          },
        },
        suggestion: {
          action: 'review_range_violations',
          // 动作参数同样用 1 基，避免同一个问题在证据与动作里给出两套序号
          params: {
            column: rule.column,
            columnNumber: columnIndex + 1,
            ruleId: rule.id,
            ...(hasAllowed ? { allowedValues: allowed } : {}),
          },
          rationale: rule.rationale ?? '请核对原始记录，确认是录入错误还是缺失编码。',
        },
        confidence: 0.95,
      });
    }
  }

  return issues;
}
