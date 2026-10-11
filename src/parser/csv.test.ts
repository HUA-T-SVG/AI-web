import { describe, it, expect } from 'vitest';
import { parseCsv } from './csv';
import { isParseError } from './types';

function buf(text: string): ArrayBuffer {
  return new TextEncoder().encode(text).buffer;
}

const opts = { fileName: 'a.csv', fileSize: 100 };

describe('parseCsv', () => {
  it('解析出表头与数据行', () => {
    const result = parseCsv({ ...opts, buffer: buf('姓名,年龄\n张三,20\n李四,21') });
    if (isParseError(result)) throw new Error('不应失败');
    expect(result.dataset.rowCount).toBe(2);
    expect(result.dataset.columns.map((c) => c.name)).toEqual(['姓名', '年龄']);
    expect(result.dataset.columns[0]?.values).toEqual(['张三', '李四']);
  });

  it('空文件给出可读的中文错误', () => {
    const result = parseCsv({ ...opts, buffer: buf('') });
    expect(isParseError(result)).toBe(true);
    if (!isParseError(result)) return;
    expect(result.kind).toBe('empty-file');
    expect(result.message).toContain('空');
  });

  it('只有表头没有数据行时报 no-header', () => {
    const result = parseCsv({ ...opts, buffer: buf('姓名,年龄') });
    expect(isParseError(result)).toBe(true);
    if (isParseError(result)) expect(result.kind).toBe('no-header');
  });

  it('字段数不足的行补空值，并记入 warnings', () => {
    const result = parseCsv({ ...opts, buffer: buf('a,b,c\n1,2\n3,4,5') });
    if (isParseError(result)) throw new Error('不应失败');
    expect(result.dataset.columns[2]?.values[0]).toBeNull();
    expect(result.meta.warnings.join()).toContain('第 2 行');
  });

  it('字段数超出的行不静默丢弃，记入 warnings', () => {
    const result = parseCsv({ ...opts, buffer: buf('a,b\n1,2,3\n4,5') });
    if (isParseError(result)) throw new Error('不应失败');
    expect(result.dataset.rowCount).toBe(2);
    expect(result.meta.warnings.join()).toContain('第 2 行');
  });

  it('重复列名保留为两列，不互相覆盖', () => {
    const result = parseCsv({ ...opts, buffer: buf('年龄,年龄\n1,2') });
    if (isParseError(result)) throw new Error('不应失败');
    expect(result.dataset.columns).toHaveLength(2);
    expect(result.dataset.columns[1]?.values).toEqual(['2']);
  });

  it('空字段解析为 null，非空字段保持字符串', () => {
    const result = parseCsv({ ...opts, buffer: buf('a,b\n1,\n2,x') });
    if (isParseError(result)) throw new Error('不应失败');
    expect(result.dataset.columns[0]?.values).toEqual(['1', '2']);
    expect(result.dataset.columns[1]?.values).toEqual([null, 'x']);
  });

  it('meta 里记录编码与真实体积', () => {
    const result = parseCsv({ ...opts, buffer: buf('a\n1') });
    if (isParseError(result)) throw new Error('不应失败');
    expect(result.meta.encoding).toBeDefined();
    expect(result.meta.format).toBe('csv');
    expect(result.meta.truncated).toBe(false);
  });

  it('字段里有换行与逗号时不误切（引号包裹）', () => {
    const result = parseCsv({ ...opts, buffer: buf('备注\n"第一行\n第二行"\n"a,b"') });
    if (isParseError(result)) throw new Error('不应失败');
    expect(result.dataset.rowCount).toBe(2);
    expect(result.dataset.columns[0]?.values[0]).toContain('第二行');
  });

  it('全空列解析为整列 null，不折叠成空字符串', () => {
    const result = parseCsv({ ...opts, buffer: buf('a,b\n1,\n2,') });
    if (isParseError(result)) throw new Error('不应失败');
    expect(result.dataset.columns[1]?.values).toEqual([null, null]);
    // 列必须保留：折叠掉会让下游的列画像与表格列数对不上
    expect(result.dataset.columns).toHaveLength(2);
  });

  it('表头为空白的列被起名为「未命名列 N」而不是空字符串', () => {
    // 空列名会让 React 的 key 冲突，也会让问题清单里无法指认是哪一列
    const result = parseCsv({ ...opts, buffer: buf('a,,c\n1,2,3') });
    if (isParseError(result)) throw new Error('不应失败');
    expect(result.dataset.columns[1]?.name).toBe('未命名列 2');
  });

  it('GBK 编码的中文 CSV 不乱码', () => {
    // 「姓名,年龄\n张三,20」的 GBK 字节
    const gbk = [
      0xd0, 0xd5, 0xc3, 0xfb, 0x2c, 0xc4, 0xea, 0xc1, 0xe4, 0x0a, 0xd5, 0xc5, 0xc8, 0xfd, 0x2c,
      0x32, 0x30,
    ];
    const result = parseCsv({ ...opts, buffer: new Uint8Array(gbk).buffer });
    if (isParseError(result)) throw new Error('不应失败');
    expect(result.dataset.columns.map((c) => c.name)).toEqual(['姓名', '年龄']);
    expect(result.dataset.columns[0]?.values).toEqual(['张三']);
  });
});
