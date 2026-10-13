import { normalizeText } from '../normalize';

/**
 * 中文数据里高频出现、且剥离后不改变语义归属的后缀。顺序有意义：长的在前，
 * 否则 `本科在读` 会先被短后缀命中。
 */
const SUFFIXES = ['在读', '已毕业', '年级', '研究生', '以上', '及以下'];

/**
 * 剥离后缀。
 *
 * **不允许剥到空** —— `研究生` 恰好以 `研究生` 结尾，`在读` 恰好以 `在读` 结尾。
 * 若允许剥空，它们会与任何空串候选（缺失、空白）撞成一组，
 * 而那种「归并」会直接把两个不同的类别合成一个。
 */
export function stripSuffixes(value: string): string {
  for (const suffix of SUFFIXES) {
    if (value.length > suffix.length && value.endsWith(suffix)) {
      return value.slice(0, -suffix.length);
    }
  }
  return value;
}

export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      // `?? 0` 与仓库里其它索引访问（core/stats、core/profile）保持同一写法。
      // 这里的下标由循环边界保证有效，所以默认值永远不会被用到。
      current[j] = Math.min(
        (current[j - 1] ?? 0) + 1,
        (previous[j] ?? 0) + 1,
        (previous[j - 1] ?? 0) + cost,
      );
    }
    previous = current;
  }
  return previous[b.length] ?? b.length;
}

export function normalizedLevenshtein(a: string, b: string): number {
  const longest = Math.max(a.length, b.length);
  if (longest === 0) return 1;
  return 1 - levenshteinDistance(a, b) / longest;
}

export function jaroWinkler(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  const window = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const aFlags = new Array<boolean>(a.length).fill(false);
  const bFlags = new Array<boolean>(b.length).fill(false);
  let matches = 0;

  for (let i = 0; i < a.length; i += 1) {
    const from = Math.max(0, i - window);
    const to = Math.min(i + window + 1, b.length);
    for (let j = from; j < to; j += 1) {
      if (bFlags[j] || a[i] !== b[j]) continue;
      aFlags[i] = true;
      bFlags[j] = true;
      matches += 1;
      break;
    }
  }
  if (matches === 0) return 0;

  let transpositions = 0;
  let probe = 0;
  for (let i = 0; i < a.length; i += 1) {
    if (!aFlags[i]) continue;
    while (!bFlags[probe]) probe += 1;
    if (a[i] !== b[probe]) transpositions += 1;
    probe += 1;
  }
  transpositions /= 2;

  const jaro =
    (matches / a.length + matches / b.length + (matches - transpositions) / matches) / 3;

  // 前缀加成只在 Jaro 已达到 0.7 时启用 —— 这是 Winkler 的原始定义。
  // 不加这个门槛，短串会被前缀拉到虚高。
  if (jaro <= 0.7) return jaro;
  let prefix = 0;
  while (prefix < 4 && prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) {
    prefix += 1;
  }
  return jaro + prefix * 0.1 * (1 - jaro);
}

/**
 * L2 字面相似度：取多路信号的最大值。
 *
 * 为什么不是加权平均：加权平均需要在没有标注集的情况下定权重，而那是拍脑袋。
 * 取最大值等于「任一强信号成立即可」，与 spec §5.5.3 的析取式决策一致；
 * 真正的把关交给组合决策规则与护栏（guard.ts）。
 *
 * 注意它对「研究生／硕士」这种字面零重叠的对**给不出任何分** —— 那是 L3 的职责，
 * 不是这里该修的缺陷。有测试钉着这一条。
 */
export function literalSimilarity(a: string, b: string): number {
  const left = normalizeText(a).toLowerCase();
  const right = normalizeText(b).toLowerCase();
  if (left === right) return 1;

  const strippedLeft = stripSuffixes(left);
  const strippedRight = stripSuffixes(right);
  if (strippedLeft === strippedRight) return 0.99; // 只差后缀，几乎可判等

  const candidates = [
    normalizedLevenshtein(left, right),
    jaroWinkler(left, right),
    normalizedLevenshtein(strippedLeft, strippedRight),
  ];

  // 子串包含：给一个「高但不满」的分。它抓得住「硕士／硕士研究生」，
  // 抓不住「研究生／硕士」—— 字面零重叠，只能靠 L3。
  if (left.includes(right) || right.includes(left)) {
    const ratio = Math.min(left.length, right.length) / Math.max(left.length, right.length);
    candidates.push(0.8 + 0.15 * ratio);
  }

  return Math.max(...candidates);
}
