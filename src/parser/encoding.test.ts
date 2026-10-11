import { describe, it, expect } from 'vitest';
import { decodeBuffer, looksLikeGarbled } from './encoding';

function toBuffer(bytes: number[]): ArrayBuffer {
  return new Uint8Array(bytes).buffer;
}

describe('decodeBuffer', () => {
  it('UTF-8 中文正常解码', () => {
    const bytes = Array.from(new TextEncoder().encode('姓名,年龄\n张三,20'));
    const { text, encoding } = decodeBuffer(toBuffer(bytes));
    expect(text).toContain('张三');
    expect(encoding.toLowerCase()).toContain('utf');
  });

  it('GBK 中文不乱码', () => {
    // 「姓名,年龄」的 GBK 字节：Excel 另存为 CSV 时的默认编码
    const gbk = [0xd0, 0xd5, 0xc3, 0xfb, 0x2c, 0xc4, 0xea, 0xc1, 0xe4];
    const { text, encoding } = decodeBuffer(toBuffer(gbk));
    expect(text).toBe('姓名,年龄');
    expect(encoding.toLowerCase()).not.toContain('utf');
  });

  it('带 BOM 的 UTF-8 不把 BOM 留在内容里', () => {
    const bytes = [0xef, 0xbb, 0xbf, ...Array.from(new TextEncoder().encode('a,b'))];
    const { text } = decodeBuffer(toBuffer(bytes));
    // BOM 留在开头会让第一列的表头名带一个看不见的字符，按列名匹配就会失败
    expect(text.startsWith('a')).toBe(true);
  });

  it('纯 ASCII 按 UTF-8 处理', () => {
    const { text, encoding } = decodeBuffer(
      toBuffer(Array.from(new TextEncoder().encode('a,b\n1,2'))),
    );
    expect(text).toBe('a,b\n1,2');
    expect(encoding.toLowerCase()).toContain('utf');
  });

  it('空 buffer 返回空串而不是抛错', () => {
    expect(decodeBuffer(new ArrayBuffer(0)).text).toBe('');
  });

  it('GBK 中文表格的表头与内容都正确', () => {
    // 「学历,本科」的 GBK 字节
    const gbk = [0xd1, 0xa7, 0xc0, 0xfa, 0x2c, 0xb1, 0xbe, 0xbf, 0xc6];
    const { text } = decodeBuffer(toBuffer(gbk));
    expect(text).toBe('学历,本科');
  });
});

describe('looksLikeGarbled', () => {
  it('正常中文不算乱码', () => {
    expect(looksLikeGarbled('姓名,年龄,学历')).toBe(false);
  });

  it('替换字符密集时判为乱码', () => {
    // U+FFFD 是解码失败的直接证据，比猜测字符区段可靠
    expect(looksLikeGarbled('姓\uFFFD\uFFFD,\uFFFD\uFFFD\uFFFD')).toBe(true);
  });

  it('纯 ASCII 不算乱码', () => {
    expect(looksLikeGarbled('name,age')).toBe(false);
  });

  it('空串不算乱码', () => {
    expect(looksLikeGarbled('')).toBe(false);
  });

  it('少量替换字符不算乱码（个别坏字节不该让整个文件改判编码）', () => {
    const mostlyFine = `${'正常内容'.repeat(100)}\uFFFD`;
    expect(looksLikeGarbled(mostlyFine)).toBe(false);
  });
});
