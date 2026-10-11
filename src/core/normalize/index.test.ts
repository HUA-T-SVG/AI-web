import { describe, it, expect } from 'vitest';
import { toHalfWidth, normalizeText, normalizeKey } from './index';

describe('toHalfWidth', () => {
  it('全角字母数字转半角', () => {
    expect(toHalfWidth('ＭＧ１２３')).toBe('MG123');
  });

  it('全角空格转半角空格', () => {
    expect(toHalfWidth('a\u3000b')).toBe('a b');
  });

  it('中文汉字不受影响', () => {
    expect(toHalfWidth('本科')).toBe('本科');
  });
});

describe('normalizeText', () => {
  it('去首尾空白并压缩内部连续空白', () => {
    expect(normalizeText('  本  科  ')).toBe('本 科');
  });

  it('全角转半角后归一', () => {
    expect(normalizeText('ＭＧ')).toBe('MG');
  });

  it('不改变大小写', () => {
    expect(normalizeText('Mg')).toBe('Mg');
  });

  it('去除零宽字符', () => {
    // 从网页复制问卷选项时常混入零宽空格，肉眼不可见但会造成分组错位
    expect(normalizeText('本科\u200B')).toBe('本科');
  });
});

describe('normalizeKey', () => {
  it('用于分组比较时忽略大小写', () => {
    expect(normalizeKey('MG')).toBe(normalizeKey('mg'));
  });

  it('null 归一为空串', () => {
    expect(normalizeKey(null)).toBe('');
  });

  it('数字与等值字符串归一结果一致', () => {
    expect(normalizeKey(42)).toBe(normalizeKey('42'));
  });
});
