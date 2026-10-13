import { describe, expect, it } from 'vitest';
import { isGuardedPair } from './guard';

describe('反义与互斥护栏', () => {
  // spec §5.5.1 的「绝不能归并」清单，逐对钉死
  it.each([
    ['男', '女'],
    ['是', '否'],
    ['本科', '硕士'],
    ['1', '2'],
    ['无', '未填'],
  ])('spec 点名的「%s／%s」必须被拦下', (a, b) => {
    expect(isGuardedPair(a, b)).toBe(true);
  });

  it('量级相差倍数的单位不该自动归并', () => {
    expect(isGuardedPair('g', 'kg')).toBe(true);
    expect(isGuardedPair('元', '万元')).toBe(true);
  });

  // 这四对来自 Task 1 的实测：它们不是「语义相近」，而是同一个退化向量（余弦 1.0000）。
  // 护栏拦不住它们，L3 就会拿它们当「高度同义」。
  it.each([
    ['A型', 'B型'],
    ['M', 'F'],
    ['mL', 'L'],
    ['A卷', 'B卷'],
    ['批次1', '批次2'],
  ])('Task 1 实测余弦 1.0000 的短串「%s／%s」必须被拦下', (a, b) => {
    expect(isGuardedPair(a, b)).toBe(true);
  });

  it('正常的同义写法不该被拦', () => {
    expect(isGuardedPair('硕士', '研究生')).toBe(false);
    expect(isGuardedPair('mg', '毫克')).toBe(false);
    expect(isGuardedPair('本科在读', '本科')).toBe(false);
    expect(isGuardedPair('硕士', '硕士研究生')).toBe(false);
    expect(isGuardedPair('男', '男性')).toBe(false);
  });

  it('「硕士／研究生」必须放行 —— 它是 L3 存在的唯一理由', () => {
    // 这条与上面「拦下 A型／B型」是一对约束。spec §5.5.3 的
    // 「长度极短且字符集不同」按字面取到 3 个字符时，会把这一对也挡掉，
    // 于是 Recall 从 0.30 掉到 0.12（Task 1 实测）。
    // 所以「极短」按最保守的解释取「双方都 ≤2 字」。
    expect(isGuardedPair('硕士', '研究生')).toBe(false);
    // 同一原因：三字与两字的组合一律放行，包括这一对反义。
    // 它靠的不是词法护栏，而是「L3 不单独触发归并」这条结论 ——
    // 见 knowledge/reports/embedding-validation.md 第三节。
    expect(isGuardedPair('已毕业', '在读')).toBe(false);
  });

  it('纯拉丁的长同义词不该被模板规则误挡', () => {
    // 模板规则会把「去掉字母与数字后形状相同」的串判为同一模板的不同取值。
    // 但这只在两边都被剥空且都极短时才成立，否则 male／female 会被误挡。
    expect(isGuardedPair('male', 'female')).toBe(false);
    expect(isGuardedPair('positive', 'negative')).toBe(false);
  });
});
