import { describe, it, expect } from 'vitest';
import {
  createParseResult,
  applyRowLimit,
  MAX_FILE_BYTES,
  MAX_ROWS,
  isParseError,
} from './types';

describe('解析结果契约', () => {
  it('上限是具体数字，不是 undefined', () => {
    expect(MAX_ROWS).toBeGreaterThan(0);
    expect(MAX_FILE_BYTES).toBeGreaterThan(0);
  });

  it('createParseResult 填好默认的 meta 字段', () => {
    const result = createParseResult({
      dataset: { columns: [], rowCount: 0 },
      fileName: 'a.csv',
      fileSize: 100,
      format: 'csv',
    });
    expect(result.meta.fileName).toBe('a.csv');
    expect(result.meta.truncated).toBe(false);
    expect(result.meta.warnings).toEqual([]);
  });

  it('isParseError 能区分成功与失败', () => {
    const ok = createParseResult({
      dataset: { columns: [], rowCount: 0 },
      fileName: 'a.csv',
      fileSize: 1,
      format: 'csv',
    });
    expect(isParseError(ok)).toBe(false);
    expect(isParseError({ message: '文件为空', kind: 'empty-file' })).toBe(true);
  });
});

describe('applyRowLimit', () => {
  it('未超限时原样返回且标记未截断', () => {
    const { kept, truncated } = applyRowLimit([1, 2, 3], 5);
    expect(kept).toEqual([1, 2, 3]);
    expect(truncated).toBe(false);
  });

  it('恰好等于上限时不算截断', () => {
    const { kept, truncated } = applyRowLimit([1, 2, 3], 3);
    expect(kept).toHaveLength(3);
    expect(truncated).toBe(false);
  });

  it('超限时截断并标记', () => {
    const { kept, truncated } = applyRowLimit([1, 2, 3, 4], 3);
    expect(kept).toEqual([1, 2, 3]);
    expect(truncated).toBe(true);
  });

  it('默认使用 MAX_ROWS', () => {
    // 用 20 万行真数据测太慢，这里只验证默认参数接的是常量
    expect(applyRowLimit([1]).truncated).toBe(false);
    expect(MAX_ROWS).toBe(200_000);
  });

  it('空数组不报截断', () => {
    expect(applyRowLimit([], 0).truncated).toBe(false);
  });
});
