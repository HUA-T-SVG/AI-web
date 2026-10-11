import Papa from 'papaparse';
import type { CellValue, ColumnData, Dataset } from '@/core';
import { decodeBuffer } from './encoding';
import {
  applyRowLimit,
  createParseResult,
  MAX_ROWS,
  type ParseError,
  type ParseResult,
} from './types';

function toCellValue(raw: string | undefined): CellValue {
  if (raw === undefined) return null;
  const trimmed = raw.trim();
  return trimmed === '' ? null : trimmed;
}

function columnName(raw: string | undefined, columnIndex: number): string {
  const trimmed = (raw ?? '').trim();
  return trimmed === '' ? `未命名列 ${columnIndex + 1}` : trimmed;
}

export function parseCsv(input: {
  buffer: ArrayBuffer;
  fileName: string;
  fileSize: number;
}): ParseResult | ParseError {
  const { text, encoding } = decodeBuffer(input.buffer);

  if (text.trim() === '') {
    return { kind: 'empty-file', message: '这个文件是空的，没有任何内容。' };
  }

  const parsed = Papa.parse<string[]>(text, {
    // 不让 Papa 做类型转换：类型推断是 core 的职责，解析层只负责切分
    dynamicTyping: false,
    skipEmptyLines: 'greedy',
  });

  const rows = parsed.data.filter((row) => Array.isArray(row));
  if (rows.length === 0) {
    return { kind: 'no-header', message: '没有读到任何内容行。' };
  }

  const header = rows[0] ?? [];
  const dataRows = rows.slice(1);

  if (header.length === 0) {
    return { kind: 'no-header', message: '第一行是空的，没有读到表头。' };
  }
  if (dataRows.length === 0) {
    return { kind: 'no-header', message: '文件里只有表头，没有数据行。' };
  }

  const { kept, truncated } = applyRowLimit(dataRows);
  const warnings: string[] = [];

  if (truncated) {
    warnings.push(
      `数据超过 ${MAX_ROWS.toLocaleString('zh-CN')} 行，只分析了前 ${MAX_ROWS.toLocaleString('zh-CN')} 行。`,
    );
  }

  // 字段数与表头不一致的行要报出来：多出来的字段无处安放，缺少的字段会被补空，
  // 两者都会让后续统计失真，静默处理会让用户拿到错误的画像
  const mismatched: number[] = [];
  kept.forEach((row, index) => {
    if (row.length !== header.length) mismatched.push(index + 2); // +2：表头占第 1 行
  });
  if (mismatched.length > 0) {
    const shown = mismatched.slice(0, 10).join('、');
    const suffix = mismatched.length > 10 ? ` 等 ${mismatched.length} 行` : ' 行';
    warnings.push(
      `第 ${shown}${suffix}的字段数与表头不一致，多出的字段已忽略，缺少的已按空值处理。`,
    );
  }

  const columns: ColumnData[] = header.map((rawName, columnIndex) => ({
    name: columnName(rawName, columnIndex),
    values: kept.map((row) => toCellValue(row[columnIndex])),
  }));

  const dataset: Dataset = { columns, rowCount: kept.length };

  return createParseResult({
    dataset,
    fileName: input.fileName,
    fileSize: input.fileSize,
    format: 'csv',
    encoding,
    truncated,
    warnings,
  });
}
