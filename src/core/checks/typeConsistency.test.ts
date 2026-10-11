import { describe, it, expect } from 'vitest';
import type { Dataset } from '../types';
import { checkTypeConsistency } from './typeConsistency';

function ds(name: string, values: Dataset['columns'][number]['values']): Dataset {
  return { rowCount: values.length, columns: [{ name, values }] };
}

describe('checkTypeConsistency', () => {
  it('类型统一的列不报问题', () => {
    expect(checkTypeConsistency(ds('年龄', [1, 2, 3]))).toEqual([]);
  });

  it('数值列混入文本时报问题', () => {
    const issues = checkTypeConsistency(ds('年龄', [1, 2, '未知', 4]));
    expect(issues).toHaveLength(1);
    expect(issues[0]?.checkId).toBe('type-consistency');
  });

  it('证据中列出异常取值所在行', () => {
    const issues = checkTypeConsistency(ds('年龄', [1, 2, '未知', 4]));
    expect(issues[0]?.evidence.rowIndices).toEqual([2]);
  });

  it('证据中给出异常取值本身', () => {
    const issues = checkTypeConsistency(ds('年龄', [1, 2, '未知', 4]));
    expect(issues[0]?.evidence.statistics.offendingValues).toBe('未知');
  });

  it('缺失值不算类型冲突', () => {
    expect(checkTypeConsistency(ds('年龄', [1, null, 3]))).toEqual([]);
  });

  it('全空列不报问题', () => {
    expect(checkTypeConsistency(ds('空列', [null, null]))).toEqual([]);
  });

  it('多列各自报问题', () => {
    const dataset: Dataset = {
      rowCount: 3,
      columns: [
        { name: '年龄', values: [1, 'x', 3] },
        { name: '身高', values: [170, 175, '未知'] },
      ],
    };
    expect(checkTypeConsistency(dataset)).toHaveLength(2);
  });
});
