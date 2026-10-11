import { parseCsv } from './csv';
import { parseXlsx } from './excel';
import { MAX_FILE_BYTES, type ParseError, type ParseFormat, type ParseResult } from './types';

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
    const limitMb = Math.round(MAX_FILE_BYTES / 1024 / 1024);
    const actualMb = (input.fileSize / 1024 / 1024).toFixed(1);
    return {
      kind: 'file-too-large',
      message: `文件有 ${actualMb} MB，超过 ${limitMb} MB 的上限。建议先在 Excel 里拆分成多个文件。`,
    };
  }

  return format === 'csv' ? parseCsv(input) : parseXlsx(input);
}
