import { describe, it, expect } from 'vitest';
import type { Dataset } from '../types';
import { checkRangeRules, type RangeRule } from './rangeRules';

function ds(name: string, values: Dataset['columns'][number]['values']): Dataset {
  return { rowCount: values.length, columns: [{ name, values }] };
}

const ageRule: RangeRule = {
  id: 'age-0-120',
  column: '年龄',
  min: 0,
  max: 120,
  rationale: '人类年龄的合理范围',
};

describe('checkRangeRules', () => {
  it('全部在范围内时不报问题', () => {
    expect(checkRangeRules(ds('年龄', [20, 30, 40]), [ageRule])).toEqual([]);
  });

  it('超出上界时报问题', () => {
    const issues = checkRangeRules(ds('年龄', [20, 999]), [ageRule]);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.evidence.rowIndices).toEqual([1]);
  });

  it('超出下界时报问题', () => {
    const issues = checkRangeRules(ds('年龄', [-5, 20]), [ageRule]);
    expect(issues[0]?.evidence.rowIndices).toEqual([0]);
  });

  it('边界值本身不算越界（闭区间）', () => {
    expect(checkRangeRules(ds('年龄', [0, 120]), [ageRule])).toEqual([]);
  });

  it('列不存在时跳过该规则，不报错', () => {
    expect(checkRangeRules(ds('身高', [170]), [ageRule])).toEqual([]);
  });

  it('缺失值不参与值域检查', () => {
    expect(checkRangeRules(ds('年龄', [20, null, 30]), [ageRule])).toEqual([]);
  });

  it('规则的理由被带入建议中', () => {
    const issues = checkRangeRules(ds('年龄', [999]), [ageRule]);
    expect(issues[0]?.suggestion?.rationale).toContain('人类年龄的合理范围');
  });

  it('多条规则可同时生效', () => {
    const heightRule: RangeRule = { id: 'h', column: '身高', min: 50, max: 250 };
    const dataset: Dataset = {
      rowCount: 1,
      columns: [
        { name: '年龄', values: [999] },
        { name: '身高', values: [300] },
      ],
    };
    expect(checkRangeRules(dataset, [ageRule, heightRule])).toHaveLength(2);
  });

  it('证据里的列序号是 1 基，且同名列能区分第几列', () => {
    // 表头重名时「涉及列」都是「年龄」，用户只能靠序号判断说的是哪一列；
    // 而界面上其它地方的列序号都是 1 基，这里不能给 0
    const dataset: Dataset = {
      rowCount: 2,
      columns: [
        { name: '年龄', values: [999, 20] },
        { name: '年龄', values: [20, 999] },
      ],
    };

    const issues = checkRangeRules(dataset, [ageRule]);
    expect(issues).toHaveLength(2);
    expect(issues.map((issue) => issue.evidence.statistics.columnNumber)).toEqual([1, 2]);
    for (const issue of issues) {
      expect(issue.evidence.statistics).not.toHaveProperty('columnIndex');
      expect(issue.suggestion?.params).toMatchObject({ columnNumber: expect.any(Number) });
    }
  });
});
