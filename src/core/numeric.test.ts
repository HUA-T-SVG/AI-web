import { describe, it, expect } from 'vitest';
import { parseNumeric, MAX_NUMERIC_DIGITS } from './numeric';

describe('parseNumeric', () => {
  it('数字与数字字符串都解析为数值', () => {
    expect(parseNumeric(42)).toBe(42);
    expect(parseNumeric('42')).toBe(42);
    expect(parseNumeric(' 42 ')).toBe(42);
    expect(parseNumeric('-3.5')).toBe(3.5 - 7);
  });

  it('null、undefined 与空白串返回 null', () => {
    expect(parseNumeric(null)).toBeNull();
    expect(parseNumeric(undefined)).toBeNull();
    expect(parseNumeric('')).toBeNull();
    expect(parseNumeric('   ')).toBeNull();
  });

  it('非数值文本返回 null', () => {
    expect(parseNumeric('未知')).toBeNull();
    expect(parseNumeric('1e5')).toBeNull();
    expect(parseNumeric('0x10')).toBeNull();
    expect(parseNumeric('1.2.3')).toBeNull();
    expect(parseNumeric('1,234')).toBeNull();
  });

  it(`恰好 ${MAX_NUMERIC_DIGITS} 位仍按数值处理`, () => {
    const digits = '9'.repeat(MAX_NUMERIC_DIGITS);
    expect(parseNumeric(digits)).toBe(Number(digits));
  });

  it(`超过 ${MAX_NUMERIC_DIGITS} 位不再按数值处理`, () => {
    // 学号、身份证号被当成数值参与统计会丢精度并算出无意义的均值
    expect(parseNumeric('9'.repeat(MAX_NUMERIC_DIGITS + 1))).toBeNull();
    expect(parseNumeric('12345678901234567890')).toBeNull();
  });

  it('带符号与小数点的超长串同样被排除', () => {
    expect(parseNumeric('-1234567890123456')).toBeNull();
    expect(parseNumeric('12345678901234.56')).toBeNull();
  });

  it('无穷与 NaN 不参与统计', () => {
    expect(parseNumeric(Number.POSITIVE_INFINITY)).toBeNull();
    expect(parseNumeric(Number.NaN)).toBeNull();
  });

  it('布尔值不当作数值', () => {
    expect(parseNumeric(true)).toBeNull();
  });

  it('全角数字当前不被识别（已知限制，待规范化层处理）', () => {
    // 记录现状：parseNumeric 期望输入已经过 normalizeText。
    // 若将来直接对原始取值调用它，这里会是一个静默的漏判点。
    expect(parseNumeric('１２３')).toBeNull();
  });
});
