import type { Dataset } from '@/core';

/**
 * 行数上限。
 *
 * 浏览器里全部数据常驻内存，一行按 50 列粗估约 400 字节，
 * 20 万行约 80MB —— 在 16GB 内存的开发机上留有余量，
 * 同时远超高校科研数据的实际规模（通常几千到几万行）。
 */
export const MAX_ROWS = 200_000;

/** 文件体积上限，超过则不解析，避免把浏览器拖死 */
export const MAX_FILE_BYTES = 50 * 1024 * 1024;

export type ParseFormat = 'csv' | 'xlsx';

export interface ParseMeta {
  fileName: string;
  fileSize: number;
  format: ParseFormat;
  /** CSV 才有的探测结果 */
  encoding?: string;
  /** Excel 才有的工作表名 */
  sheetName?: string;
  /** 是否因超过上限被截断 */
  truncated: boolean;
  /** 可继续但不致命的问题，例如「第 12 行字段数多于表头」 */
  warnings: string[];
}

export interface ParseResult {
  dataset: Dataset;
  meta: ParseMeta;
}

export type ParseErrorKind =
  | 'unsupported-format'
  | 'file-too-large'
  | 'empty-file'
  | 'no-header'
  | 'corrupt';

export interface ParseError {
  kind: ParseErrorKind;
  /** 直接展示给用户的中文说明 */
  message: string;
}

/** 类型守卫，用于区分 ParseResult 与 ParseError */
export function isParseError(value: ParseResult | ParseError): value is ParseError {
  return 'kind' in value && 'message' in value;
}

/**
 * 应用行数上限。
 *
 * 单独抽成函数是为了能用一个很小的上限来测试截断行为 —— 否则要么构造
 * 20 万行的测试数据（慢），要么这条分支永远没有覆盖。
 */
export function applyRowLimit<T>(
  rows: readonly T[],
  maxRows: number = MAX_ROWS,
): { kept: T[]; truncated: boolean } {
  if (maxRows <= 0) return { kept: [], truncated: rows.length > 0 };
  if (rows.length <= maxRows) return { kept: [...rows], truncated: false };
  return { kept: rows.slice(0, maxRows), truncated: true };
}

export function createParseResult(input: {
  dataset: Dataset;
  fileName: string;
  fileSize: number;
  format: ParseFormat;
  encoding?: string;
  sheetName?: string;
  truncated?: boolean;
  warnings?: string[];
}): ParseResult {
  return {
    dataset: input.dataset,
    meta: {
      fileName: input.fileName,
      fileSize: input.fileSize,
      format: input.format,
      encoding: input.encoding,
      sheetName: input.sheetName,
      truncated: input.truncated ?? false,
      warnings: input.warnings ?? [],
    },
  };
}
