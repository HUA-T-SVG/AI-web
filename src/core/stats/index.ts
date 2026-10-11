/**
 * 统计原语。
 *
 * 统一约定：空输入与退化输入（全部取值相同、只有一个元素）一律返回
 * 有限的 0 或等价边界，绝不返回 NaN / Infinity —— 上游会把结果直接
 * 渲染到界面上，NaN 会一路传播成空白或崩溃。
 */

function sortedCopy(values: readonly number[]): number[] {
  return [...values].sort((a, b) => a - b);
}

/** 线性插值分位数。 */
export function quantile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = sortedCopy(values);
  const clamped = Math.min(1, Math.max(0, p));
  const pos = (sorted.length - 1) * clamped;
  const lowerIndex = Math.floor(pos);
  const upperIndex = Math.ceil(pos);
  const lower = sorted[lowerIndex] ?? 0;
  const upper = sorted[upperIndex] ?? lower;
  if (lowerIndex === upperIndex) return lower;
  return lower + (upper - lower) * (pos - lowerIndex);
}

export function meanOf(values: readonly number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

export function medianOf(values: readonly number[]): number {
  return quantile(values, 0.5);
}

export function stdDevOf(values: readonly number[]): number {
  if (values.length <= 1) return 0;
  const mean = meanOf(values);
  let acc = 0;
  for (const v of values) {
    const d = v - mean;
    acc += d * d;
  }
  return Math.sqrt(acc / values.length);
}

/**
 * 四分位距上下界。默认 1.5 倍是 Tukey 的惯用取值，
 * 数据质量检查领域几乎都以此为准，改动前请确认与既有评测结果一致。
 */
export function iqrBounds(
  values: readonly number[],
  k = 1.5,
): { lower: number; upper: number } {
  if (values.length === 0) return { lower: 0, upper: 0 };
  const q1 = quantile(values, 0.25);
  const q3 = quantile(values, 0.75);
  const iqr = q3 - q1;
  return { lower: q1 - k * iqr, upper: q3 + k * iqr };
}

export function zScoresOf(values: readonly number[]): number[] {
  const sd = stdDevOf(values);
  if (sd === 0) return values.map(() => 0);
  const mean = meanOf(values);
  return values.map((v) => (v - mean) / sd);
}

/**
 * 修正 Z 分数（Iglewicz–Hoaglin）：以中位数为中心、MAD 为尺度。
 * 相比标准 Z 分数，个别极端值不会抬高标准差从而把其他异常一起掩盖。
 * 0.6745 是正态分布下 MAD 与标准差的换算常数。
 */
export function modifiedZScoresOf(values: readonly number[]): number[] {
  if (values.length === 0) return [];
  const median = medianOf(values);
  const deviations = values.map((v) => Math.abs(v - median));
  const mad = medianOf(deviations);
  if (mad === 0) return values.map(() => 0);
  return values.map((v) => (0.6745 * (v - median)) / mad);
}
