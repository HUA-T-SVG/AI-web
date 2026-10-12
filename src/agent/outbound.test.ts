import { describe, it, expect } from 'vitest';
import type { ColumnProfile, QualityIssue } from '@/core';
import { columnDetailForModel, issueForModel } from './outbound';

describe('列画像的出站塑形', () => {
  const column: ColumnProfile = {
    name: '备注',
    type: 'text',
    missingCount: 1,
    missingRate: 0.25,
    uniqueCount: 3,
    samples: ['张伟', '李娜', '王芳'],
  };

  it('样例只给形状，不给原文', () => {
    const detail = columnDetailForModel(column);

    expect(detail.sampleShapes).toEqual(['2 个中文字符', '2 个中文字符', '2 个中文字符']);
    expect(JSON.stringify(detail)).not.toContain('张伟');
  });

  it('连 samples 这个字段本身都不再出现 —— 白名单重建，不是挑着删', () => {
    // 挑着删的话，core 哪天多写一个带原值的字段就会静悄悄漏出去
    expect(columnDetailForModel(column)).not.toHaveProperty('samples');
  });

  it('聚合量与统计口径照旧', () => {
    const detail = columnDetailForModel(column);

    expect(detail.name).toBe('备注');
    expect(detail.type).toBe('text');
    expect(detail.missingCount).toBe(1);
    expect(detail.missingRate).toBe(0.25);
    expect(detail.uniqueCount).toBe(3);
  });

  it('分类列的取值分布保留原始写法', () => {
    // 类别归并必须看得见「硕士 / 研究生」的差异，抹掉这个功能就不成立
    const category: ColumnProfile = {
      ...column,
      type: 'category',
      valueDistribution: { 硕士: 88, 研究生: 7 },
    };

    expect(columnDetailForModel(category).distribution).toEqual({ 硕士: 88, 研究生: 7 });
  });

  it('数值列的聚合量原样带出', () => {
    const numeric: ColumnProfile = {
      ...column,
      type: 'number',
      numeric: { min: 17, max: 99, mean: 23.4, q1: 20, median: 22, q3: 26, stdDev: 4.2 },
    };

    expect(columnDetailForModel(numeric).numeric?.max).toBe(99);
  });

  it('缺失率保留四位小数，不至于把 0.0321 显示成一长串', () => {
    expect(columnDetailForModel({ ...column, missingRate: 0.03214999 }).missingRate).toBe(0.0321);
  });
});

describe('问题的出站塑形', () => {
  const issue: QualityIssue = {
    id: 'type-consistency:编号',
    checkId: 'type-consistency',
    severity: 'medium',
    title: '「编号」列中取值类型不一致',
    description: '该列以数值为主（5 个），但混入 1 个非数值取值。',
    evidence: {
      columns: ['编号'],
      rowIndices: [1, 4, 7],
      statistics: {
        offendingCount: 3,
        offendingValues: '内部代号XYZ、甲、乙',
        numericCount: 5,
        rate: 0.5,
      },
    },
    suggestion: {
      action: 'normalize_type',
      params: { column: '编号', offendingValues: ['内部代号XYZ'] },
      rationale: '先核实这些取值的含义，再决定转为缺失还是保留为分类。',
    },
    confidence: 0.9,
  };

  it('字符串统计量一律丢掉 —— offendingValues 就是原始取值的集合', () => {
    const shaped = issueForModel(issue);

    expect(shaped.statistics).not.toHaveProperty('offendingValues');
    expect(JSON.stringify(shaped)).not.toContain('内部代号XYZ');
  });

  it('数值型统计量保留，模型据此判断严重程度', () => {
    const shaped = issueForModel(issue);

    expect(shaped.statistics).toEqual({ offendingCount: 3, numericCount: 5, rate: 0.5 });
  });

  it('行下标只换成行数', () => {
    const shaped = issueForModel(issue);

    expect(shaped.affectedRowCount).toBe(3);
    expect(shaped).not.toHaveProperty('rowIndices');
  });

  it('建议只带动作与理由，不带机器参数', () => {
    // params 是给执行器用的，模型判断问题用不到；不放行就不必担心夹带原值
    const shaped = issueForModel(issue);

    expect(shaped.suggestion).toEqual({
      action: 'normalize_type',
      rationale: '先核实这些取值的含义，再决定转为缺失还是保留为分类。',
    });
    expect(shaped.suggestion).not.toHaveProperty('params');
  });

  it('问题本身的判断依据照常带出', () => {
    const shaped = issueForModel(issue);

    expect(shaped.checkId).toBe('type-consistency');
    expect(shaped.severity).toBe('medium');
    expect(shaped.title).toContain('编号');
    expect(shaped.columns).toEqual(['编号']);
    expect(shaped.confidence).toBe(0.9);
  });

  it('没有建议的问题也能安全通过', () => {
    const { suggestion, ...withoutSuggestion } = issue;

    expect(() => issueForModel(withoutSuggestion)).not.toThrow();
    expect(issueForModel(withoutSuggestion).suggestion).toBeUndefined();
  });

  it('没有行下标时行数为 0，而不是 undefined', () => {
    const shaped = issueForModel({
      ...issue,
      evidence: { columns: ['编号'], statistics: { offendingCount: 1 } },
    });

    expect(shaped.affectedRowCount).toBe(0);
  });

  it('NaN 与 Infinity 不算数值统计量', () => {
    const shaped = issueForModel({
      ...issue,
      evidence: {
        columns: ['编号'],
        statistics: { good: 1, bad: Number.NaN, worse: Number.POSITIVE_INFINITY },
      },
    });

    expect(shaped.statistics).toEqual({ good: 1 });
  });
});
