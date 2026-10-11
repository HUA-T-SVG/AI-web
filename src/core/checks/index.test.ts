import { describe, it, expect } from 'vitest';
import type { Dataset } from '../types';
import { runAllChecks, type CheckDefinition } from './index';

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
