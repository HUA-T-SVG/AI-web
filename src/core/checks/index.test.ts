import { describe, it, expect } from 'vitest';
import type { Dataset } from '../types';
import { runAllChecks } from './index';

const messy: Dataset = {
  rowCount: 5,
  columns: [
    { name: '年龄', values: [20, 21, 999, 23, null] },
    { name: '学历', values: ['本科', '硕士', '本科', '硕士', '博士'] },
  ],
};

describe('runAllChecks', () => {
  it('同时执行多个检查并合并结果', () => {
    const issues = runAllChecks(messy, {
      rangeRules: [{ id: 'age', column: '年龄', min: 0, max: 120 }],
    });
    const checkIds = new Set(issues.map((i) => i.checkId));
    expect(checkIds.has('missing')).toBe(true);
    expect(checkIds.has('range-rules')).toBe(true);
  });

  it('空数据集返回空数组', () => {
    expect(runAllChecks({ columns: [], rowCount: 0 })).toEqual([]);
  });

  it('结果按严重度排序，high 在前', () => {
    const issues = runAllChecks(messy, {
      rangeRules: [{ id: 'age', column: '年龄', min: 0, max: 120 }],
    });
    const severities = issues.map((i) => i.severity);
    const firstMedium = severities.indexOf('medium');
    const lastHigh = severities.lastIndexOf('high');
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
});
