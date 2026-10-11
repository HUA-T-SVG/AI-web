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
