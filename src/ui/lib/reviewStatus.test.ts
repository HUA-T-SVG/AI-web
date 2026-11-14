import { describe, expect, it } from 'vitest';
import type { QualityIssue } from '@/core';
import type { ReviewItem } from '@/ui/stores/reviewStore';
import { reviewStatusesOf } from './reviewStatus';

const rule: QualityIssue = {
  id: 'range-rules-score-0', checkId: 'range-rules', severity: 'high',
  title: '成绩超限', description: '描述', confidence: 1,
  evidence: { columns: ['成绩'], rowIndices: [0, 2], statistics: { columnNumber: 2, ruleId: 'score' } },
};

function item(check: QualityIssue | undefined, execution?: ReviewItem['execution']): ReviewItem {
  return {
    id: 'review-1', decision: 'accepted', execution,
    issue: { checkId: rule.checkId, severity: 'medium', title: 'AI 建议', description: '描述',
      columns: ['成绩'], confidence: 0.9,
      suggestion: { action: 'review_range_violations', params: {}, columns: ['成绩'], rationale: '人工核查' } },
    evidence: { rules: [], invalidCheck: false, invalidRules: 0,
      check: check && { ...check, columnIndex: 1 } },
  };
}

describe('检查页复核状态', () => {
  it('只绑定引用的具体行和规则；同列同类型的其它问题不继承状态', () => {
    const otherRows = { ...rule, id: 'other-rows', evidence: { ...rule.evidence, rowIndices: [1, 2] } };
    const otherRule = { ...rule, id: 'other-rule', evidence: { ...rule.evidence,
      statistics: { ...rule.evidence.statistics, ruleId: 'score-2' } } };
    // 工作表子集里的列序号会变；证据记录的原表序号仍为 1。
    const partial = { ...rule, id: 'subtable-score-0', evidence: { ...rule.evidence, rowIndices: [2, 0] } };
    expect(reviewStatusesOf([rule, otherRows, otherRule], [item(partial, { status: 'executed', version: 2 })], 2))
      .toEqual({ [rule.id]: 'executed', [otherRows.id]: null, [otherRule.id]: null });
    expect(reviewStatusesOf([rule], [item(undefined)], 2)[rule.id]).toBeNull();
  });

  it('只认该版本的逐条动作结果，无改动和失败不会显示成已执行', () => {
    const status = (entry: ReviewItem, version = 2) => reviewStatusesOf([rule], [entry], version)[rule.id];
    expect(status(item(rule, { status: 'executed', version: 1 }))).toBe('accepted');
    expect(status(item(rule, { status: 'unchanged', version: 2 }))).toBe('unchanged');
    expect(status(item(rule, { status: 'skipped', version: 2, reason: '动作无法执行' }))).toBe('skipped');
    expect(status({ ...item(rule), decision: 'rejected' })).toBe('rejected');
  });

  it('本地检查和 AI 检查独立运行，忽略各自分配的临时流水号', () => {
    const duplicate = { ...rule, checkId: 'duplicates', id: 'duplicates:0-2:15' };
    const citation = { ...duplicate, id: 'duplicates:0-2:31' };
    const unrelated = { ...duplicate, id: 'duplicates:0-2:16',
      evidence: { ...duplicate.evidence, rowIndices: [0, 3] } };
    expect(reviewStatusesOf([duplicate, unrelated], [item(citation)], 2))
      .toEqual({ [duplicate.id]: 'accepted', [unrelated.id]: null });
  });
});
