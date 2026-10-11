import { describe, it, expect } from 'vitest';
import { pickFormat, parseFile } from './index';
import { isParseError } from './types';

describe('pickFormat', () => {
  it('识别 csv 与 xlsx', () => {
    expect(pickFormat('a.csv')).toBe('csv');
    expect(pickFormat('a.CSV')).toBe('csv');
    expect(pickFormat('a.xlsx')).toBe('xlsx');
    expect(pickFormat('a.XLSX')).toBe('xlsx');
  });

  it('旧版 xls 不支持，返回 null（上层会给出「另存为 xlsx」的提示）', () => {
    expect(pickFormat('a.xls')).toBeNull();
  });

  it('其他扩展名返回 null', () => {
    expect(pickFormat('a.txt')).toBeNull();
    expect(pickFormat('a')).toBeNull();
  });
});

describe('parseFile', () => {
  it('不支持的类型给出可读中文提示并说明支持范围', async () => {
    const result = await parseFile({
      buffer: new ArrayBuffer(0),
      fileName: 'a.pdf',
      fileSize: 0,
    });
    expect(isParseError(result)).toBe(true);
    if (isParseError(result)) {
      expect(result.kind).toBe('unsupported-format');
      expect(result.message).toContain('.csv');
      expect(result.message).toContain('.xlsx');
    }
  });

  it('旧版 xls 给出专门的提示', async () => {
    const result = await parseFile({
      buffer: new ArrayBuffer(0),
      fileName: 'a.xls',
      fileSize: 0,
    });
    if (isParseError(result)) expect(result.message).toContain('另存为');
  });

  it('超过体积上限时拒绝解析并说明上限', async () => {
    const result = await parseFile({
      buffer: new TextEncoder().encode('a\n1').buffer,
      fileName: 'a.csv',
      fileSize: 999 * 1024 * 1024,
    });
    expect(isParseError(result)).toBe(true);
    if (isParseError(result)) {
      expect(result.kind).toBe('file-too-large');
      expect(result.message).toContain('50');
    }
  });

  it('正常 CSV 走到解析成功', async () => {
    const result = await parseFile({
      buffer: new TextEncoder().encode('姓名\n张三').buffer,
      fileName: 'a.csv',
      fileSize: 20,
    });
    expect(isParseError(result)).toBe(false);
    if (!isParseError(result)) expect(result.dataset.rowCount).toBe(1);
  });

  it('xlsx 走 Excel 分支（损坏数据给出 corrupt 而非 unsupported）', async () => {
    const result = await parseFile({
      buffer: new Uint8Array([1, 2, 3]).buffer,
      fileName: 'a.xlsx',
      fileSize: 3,
    });
    expect(isParseError(result)).toBe(true);
    if (isParseError(result)) expect(result.kind).toBe('corrupt');
  });
});
