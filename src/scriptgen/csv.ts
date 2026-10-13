import type { Dataset } from '@/core';

/**
 * 数据集 → CSV 文本。
 *
 * 三处不是可选项的细节，都对应中文数据在 Excel 里的真实表现：
 *
 * 1. **开头写 UTF-8 BOM。** 不写的话，Windows 上的 Excel 会按本机 ANSI（GBK）解码，
 *    整份中文全是乱码 —— 而用户拿到 CSV 的第一件事就是双击打开它。
 *    代价是别的工具会在第一列名里看到一个不可见字符，所以它只能放在第一格。
 * 2. **换行用 CRLF。** RFC 4180 如此，且 Excel 对纯 LF 的处理在部分版本上有出入。
 * 3. **含分隔符、引号、换行的字段加引号，内部引号翻倍。** 备注类字段里
 *    出现逗号和换行是常态，不转义就把整份文件的行列结构破坏了。
 */
export function toCsv(dataset: Dataset): string {
  const escape = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    const text = String(value);
    if (!/[",\r\n]/.test(text)) return text;
    return `"${text.replace(/"/g, '""')}"`;
  };

  const lines = [dataset.columns.map((column) => escape(column.name)).join(',')];

  for (let row = 0; row < dataset.rowCount; row += 1) {
    lines.push(dataset.columns.map((column) => escape(column.values[row])).join(','));
  }

  return `\uFEFF${lines.join('\r\n')}\r\n`;
}
