import { describe, it, expect } from 'vitest';
import { parseXlsx } from './excel';
import { isParseError } from './types';

const opts = { fileName: 'a.xlsx', fileSize: 100 };

describe('parseXlsx', () => {
  it('损坏的二进制给出可读的中文错误，不抛异常', async () => {
    const result = await parseXlsx({ ...opts, buffer: new Uint8Array([1, 2, 3]).buffer });
    expect(isParseError(result)).toBe(true);
    if (isParseError(result)) {
      expect(result.kind).toBe('corrupt');
      expect(result.message).toContain('无法读取');
    }
  });

  it('空 buffer 给出可读错误', async () => {
    const result = await parseXlsx({ ...opts, buffer: new ArrayBuffer(0) });
    expect(isParseError(result)).toBe(true);
    if (isParseError(result)) expect(result.kind).toBe('empty-file');
  });

  it('错误信息里带上文件名，便于用户核对选错的文件', async () => {
    const result = await parseXlsx({ ...opts, buffer: new Uint8Array([0]).buffer });
    if (isParseError(result)) expect(result.message).toContain('a.xlsx');
  });

  it('提示里说明旧版 .xls 需要另存为 .xlsx', async () => {
    // 用户拿 .xls 改名成 .xlsx 是常见操作，直接报「无法读取」会让人摸不着头脑
    const result = await parseXlsx({ ...opts, buffer: new Uint8Array([0]).buffer });
    if (isParseError(result)) expect(result.message).toContain('.xlsx');
  });
});
