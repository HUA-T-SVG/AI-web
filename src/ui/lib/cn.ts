import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * 合并类名。
 *
 * 用 twMerge 而不是直接拼字符串，是因为 Tailwind 的同类工具类会同时留在
 * class 属性里，最终哪个生效取决于 CSS 的生成顺序而不是书写顺序 ——
 * 传入 px-2 和 px-4 时保留后者，才符合调用方的直觉。
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
