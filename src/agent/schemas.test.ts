import { describe, it, expect } from 'vitest';
import { checkPlanSchema, issueSchema } from './schemas';

describe('检查计划契约', () => {
  it('接受合法计划', () => {
    const result = checkPlanSchema.safeParse({
      reasoning: '年龄跨度大，先看异常值；学历取值有同义写法。',
      checks: [
        { checkId: 'outliers', columns: ['年龄'], priority: 'high' },
        { checkId: 'duplicates', columns: [], priority: 'medium' },
      ],
    });

    expect(result.success).toBe(true);
  });

  it('拒绝不存在的检查项', () => {
    const result = checkPlanSchema.safeParse({
      reasoning: '随便查查',
      checks: [{ checkId: 'check_unit_consistency', columns: ['单位'], priority: 'high' }],
    });

    // 这项在 core 里还没实现。放过去会变成「模型说查了、结果里却没有」，
    // 而界面上看不出哪里不对 —— 必须在契约层就拦掉。
    expect(result.success).toBe(false);
  });

  it('拒绝空计划：什么都不查等于没分析', () => {
    expect(checkPlanSchema.safeParse({ reasoning: '数据挺干净', checks: [] }).success).toBe(false);
  });

  it('数量上限拦住「全量跑一遍」', () => {
    const result = checkPlanSchema.safeParse({
      reasoning: '全都查一遍',
      checks: Array.from({ length: 20 }, () => ({
        checkId: 'missing',
        columns: [],
        priority: 'low',
      })),
    });

    // 上限的意义不是省时间，是逼模型做取舍 ——
    // 「所有检查都跑一遍」等于没有规划，而规划正是阶段 2 存在的理由
    expect(result.success).toBe(false);
  });

  it('拒绝空的规划理由', () => {
    const result = checkPlanSchema.safeParse({
      reasoning: '',
      checks: [{ checkId: 'missing', columns: [], priority: 'high' }],
    });

    expect(result.success).toBe(false);
  });

  it('拒绝非法的优先级', () => {
    const result = checkPlanSchema.safeParse({
      reasoning: '看看缺失',
      checks: [{ checkId: 'missing', columns: [], priority: 'urgent' }],
    });

    expect(result.success).toBe(false);
  });
});

describe('单条问题契约', () => {
  const validIssue = {
    checkId: 'range-rules',
    severity: 'high',
    title: '年龄有 2 个越界值',
    description: '年龄列出现 999 与 -1。',
    columns: ['年龄'],
    suggestion: {
      action: 'review_range_violations',
      rationale: '疑似录入错误',
      columns: ['年龄'],
    },
    confidence: 0.9,
  };

  it('接受一条合法问题', () => {
    expect(issueSchema.safeParse(validIssue).success).toBe(true);
  });

  it('拒绝没有建议的问题：只说有问题不给办法，用户没法往下走', () => {
    const { suggestion, ...withoutSuggestion } = validIssue;

    expect(issueSchema.safeParse(withoutSuggestion).success).toBe(false);
  });

  it('建议里的理由不能为空', () => {
    const result = issueSchema.safeParse({
      ...validIssue,
      suggestion: { ...validIssue.suggestion, rationale: '' },
    });

    expect(result.success).toBe(false);
  });

  it('建议省略 params 时补成空对象，而不是报错', () => {
    const result = issueSchema.safeParse(validIssue);

    expect(result.success).toBe(true);
    if (result.success) {
      // 校验通过之后，下游拿到的 params 一定是对象，不用再判 undefined
      expect(result.data.suggestion.params).toEqual({});
    }
  });

  it('置信度必须在 0 到 1 之间', () => {
    for (const confidence of [-0.1, 1.1]) {
      expect(issueSchema.safeParse({ ...validIssue, confidence }).success).toBe(false);
    }
  });

  it('行下标不接受负数', () => {
    expect(issueSchema.safeParse({ ...validIssue, rowIndices: [-1] }).success).toBe(false);
  });

  it('超长的标题与描述被拒 —— 这是链路的可靠性边界', () => {
    // 单次工具调用载荷太大时，工具输入会流不完、永远停在 input-streaming，
    // 用户一条结论都拿不到（真模型实测过）。长度上限就是防这个的。
    expect(issueSchema.safeParse({ ...validIssue, title: '长'.repeat(61) }).success).toBe(false);
    expect(issueSchema.safeParse({ ...validIssue, description: '长'.repeat(301) }).success).toBe(
      false,
    );
  });

  it('恰好等于上限的长度是允许的', () => {
    expect(issueSchema.safeParse({ ...validIssue, title: '长'.repeat(60) }).success).toBe(true);
  });
});
