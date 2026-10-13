import { describe, expect, it } from 'vitest';
import { jaroWinkler, literalSimilarity, normalizedLevenshtein, stripSuffixes } from './literal';

describe('L2 字面层', () => {
  it('完全相同为 1，完全不同为 0', () => {
    expect(normalizedLevenshtein('硕士', '硕士')).toBe(1);
    expect(normalizedLevenshtein('男', '女')).toBe(0);
  });

  it('「硕士／博士」的字面相似度是 0.5 —— 这正是它危险的原因', () => {
    // 第一版测试写的是 toBe(0)，算错了：两字差一字，归一化编辑距离就是 0.5。
    // 而 0.5 这个数一摆出来，Task 1 实测的那个问题就看得见了 ——
    // 硕士／博士在字面层有一半重合，在语义层余弦 0.7452，而它是 spec 点名
    // 「绝不能归并」的对。所以判断不能只看单一信号。
    expect(normalizedLevenshtein('硕士', '博士')).toBe(0.5);
  });

  it('剥离中文数据高频后缀', () => {
    expect(stripSuffixes('本科在读')).toBe('本科');
    expect(stripSuffixes('硕士研究生')).toBe('硕士');
    expect(stripSuffixes('五年级')).toBe('五');
  });

  it('后缀剥离不能把整串吃光 —— 否则「研究生」会变成空串', () => {
    // 这条不是洁癖：`研究生` 本身就以 `研究生` 结尾，
    // 若允许剥离到空，它就会与任何空串候选（缺失、空白）撞成一组
    expect(stripSuffixes('研究生')).toBe('研究生');
    expect(stripSuffixes('在读')).toBe('在读');
  });

  it('子串包含给高分，但不给满分 —— 包含不等于等价', () => {
    const score = literalSimilarity('硕士', '硕士研究生');
    expect(score).toBeGreaterThan(0.8);
    expect(score).toBeLessThan(1);
  });

  it('反义对在字面层就该是可分的', () => {
    expect(literalSimilarity('男', '女')).toBe(0);
    expect(literalSimilarity('本科', '硕士')).toBe(0);
  });

  it('字面零重叠的同义对拿不到分 —— 它们只能靠 L3', () => {
    // 这条断言是「L3 为什么必须存在」的可执行说明。
    // 哪天有人把 L2 调宽到能覆盖它，Precision 就会被换成假象。
    expect(literalSimilarity('研究生', '硕士')).toBeLessThan(0.5);
  });

  it('Jaro-Winkler 对短串的前缀敏感', () => {
    expect(jaroWinkler('mg', 'mg')).toBe(1);
    expect(jaroWinkler('abc', 'xyz')).toBeLessThan(0.6);
  });

  it('大小写与全角差异在 L1 归一层就该消失，这里不必再管', () => {
    // literalSimilarity 内部走 normalizeText，所以 MG/mg 与 ｇ/g 都会先被归一
    expect(literalSimilarity('MG', 'mg')).toBe(1);
    expect(literalSimilarity('ｇ', 'g')).toBe(1);
  });
});
