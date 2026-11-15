import { fileTooLargeError } from './limits';
import { MAX_FILE_BYTES, type ParseError, type ParseFormat, type ParseResult } from './types';

export { fileTooLargeError } from './limits';

/** 支持的格式。刻意不含 .xls —— 老格式需要含未修复 CVE 的库，见计划 Global Constraints */
export function pickFormat(fileName: string): ParseFormat | null {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.csv')) return 'csv';
  if (lower.endsWith('.xlsx')) return 'xlsx';
  return null;
}

export async function parseFile(input: {
  buffer: ArrayBuffer;
  fileName: string;
  fileSize: number;
}): Promise<ParseResult | ParseError> {
  const format = pickFormat(input.fileName);

  if (format === null) {
    const isLegacyExcel = input.fileName.toLowerCase().endsWith('.xls');
    return {
      kind: 'unsupported-format',
      message: isLegacyExcel
        ? '暂不支持旧版 .xls 格式。请在 Excel 里另存为 .xlsx 后重新上传。'
        : '只支持 .csv 和 .xlsx 两种格式。请确认文件类型后重试。',
    };
  }

  if (input.fileSize > MAX_FILE_BYTES) {
    return fileTooLargeError(input.fileSize);
  }

  // 具体解析库按格式懒加载：papaparse（CSV）与 read-excel-file（XLSX）加起来一百多 KB，
  // 只在真的上传文件时才需要；静态引入会让入口页为一次「还没发生的上传」买单。
  if (format === 'csv') {
    const { parseCsv } = await import('./csv');
    return parseCsv(input);
  }
  const { parseXlsx } = await import('./excel');
  return parseXlsx(input);
}
