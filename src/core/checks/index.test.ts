import { describe, it, expect } from 'vitest';
import { createEmptyDataset, type Dataset } from '../types';
import { listChecks, runAllChecks, type CheckDefinition } from './index';

const messy: Dataset = {
  rowCount: 5,
  columns: [
    { name: '年龄', values: [20, 21, 999, 23, null] },
    { name: '学历', values: ['本科', '硕士', '本科', '硕士', '博士'] },
  ],
};

const withAgeRange = {
  rangeRules: [{ id: 'age', column: '年龄', min: 0, max: 120 }],
};

const alwaysThrows: CheckDefinition = {
  id: 'always-throws',
  title: '测试用故障检查',
  description: '人为抛错的检查项，用于验证单个检查失败不影响整体结果。',
  run: () => {
    throw new Error('模拟检查内部故障');
  },
};

describe('runAllChecks', () => {
  it('同时执行多个检查并合并结果', () => {
    const issues = runAllChecks(messy, withAgeRange);
    const checkIds = new Set(issues.map((i) => i.checkId));
    expect(checkIds.has('missing')).toBe(true);
    expect(checkIds.has('range-rules')).toBe(true);
  });

  it('空数据集返回空数组', () => {
    expect(runAllChecks({ columns: [], rowCount: 0 })).toEqual([]);
  });

  it('结果按严重度排序，high 在前', () => {
    const issues = runAllChecks(messy, withAgeRange);
    const severities = issues.map((i) => i.severity);
    const lastHigh = severities.lastIndexOf('high');
    const firstMedium = severities.indexOf('medium');
    expect(lastHigh).toBeGreaterThanOrEqual(0);
    expect(firstMedium).toBeGreaterThanOrEqual(0);
    expect(lastHigh).toBeLessThan(firstMedium);
  });

  it('可通过 enabled 参数只跑指定检查', () => {
    const issues = runAllChecks(messy, { enabled: ['missing'] });
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.every((i) => i.checkId === 'missing')).toBe(true);
  });

  it('未提供值域规则时不报值域问题', () => {
    const issues = runAllChecks(messy);
    expect(issues.some((i) => i.checkId === 'range-rules')).toBe(false);
  });

  it('重名列会被报为问题', () => {
    const dataset: Dataset = {
      rowCount: 2,
      columns: [
        { name: '年龄', values: [20, 21] },
        { name: '年龄', values: [30, 31] },
      ],
    };
    const issues = runAllChecks(dataset);
    expect(issues.some((i) => i.checkId === 'duplicate-column-names')).toBe(true);
  });

  it('未知的 enabled 标识直接抛错，不退化成“未发现问题”', () => {
    // 静默返回空数组会让工具分发层的一个拼写错误看起来像“数据很干净”
    expect(() => runAllChecks(messy, { enabled: ['typo'] })).toThrow(/typo/);
  });

  it('单个检查抛错时产出诊断问题，其余检查结果仍保留', () => {
    const issues = runAllChecks(messy, {
      ...withAgeRange,
      extraChecks: [alwaysThrows],
    });
    expect(issues.some((i) => i.checkId === 'check-failed')).toBe(true);
    expect(issues.some((i) => i.checkId === 'range-rules')).toBe(true);
  });

  it('诊断问题里带上失败检查的标识', () => {
    const issues = runAllChecks(messy, { extraChecks: [alwaysThrows] });
    const diagnostic = issues.find((i) => i.checkId === 'check-failed');
    expect(diagnostic?.evidence.statistics.failedCheckId).toBe('always-throws');
  });
});

describe('可用检查项清单', () => {
  it('覆盖当前全部已实现的检查项', () => {
    const ids = listChecks().map((check) => check.id);
    expect(ids).toEqual([
      'duplicate-column-names',
      'missing',
      'duplicates',
      'type-consistency',
      'outliers',
      'range-rules',
      'category-synonyms',
    ]);
  });

  it('每项都有人能看懂的说明', () => {
    for (const check of listChecks()) {
      expect(check.title.length).toBeGreaterThan(0);
      // 说明要够长才可能说清「查什么」，三五个字的说明等于没写
      expect(check.description.length).toBeGreaterThan(8);
    }
  });

  it('清单里的每一项都真的能跑', () => {
    const dataset = createEmptyDataset();
    for (const check of listChecks()) {
      expect(() => runAllChecks(dataset, { enabled: [check.id] })).not.toThrow();
    }
  });

  it('不包含测试注入的自定义检查项', () => {
    // extraChecks 属于调用方临时注入的东西，不该出现在交给大模型的清单里
    const ids = listChecks().map((check) => check.id);
    expect(ids).not.toContain('always-throws');
  });
});

describe('类别同义检查接入', () => {
  const synonymDataset: Dataset = {
    rowCount: 6,
    columns: [{ name: '学历', values: ['硕士', '硕士研究生', '硕士', '硕士研究生', '硕士', '硕士研究生'] }],
  };

  it('出现在可用检查项清单里 —— 否则大模型不知道能查这一项', () => {
    expect(listChecks().map((check) => check.id)).toContain('category-synonyms');
  });

  it('能通过 runAllChecks 调度，并产出问题', () => {
    const issues = runAllChecks(synonymDataset, { enabled: ['category-synonyms'] });
    expect(issues).toHaveLength(1);
    expect(issues[0]?.checkId).toBe('category-synonyms');
  });

  it('没有向量时「研究生／硕士」不会被检出 —— 这条断言是能力边界的记录', () => {
    // 字面零重叠的对只能靠 L3，而 L3 按 Task 1 的实测不单独触发归并。
    // 它只能作为「待确认」出现，且必须显式传入向量。
    const dataset: Dataset = {
      rowCount: 4,
      columns: [{ name: '学历', values: ['硕士', '研究生', '硕士', '研究生'] }],
    };
    expect(runAllChecks(dataset, { enabled: ['category-synonyms'] })).toHaveLength(0);
  });

  it('传入向量后「研究生／硕士」作为待确认出现', () => {
    const dataset: Dataset = {
      rowCount: 4,
      columns: [{ name: '学历', values: ['硕士', '研究生', '硕士', '研究生'] }],
    };
    const issues = runAllChecks(dataset, {
      enabled: ['category-synonyms'],
      synonyms: {
        vectors: new Map([
          ['硕士', [1, 0]],
          ['研究生', [0.7195, Math.sqrt(1 - 0.7195 * 0.7195)]],
        ]),
      },
    });
    expect(issues).toHaveLength(1);
    expect(issues[0]?.confidence).toBeLessThan(0.6);
  });

  it('单列唯一值超过上限时不参与，避免拖垮整体耗时', () => {
    const dataset: Dataset = {
      rowCount: 3,
      columns: [{ name: '备注', values: ['甲', '乙', '丙'] }],
    };
    expect(
      runAllChecks(dataset, { enabled: ['category-synonyms'], synonyms: { maxUniqueValues: 2 } }),
    ).toHaveLength(0);
  });
});
