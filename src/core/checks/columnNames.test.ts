import { describe, it, expect } from 'vitest';
import type { Dataset } from '../types';
import { checkDuplicateColumnNames } from './columnNames';

describe('checkDuplicateColumnNames', () => {
  it('没有重名时不报问题', () => {
    const dataset: Dataset = {
      rowCount: 1,
      columns: [
        { name: '年龄', values: [20] },
        { name: '身高', values: [170] },
      ],
    };
    expect(checkDuplicateColumnNames(dataset)).toEqual([]);
  });

  it('同名列报为 high 问题', () => {
    const dataset: Dataset = {
      rowCount: 1,
      columns: [
        { name: '年龄', values: [20] },
        { name: '年龄', values: [21] },
      ],
    };
    const issues = checkDuplicateColumnNames(dataset);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.checkId).toBe('duplicate-column-names');
    expect(issues[0]?.severity).toBe('high');
  });

  it('证据中给出重名列的全部下标，便于定位是哪几列冲突', () => {
    const dataset: Dataset = {
      rowCount: 1,
      columns: [
        { name: 'a', values: [1] },
        { name: 'b', values: [2] },
        { name: 'a', values: [3] },
      ],
    };
    const issues = checkDuplicateColumnNames(dataset);
    expect(issues[0]?.evidence.statistics.columnIndices).toBe('0、2');
  });

  it('三个同名列只报一条，不重复报', () => {
    const dataset: Dataset = {
      rowCount: 1,
      columns: [
        { name: 'a', values: [1] },
        { name: 'a', values: [2] },
        { name: 'a', values: [3] },
      ],
    };
    expect(checkDuplicateColumnNames(dataset)).toHaveLength(1);
  });

  it('空数据集不报问题', () => {
    expect(checkDuplicateColumnNames({ columns: [], rowCount: 0 })).toEqual([]);
  });
});
