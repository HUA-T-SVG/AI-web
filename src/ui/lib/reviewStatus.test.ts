import { describe, expect, it } from 'vitest';
import type { QualityIssue } from '@/core';
import type { ReviewItem } from '@/ui/stores/reviewStore';
import {
  REVIEW_STATUS_LABEL,
  reviewItemMatchesIssue,
  reviewStatusOfIssue,
  reviewStatusesOf,
} from './reviewStatus';

function makeIssue(partial: Partial<QualityIssue> & { checkId: string }): QualityIssue {
  return {
    id: partial.id ?? 'issue-0',
    checkId: partial.checkId,
    severity: partial.severity ?? 'medium',
    title: partial.title ?? '规则问题',
    description: partial.description ?? '描述',
    evidence: partial.evidence ?? { columns: ['年龄'], statistics: {} },
    suggestion: partial.suggestion,
    confidence: partial.confidence ?? 0.8,
  };
}

function makeItem(
  partial: Partial<ReviewItem> & {
    checkId: string;
    columns: string[];
    decision: ReviewItem['decision'];
  },
): ReviewItem {
  return {
    id: partial.id ?? 'review-0',
    decision: partial.decision,
    issue: {
      checkId: partial.checkId,
      severity: 'medium',
      title: 'AI 建议',
      description: '描述',
      columns: partial.columns,
      suggestion: {
        action: 'review_something',
        params: {},
        rationale: '理由',
        columns: partial.columns,
      },
      confidence: 0.8,
    },
    note: partial.note,
    override: partial.override,
  };
}

/**
 * 复核状态怎么从 AI 建议关联到规则问题。
 *
 * 检查页列的是八项确定性检查产出的问题，复核状态却挂在 AI 建议上，
 * 两者只能靠「同一检查项 + 同一字段」对齐。这组测试守的就是这条对齐规则：
 * 放宽了会把不相干的状态标到问题上，收紧了会出现「明明复核过却显示待确认」。
 */
describe('规则问题与 AI 建议的关联', () => {
  it('检查项与字段都相同才认定为同一条问题', () => {
    const rule = makeIssue({ checkId: 'outliers', evidence: { columns: ['年龄'], statistics: {} } });
    const item = makeItem({ checkId: 'outliers', columns: ['年龄'], decision: 'pending' });

    expect(reviewItemMatchesIssue(item, rule)).toBe(true);
  });

  it('检查项不同就不算同一条，哪怕字段碰巧相同', () => {
    const rule = makeIssue({ checkId: 'duplicates', evidence: { columns: ['年龄'], statistics: {} } });
    const item = makeItem({ checkId: 'outliers', columns: ['年龄'], decision: 'pending' });

    expect(reviewItemMatchesIssue(item, rule)).toBe(false);
  });

  it('检查项相同但字段不相交，也不算同一条', () => {
    const rule = makeIssue({ checkId: 'duplicates', evidence: { columns: ['学号'], statistics: {} } });
    const item = makeItem({ checkId: 'duplicates', columns: ['备注'], decision: 'pending' });

    expect(reviewItemMatchesIssue(item, rule)).toBe(false);
  });

  it('AI 建议没限定字段时，视为对该检查项的整表建议', () => {
    const rule = makeIssue({ checkId: 'duplicates', evidence: { columns: ['学号'], statistics: {} } });
    const item = makeItem({ checkId: 'duplicates', columns: [], decision: 'pending' });

    expect(reviewItemMatchesIssue(item, rule)).toBe(true);
  });

  it('规则问题是表级（没有字段）时，同检查项的建议都算关联', () => {
    const rule = makeIssue({ checkId: 'type-consistency', evidence: { columns: [], statistics: {} } });
    const item = makeItem({ checkId: 'type-consistency', columns: ['年龄'], decision: 'pending' });

    expect(reviewItemMatchesIssue(item, rule)).toBe(true);
  });
});

describe('规则问题的复核状态', () => {
  const rule = makeIssue({ checkId: 'outliers', evidence: { columns: ['年龄'], statistics: {} } });
  const pending = makeItem({ id: 'a', checkId: 'outliers', columns: ['年龄'], decision: 'pending' });
  const accepted = makeItem({ id: 'b', checkId: 'outliers', columns: ['年龄'], decision: 'accepted' });
  const modified = makeItem({ id: 'c', checkId: 'outliers', columns: ['年龄'], decision: 'modified' });
  const rejected = makeItem({ id: 'd', checkId: 'outliers', columns: ['年龄'], decision: 'rejected' });

  it('没有对应的 AI 建议时不给状态 —— 不能凭空说「待确认」', () => {
    expect(reviewStatusOfIssue(rule, [], false)).toBeNull();
  });

  it('待确认、已接受、已拒绝各自映射到对应状态', () => {
    expect(reviewStatusOfIssue(rule, [pending], false)).toBe('pending');
    expect(reviewStatusOfIssue(rule, [accepted], false)).toBe('accepted');
    expect(reviewStatusOfIssue(rule, [rejected], false)).toBe('rejected');
  });

  it('「修改参数后执行」在筛选上归入已接受', () => {
    expect(reviewStatusOfIssue(rule, [modified], false)).toBe('accepted');
  });

  it('已执行批次里被接受的条目显示为已执行，被拒绝的仍是已拒绝', () => {
    expect(reviewStatusOfIssue(rule, [accepted], true)).toBe('executed');
    expect(reviewStatusOfIssue(rule, [modified], true)).toBe('executed');
    expect(reviewStatusOfIssue(rule, [rejected], true)).toBe('rejected');
  });

  it('同一检查项下还有未处理的建议时，优先显示待确认', () => {
    expect(reviewStatusOfIssue(rule, [accepted, pending], false)).toBe('pending');
  });

  it('批量生成时保留每条问题的键；对不上的写 null', () => {
    const other = makeIssue({ id: 'issue-1', checkId: 'duplicates' });
    const statuses = reviewStatusesOf([rule, other], [accepted], true);

    expect(statuses).toEqual({ 'issue-0': 'executed', 'issue-1': null });
  });

  it('状态文案与设计文档的筛选词一致', () => {
    expect(REVIEW_STATUS_LABEL).toEqual({
      pending: '待确认',
      accepted: '已接受',
      rejected: '已拒绝',
      executed: '已执行',
    });
  });
});
