import { describe, it, expect } from 'vitest';
import { clarificationSchema, issueSchema } from './schemas';

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

  it('拒绝非法的严重度', () => {
    expect(issueSchema.safeParse({ ...validIssue, severity: 'urgent' }).success).toBe(false);
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

  it('检查项标识在这里只要求非空', () => {
    // 是否真实存在由执行器拿 listChecks() 比对 —— 那里才能给出
    // 「不存在的检查项 X。当前可用：…」这种能让模型自我纠正的报错
    expect(issueSchema.safeParse({ ...validIssue, checkId: '我编的' }).success).toBe(true);
    expect(issueSchema.safeParse({ ...validIssue, checkId: '' }).success).toBe(false);
  });
});

describe('追问契约', () => {
  const question = { question: '「重点」指什么？', options: ['重点高中', '省重点'] };
  const optionsOf = (count: number) => Array.from({ length: count }, (_, index) => `选项${index + 1}`);

  it('接受 1 题与 3 题', () => {
    expect(clarificationSchema.safeParse({ questions: [question] }).success).toBe(true);
    expect(
      clarificationSchema.safeParse({ questions: [question, question, question] }).success,
    ).toBe(true);
  });

  it('拒绝 0 题与 4 题 —— 不问，和追问轰炸，都不该发生', () => {
    expect(clarificationSchema.safeParse({ questions: [] }).success).toBe(false);
    expect(
      clarificationSchema.safeParse({ questions: [question, question, question, question] })
        .success,
    ).toBe(false);
  });

  it('单题 120 字是上限，121 字被拒', () => {
    expect(
      clarificationSchema.safeParse({ questions: [{ question: '长'.repeat(120) }] }).success,
    ).toBe(true);
    expect(
      clarificationSchema.safeParse({ questions: [{ question: '长'.repeat(121) }] }).success,
    ).toBe(false);
  });

  it('最多 6 个选项，7 个被拒', () => {
    expect(
      clarificationSchema.safeParse({ questions: [{ question: '选哪个', options: optionsOf(6) }] })
        .success,
    ).toBe(true);
    expect(
      clarificationSchema.safeParse({ questions: [{ question: '选哪个', options: optionsOf(7) }] })
        .success,
    ).toBe(false);
  });

  it('单个选项 60 字是上限，61 字被拒；省略选项时补成空数组', () => {
    expect(
      clarificationSchema.safeParse({
        questions: [{ question: '选哪个', options: ['长'.repeat(60)] }],
      }).success,
    ).toBe(true);
    expect(
      clarificationSchema.safeParse({
        questions: [{ question: '选哪个', options: ['长'.repeat(61)] }],
      }).success,
    ).toBe(false);

    const parsed = clarificationSchema.safeParse({ questions: [{ question: '选哪个' }] });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.questions[0]?.options).toEqual([]);
  });
});
