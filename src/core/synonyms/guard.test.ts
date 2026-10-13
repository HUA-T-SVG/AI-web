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

  /**
   * 这一组是整分支审查抓出来的 Critical：`semanticHigh = ∞` 关掉了语义路的自动归并
   * 之后，**唯一还会自动改数据的路径变成了 L2 字面层**，而它当时没有任何对应的护栏。
   *
   * 实测（修之前）：`满意／不满意` 在剥后缀编辑距离上得 0.90，越过 `literal = 0.86`，
   * 以 **0.85 置信度自动建议归并**。同根因的还有 `合格／不合格`、`通过／未通过`、
   * `毫克／克`（**数值差 1000 倍**）。标注集 911 条负例里有 28 对如此。
   *
   * 之前那条「字符集不同」的规则拦不住它们 —— 「不满意」与「满意」字符集是**相交**的。
   */
  it.each([
    ['满意', '不满意'],
    ['合格', '不合格'],
    ['通过', '未通过'],
    ['阳性', '阴性'],
    ['有', '没有'],
    ['同意', '不同意'],
  ])('否定前缀构成的互斥对「%s／%s」必须被拦下', (a, b) => {
    expect(isGuardedPair(a, b)).toBe(true);
  });

  it('带量级前缀的单位是「量级不同」，必须被拦下', () => {
    // 「毫克」与「克」字符集相交，所以旧的「字符集不同」规则放它们过去了，
    // 而它们差 1000 倍 —— 自动归并会把数值整体改错
    expect(isGuardedPair('毫克', '克')).toBe(true);
    expect(isGuardedPair('厘米', '米')).toBe(true);
    expect(isGuardedPair('毫升', '升')).toBe(true);
    expect(isGuardedPair('微克', '克')).toBe(true);
  });

  it('中文单位名与拉丁符号仍必须放行 —— 那是本功能要服务的正常模式', () => {
    // 否定前缀规则与量级规则都极易误伤这一族：`毫克` 确实以「毫」开头。
    // 所以量级前缀表只用来判「中文对中文」，中文对拉丁一律不算。
    expect(isGuardedPair('毫克', 'mg')).toBe(false);
    expect(isGuardedPair('厘米', 'cm')).toBe(false);
    expect(isGuardedPair('毫升', 'ml')).toBe(false);
    expect(isGuardedPair('千克', 'kg')).toBe(false);
  });

  it('否定字出现在词中而不是前缀时不该误挡', () => {
    // 规则要求「去掉前缀后剩下的串**完全相同**」，所以关键不在于是否含否定字，
    // 而在于去掉后能不能对上。这三组的剩余部分都对不上：
    //   `无人机` 去掉「无」是「人机」，对不上「飞机」
    //   `未婚`   去掉「未」是「婚」，对不上「已婚」
    //   `无理数` 去掉「无」是「理数」，对不上「有理数」—— 后者反而多一个字
    expect(isGuardedPair('无人机', '飞机')).toBe(false);
    expect(isGuardedPair('未婚', '已婚')).toBe(false);
    expect(isGuardedPair('无理数', '有理数')).toBe(false);
  });

  it('前缀逐字对应时一律拦下 —— 这是有意的从宽', () => {
    // 反例是「非常满意／常满意」：它满足「去掉「非」后完全相同」，所以会被拦下。
    // 这是**刻意的**：`非Y` 与 `Y` 在绝大多数情况下确实互斥（合格/不合格、
    // 满意/不满意、全日制/非全日制），而漏检只是「没帮上忙」，误合并会改坏数据。
    // 代价是这一对若真是同义写法会被推给人工确认，而不是自动归并。
    expect(isGuardedPair('非常满意', '常满意')).toBe(true);
  });
});
