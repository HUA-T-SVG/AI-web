import type { CellValue } from './types';

/**
 * 单元格的类型化编码。
 *
 * 用途是**判等**：去重、数据指纹都必须把「值 + 类型」一起比较。
 * 直接用 `String(value)` 会把 `1` 与 `'1'`、`null` 与 `'null'`、`true` 与 `'true'`
 * 编成同一个串 —— 去重会误删类型不同的记录，指纹也会把两份数据算成同一份。
 *
 * 字符串带长度前缀，因此编码是自定界的：把多个编码直接拼起来也不会因为值里
 * 含有分隔符而串位。长度按 JS 字符串的 UTF-16 码元计，只用于定界，不需要解码。
 */
export function encodeCellValue(value: CellValue): string {
  if (value === null) return 'z';
  if (typeof value === 'number') return `n${String(value)}`;
  if (typeof value === 'boolean') return value ? 'b1' : 'b0';
  return `s${value.length}:${value}`;
}

/**
 * 把一行（或一组用于比较的单元格）编码成可判等的键。
 *
 * 每个单元格编码再套一层长度前缀，确保「字段边界」也被编码进去：
 * 两条记录即使取值里含有分隔符，也不会拼出同一个键。
 */
export function encodeRowKey(values: readonly CellValue[]): string {
  return values
    .map((value) => {
      const encoded = encodeCellValue(value);
      return `${encoded.length}:${encoded}`;
    })
    .join('');
}
