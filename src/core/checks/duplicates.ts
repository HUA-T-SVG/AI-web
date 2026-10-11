import type { ColumnData, Dataset, QualityIssue } from '../types';
import { normalizeKey } from '../normalize';
import { createIssueId } from './id';

export interface DuplicateOptions {
  /** 仅按这些列判重；缺省时使用全部列 */
  keyColumns?: string[];
}

/**
 * 重复记录检查。
 *
 * 列一律按引用定位，不走列名查找 —— CSV 表头重名很常见，
 * 而按名字 find 会把多个同名列都解析成第一列，拼出相同的签名，
 * 于是把并不重复的行报成重复并要求删除。重名列本身由
 * checkDuplicateColumnNames 单独报出。
 */
export function checkDuplicates(
  dataset: Dataset,
  options: DuplicateOptions = {},
): QualityIssue[] {
  if (dataset.columns.length === 0 || dataset.rowCount === 0) return [];

  const hasKeyColumns = options.keyColumns !== undefined && options.keyColumns.length > 0;
  const keyColumns = options.keyColumns ?? [];

  const resolved: ColumnData[] = hasKeyColumns
    ? keyColumns
        .map((name) => dataset.columns.find((column) => column.name === name))
        .filter((column): column is ColumnData => column !== undefined)
    : dataset.columns;

  const columnNames = resolved.map((column) => column.name);

  const buckets = new Map<string, number[]>();
  for (let row = 0; row < dataset.rowCount; row += 1) {
    const signature = resolved.map((column) => normalizeKey(column.values[row])).join('\u0001');
    // 全空行不参与判重，否则 Excel 尾部的大量空行会被报成一组重复
    if (signature.replace(/\u0001/g, '') === '') continue;

    const existing = buckets.get(signature);
    if (existing) existing.push(row);
    else buckets.set(signature, [row]);
  }

  const issues: QualityIssue[] = [];
  for (const rows of buckets.values()) {
    if (rows.length < 2) continue;

    issues.push({
      id: createIssueId('duplicates', rows.join('-')),
      checkId: 'duplicates',
      severity: hasKeyColumns ? 'high' : 'medium',
      title: hasKeyColumns ? '主键列存在重复取值' : `发现 ${rows.length} 条完全重复的记录`,
      description: hasKeyColumns
        ? `按列 ${columnNames.join('、')} 判重时，有 ${rows.length} 行取值相同。若该列本应唯一，说明存在重复录入。`
        : `有 ${rows.length} 行在所有列上取值完全相同，通常由重复导入或合并失误造成。`,
      evidence: {
        columns: columnNames,
        rowIndices: rows,
        statistics: {
          duplicateRows: rows.length,
          totalRows: dataset.rowCount,
        },
      },
      suggestion: {
        action: 'remove_duplicates',
        params: { rowIndices: rows, keyColumns: columnNames },
        rationale: hasKeyColumns
          ? '先确认该列是否应唯一；若应唯一，建议保留首次出现并核实其余记录的来源。'
          : '建议删除重复行、保留首次出现，并回溯导入环节。',
      },
      confidence: 1,
    });
  }

  return issues;
}
