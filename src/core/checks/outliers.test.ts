import { describe, it, expect } from 'vitest';
import type { Dataset } from '../types';
import { checkOutliers } from './outliers';

function numCol(name: string, values: number[]): Dataset {
  return { rowCount: values.length, columns: [{ name, values }] };
}

describe('checkOutliers', () => {
  it('没有异常值时不报问题', () => {
    expect(checkOutliers(numCol('年龄', [20, 21, 22, 23, 24]))).toEqual([]);
  });

  it('IQR 方法能识别明显的离群值', () => {
    const issues = checkOutliers(numCol('年龄', [20, 21, 22, 23, 24, 25, 26, 999]));
    expect(issues).toHaveLength(1);
    expect(issues[0]?.checkId).toBe('outliers');
  });

  it('证据中给出异常值所在行与数量', () => {
    const issues = checkOutliers(numCol('年龄', [20, 21, 22, 23, 24, 25, 26, 999]));
    expect(issues[0]?.evidence.rowIndices).toContain(7);
    expect(issues[0]?.evidence.statistics.outlierCount).toBe(1);
  });

  it('非数值列跳过，不报问题', () => {
    const dataset: Dataset = {
      rowCount: 4,
      columns: [{ name: '学历', values: ['本科', '硕士', '本科', '博士'] }],
    };
    expect(checkOutliers(dataset)).toEqual([]);
  });

  it('全部相同数值不产生异常值也不崩溃', () => {
    expect(checkOutliers(numCol('年龄', [30, 30, 30, 30]))).toEqual([]);
  });

  it('单行数据不报问题', () => {
    expect(checkOutliers(numCol('年龄', [30]))).toEqual([]);
  });

  it('可切换到修正 Z 分数方法', () => {
    const values = [10, 11, 12, 13, 14, 15, 16, 1000];
    expect(checkOutliers(numCol('值', values), { method: 'modified-z' })).toHaveLength(1);
  });

  it('空数据集不报问题', () => {
    expect(checkOutliers({ columns: [], rowCount: 0 })).toEqual([]);
  });
});
