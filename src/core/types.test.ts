import { describe, it, expect } from 'vitest';
import { createEmptyDataset, isMissingValue } from './types';

describe('类型契约辅助函数', () => {
  it('空数据集的行列数均为 0', () => {
    const ds = createEmptyDataset();
    expect(ds.rowCount).toBe(0);
    expect(ds.columns).toEqual([]);
  });

  it('null、undefined、空串、纯空白串都算缺失', () => {
    expect(isMissingValue(null)).toBe(true);
    expect(isMissingValue(undefined)).toBe(true);
    expect(isMissingValue('')).toBe(true);
    expect(isMissingValue('   ')).toBe(true);
  });

  it('0 和 false 不算缺失', () => {
    // 0 和 false 是有效取值，误判为缺失会把真实数据抹掉
    expect(isMissingValue(0)).toBe(false);
    expect(isMissingValue(false)).toBe(false);
  });
});
