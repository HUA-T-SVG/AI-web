import type { CellValue } from './types';

/**
 * 超过此位数的纯数字串不视为数值。
 *
 * 学号、身份证号、订单号这类标识列若被当成数值参与统计，会丢精度并
 * 算出毫无意义的均值 —— 这是实证数据里最常见的一类误判。
 */
export const MAX_NUMERIC_DIGITS = 15;

/**
 * 把单元格解析为数值；不像数值时返回 null。
 * 接受 undefined 是为了配合 noUncheckedIndexedAccess 下的下标访问。
 */
export function parseNumeric(value: CellValue | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (trimmed === '') return null;

  const digits = trimmed.replace(/^[+-]/, '').replace(/\./g, '');
  if (digits.length > MAX_NUMERIC_DIGITS || !/^\d+$/.test(digits)) return null;

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * 数字串是不是以零开头（如 `'001'`、`'-002'`）。
 *
 * 这与「文本会被数值化改写」不是同一件事：`'5.50'` 也会被改写，但它仍然是数量；
 * 而前导零几乎只出现在编号、学号、行政区划码这类**标识**上 —— 当成数值会丢前导零，
 * 画像还会给它算均值，异常值检查也会把它当数量列去挑「离群值」。
 *
 * 判据刻意收窄到前导零，不扩大到所有会被改写的写法：后者会把 `'12.50'` 这类
 * 价格列也踢出数值类型，代价比收益大。
 */
export function isZeroPaddedNumber(value: CellValue | undefined): boolean {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  // 先用便宜的正则排除绝大多数取值，再确认它确实是数值（'00x' 也匹配正则但不是数值）
  if (!/^[+-]?0\d/.test(trimmed)) return false;
  return parseNumeric(trimmed) !== null;
}
