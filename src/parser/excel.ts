import readXlsxFile from 'read-excel-file/universal';
import type { CellValue, ColumnData, Dataset } from '@/core';
import {
  applyRowLimit,
  createParseResult,
  MAX_ROWS,
  type ParseError,
  type ParseResult,
} from './types';

function toCellValue(raw: unknown): CellValue {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number' || typeof raw === 'boolean') return raw;
  if (raw instanceof Date) return raw.toISOString().slice(0, 10);
  const text = String(raw).trim();
  return text === '' ? null : text;
}

function columnName(raw: unknown, columnIndex: number): string {
  const trimmed = String(raw ?? '').trim();
  return trimmed === '' ? `未命名列 ${columnIndex + 1}` : trimmed;
}

export async function parseXlsx(input: {
  buffer: ArrayBuffer;
  fileName: string;
  fileSize: number;
}): Promise<ParseResult | ParseError> {
  if (input.buffer.byteLength === 0) {
    return { kind: 'empty-file', message: '这个文件是空的，没有任何内容。' };
  }

  let sheets: Awaited<ReturnType<typeof readXlsxFile>>;
  try {
    // 用 /universal 入口：浏览器、Web Worker 与 Node 下都能工作。
    // v9 的 readXlsxFile 返回工作表数组，数据在每项的 data 字段里。
    sheets = await readXlsxFile(input.buffer);
  } catch {
    return {
      kind: 'corrupt',
      message: `无法读取「${input.fileName}」。请确认它是完整的 .xlsx 文件（旧版 .xls 请先在 Excel 里另存为 .xlsx），并且没有加密。`,
    };
  }

  const firstSheet = sheets[0];
  if (firstSheet === undefined) {
    return { kind: 'no-header', message: '这个工作簿里没有任何工作表。' };
  }

  const rows = firstSheet.data;
  if (rows.length === 0) {
    return { kind: 'no-header', message: `工作表「${firstSheet.sheet}」是空的。` };
  }

  const header = rows[0] ?? [];
  const dataRows = rows.slice(1);

  if (header.length === 0) {
    return { kind: 'no-header', message: '第一行是空的，没有读到表头。' };
  }
  if (dataRows.length === 0) {
    return { kind: 'no-header', message: `工作表「${firstSheet.sheet}」里只有表头，没有数据行。` };
  }

  const { kept, truncated } = applyRowLimit(dataRows);
  const warnings: string[] = [];

  if (truncated) {
    warnings.push(
      `数据超过 ${MAX_ROWS.toLocaleString('zh-CN')} 行，只分析了前 ${MAX_ROWS.toLocaleString('zh-CN')} 行。`,
    );
  }
  if (sheets.length > 1) {
    warnings.push(
      `这个工作簿有 ${sheets.length} 个工作表，目前只分析了第一个「${firstSheet.sheet}」。`,
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
    format: 'xlsx',
    sheetName: firstSheet.sheet,
    truncated,
    warnings,
  });
}
