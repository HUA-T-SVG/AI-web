import { describe, it, expect } from 'vitest';
import { decodeBuffer, looksLikeGarbled } from './encoding';

function toBuffer(bytes: number[]): ArrayBuffer {
  return new Uint8Array(bytes).buffer;
}

/** 构造 UTF-16 字节，模拟记事本「Unicode」另存 */
function utf16Bytes(text: string, littleEndian: boolean): number[] {
  const bytes: number[] = littleEndian ? [0xff, 0xfe] : [0xfe, 0xff];
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (littleEndian) bytes.push(code & 0xff, (code >> 8) & 0xff);
    else bytes.push((code >> 8) & 0xff, code & 0xff);
  }
  return bytes;
}

describe('decodeBuffer', () => {
  it('UTF-8 中文正常解码', () => {
    const bytes = Array.from(new TextEncoder().encode('姓名,年龄\n张三,20'));
    const { text, encoding } = decodeBuffer(toBuffer(bytes));
    expect(text).toContain('张三');
    expect(encoding.toLowerCase()).toContain('utf');
  });

  it('GBK 中文不乱码', () => {
    const gbk = [0xd0, 0xd5, 0xc3, 0xfb, 0x2c, 0xc4, 0xea, 0xc1, 0xe4];
    const { text, encoding } = decodeBuffer(toBuffer(gbk));
    expect(text).toBe('姓名,年龄');
    expect(encoding.toLowerCase()).toBe('gbk');
  });

  it('带 BOM 的 UTF-8 不把 BOM 留在内容里', () => {
    const bytes = [0xef, 0xbb, 0xbf, ...Array.from(new TextEncoder().encode('a,b'))];
    expect(decodeBuffer(toBuffer(bytes)).text.startsWith('a')).toBe(true);
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
    const gbk = [0xd1, 0xa7, 0xc0, 0xfa, 0x2c, 0xb1, 0xbe, 0xbf, 0xc6];
    expect(decodeBuffer(toBuffer(gbk)).text).toBe('学历,本科');
  });

  // 以下用例覆盖「静默给错数据」的三条真实路径

  it('UTF-16LE（记事本「Unicode」）按 BOM 判定，不乱码', () => {
    const { text, encoding } = decodeBuffer(toBuffer(utf16Bytes('姓名,年龄\n张三,20', true)));
    expect(text).toContain('姓名');
    expect(text).toContain('张三');
    expect(encoding.toLowerCase()).toContain('utf-16');
  });

  it('UTF-16BE 同样按 BOM 判定', () => {
    const { text, encoding } = decodeBuffer(toBuffer(utf16Bytes('姓名,年龄', false)));
    expect(text).toBe('姓名,年龄');
    expect(encoding.toLowerCase()).toContain('utf-16');
  });

  it('UTF-8 里混入一个非法字节时，不把整份文件改判为 GBK', () => {
    // 严格解码失败不代表整份文件是 GBK：一个坏字节不该毁掉整篇内容
    const valid = Array.from(new TextEncoder().encode('姓名,年龄\n张三,20\n李四,21'));
    const withBadByte = [...valid.slice(0, 6), 0x80, ...valid.slice(6)];

    const { text, encoding } = decodeBuffer(toBuffer(withBadByte));

    expect(encoding.toLowerCase()).toContain('utf');
    // 大部分内容仍应可读，而不是变成「濮撳悕」式的乱码
    expect(text).toContain('张三');
  });

  it('拉脱维亚语等拉丁扩展字符密集的 UTF-8 不被误判为 GBK', () => {
    const text = 'café,résumé,élève,Über,Ökologie,naïve,señor,Ångström\n1,2,3,4,5,6,7,8';
    const { text: decoded, encoding } = decodeBuffer(
      toBuffer(Array.from(new TextEncoder().encode(text))),
    );
    expect(encoding.toLowerCase()).toContain('utf');
    expect(decoded).toContain('café');
    expect(decoded).toContain('Über');
  });

  it('两个候选都不干净时给出可疑标记，交由上层提示用户', () => {
    // 0xFF 在 UTF-8 里是非法字节，在 GBK 里也不是合法首字节，
    // 因此两个候选的替换率都在 0.5 左右。
    //
    // 注意不能想当然地挑字节：0x80 在 GBK 里其实是合法的欧元符号，
    // 随机高字节也常被 GBK 「解得很干净」—— GBK 对字节相当宽容。
    const junk = Array.from({ length: 200 }, (_, i) => (i % 2 === 0 ? 0xff : 0x41));
    const result = decodeBuffer(toBuffer(junk));
    expect(result.suspicious).toBe(true);
    expect(result.encoding).toContain('疑似乱码');
  });

  it('正常文件不带可疑标记', () => {
    const bytes = Array.from(new TextEncoder().encode('姓名,年龄\n张三,20'));
    expect(decodeBuffer(toBuffer(bytes)).suspicious).toBe(false);
  });
});

describe('looksLikeGarbled', () => {
  it('正常中文不算乱码', () => {
    expect(looksLikeGarbled('姓名,年龄,学历')).toBe(false);
  });

  it('替换字符密集时判为乱码', () => {
    expect(looksLikeGarbled('姓\uFFFD\uFFFD,\uFFFD\uFFFD\uFFFD')).toBe(true);
  });

  it('纯 ASCII 不算乱码', () => {
    expect(looksLikeGarbled('name,age')).toBe(false);
  });

  it('空串不算乱码', () => {
    expect(looksLikeGarbled('')).toBe(false);
  });

  it('少量替换字符不算乱码', () => {
    expect(looksLikeGarbled(`${'正常内容'.repeat(100)}\uFFFD`)).toBe(false);
  });
});
