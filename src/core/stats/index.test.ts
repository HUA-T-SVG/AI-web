import { describe, it, expect } from 'vitest';
import {
  quantile,
  medianOf,
  meanOf,
  stdDevOf,
  iqrBounds,
  zScoresOf,
  modifiedZScoresOf,
} from './index';

describe('quantile', () => {
  it('中位数取中间值', () => {
    expect(quantile([1, 2, 3, 4, 5], 0.5)).toBe(3);
  });

  it('偶数个元素时线性插值', () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
  });

  it('边界 p=0 与 p=1', () => {
    expect(quantile([5, 1, 3], 0)).toBe(1);
    expect(quantile([5, 1, 3], 1)).toBe(5);
  });

  it('空数组返回 0，不返回 NaN', () => {
    expect(quantile([], 0.5)).toBe(0);
  });

  it('单元素数组任何分位数都是该元素', () => {
    expect(quantile([7], 0.25)).toBe(7);
    expect(quantile([7], 0.75)).toBe(7);
  });

  it('输入无需预排序', () => {
    expect(quantile([3, 1, 2], 0.5)).toBe(2);
  });
});

describe('meanOf / medianOf / stdDevOf', () => {
  it('均值正确', () => {
    expect(meanOf([1, 2, 3, 4])).toBe(2.5);
  });

  it('空数组均值为 0', () => {
    expect(meanOf([])).toBe(0);
  });

  it('中位数与 quantile(0.5) 结果一致', () => {
    expect(medianOf([1, 2, 3, 4])).toBe(2.5);
    expect(medianOf([3, 1, 2])).toBe(2);
  });

  it('单元素标准差为 0，不是 NaN', () => {
    expect(stdDevOf([5])).toBe(0);
  });

  it('空数组标准差为 0', () => {
    expect(stdDevOf([])).toBe(0);
  });

  it('标准差为总体标准差', () => {
    expect(stdDevOf([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2, 10);
  });
});

describe('iqrBounds', () => {
  it('按 1.5 倍 IQR 计算上下界', () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 100];
    const { lower, upper } = iqrBounds(values);
    expect(lower).toBeLessThan(1);
    expect(upper).toBeGreaterThan(9);
    expect(upper).toBeLessThan(100);
  });

  it('全部相同值时上下界等于该值，不为 NaN', () => {
    const { lower, upper } = iqrBounds([5, 5, 5, 5]);
    expect(lower).toBe(5);
    expect(upper).toBe(5);
  });

  it('单元素时上下界等于该值', () => {
    const { lower, upper } = iqrBounds([3]);
    expect(lower).toBe(3);
    expect(upper).toBe(3);
  });
});

describe('zScoresOf', () => {
  it('标准分数之和约为 0', () => {
    const z = zScoresOf([1, 2, 3, 4, 5]);
    expect(z.reduce((a, b) => a + b, 0)).toBeCloseTo(0, 10);
  });

  it('标准差为 0 时全部返回 0，不返回 NaN', () => {
    expect(zScoresOf([5, 5, 5])).toEqual([0, 0, 0]);
  });

  it('空数组返回空数组', () => {
    expect(zScoresOf([])).toEqual([]);
  });
});

describe('modifiedZScoresOf', () => {
  it('以中位数与 MAD 为基准，个别极端值不会掩盖其他异常', () => {
    // MAD 必须大于 0 才有意义，超过半数取值相同时 MAD 会退化为 0
    const values = [10, 11, 12, 13, 14, 15, 16, 1000];
    const mz = modifiedZScoresOf(values);
    const lastIndex = values.length - 1;
    expect(Math.abs(mz[lastIndex] ?? 0)).toBeGreaterThan(3.5);
  });

  it('多数取值相同时不把中间值误判为异常', () => {
    const values = [10, 11, 12, 13, 14, 15, 16, 1000];
    const mz = modifiedZScoresOf(values);
    for (let i = 0; i < values.length - 1; i += 1) {
      expect(Math.abs(mz[i] ?? 0)).toBeLessThan(3.5);
    }
  });

  it('MAD 为 0 时全部返回 0，不返回 NaN', () => {
    expect(modifiedZScoresOf([5, 5, 5, 5])).toEqual([0, 0, 0, 0]);
  });
});
