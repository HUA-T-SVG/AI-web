import type { CellValue } from '../types';
import { isMissingValue } from '../types';

/** 零宽与方向控制字符。从网页复制问卷选项时经常带进来，肉眼不可见但会让分组错位。 */
const INVISIBLE_CHARS = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g;

/**
 * 全角转半角。覆盖 U+3000 全角空格与 U+FF01–U+FF5E 全角 ASCII 区。
 * 只做字符层面的映射，不处理大小写。
 */
export function toHalfWidth(input: string): string {
  let out = '';
  for (const ch of input) {
    const code = ch.codePointAt(0);
    if (code === undefined) continue;
    if (code === 0x3000) {
      out += ' ';
    } else if (code >= 0xff01 && code <= 0xff5e) {
      out += String.fromCodePoint(code - 0xfee0);
    } else {
      out += ch;
    }
  }
  return out;
}

/**
 * 文本归一：去不可见字符 → 全角转半角 → 去首尾空白 → 压缩内部连续空白。
 * 刻意不做大小写转换 —— 「MG」与「mg」是否等价取决于业务场景，交给调用方决定。
 */
export function normalizeText(input: string): string {
  return toHalfWidth(input.replace(INVISIBLE_CHARS, ''))
    .trim()
    .replace(/\s+/g, ' ');
}

/** 用于分组与比较的归一化键：在 normalizeText 基础上统一小写，缺失值映射为空串。 */
export function normalizeKey(value: CellValue | undefined): string {
  if (isMissingValue(value)) return '';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return normalizeText(value).toLowerCase();
}
