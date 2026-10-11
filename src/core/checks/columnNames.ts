import type { Dataset, QualityIssue } from '../types';
import { createIssueId } from './id';

/**
 * 列名重复检查。
 *
 * CSV 表头重名很常见（同一份问卷被合并两次、导出工具截断长表头等）。
 * 重名列会让按名字定位的逻辑全部失效，所以必须在最前面报出来，
 * 而不是留给下游各自处理。
 */
export function checkDuplicateColumnNames(dataset: Dataset): QualityIssue[] {
  const indicesByName = new Map<string, number[]>();

  dataset.columns.forEach((column, index) => {
    const indices = indicesByName.get(column.name);
    if (indices) indices.push(index);
    else indicesByName.set(column.name, [index]);
  });

  const issues: QualityIssue[] = [];
  for (const [name, indices] of indicesByName) {
    if (indices.length < 2) continue;

    issues.push({
      id: createIssueId('duplicate-column-names', name),
      checkId: 'duplicate-column-names',
      severity: 'high',
      title: `列名「${name}」重复出现 ${indices.length} 次`,
      description:
        '同名列会让按列名定位的检查与清洗动作指向错误的数据，且导出脚本无法区分它们。请先重命名再继续分析。',
      evidence: {
        columns: [name],
        statistics: {
          columnIndices: indices.join('、'),
          occurrenceCount: indices.length,
        },
      },
      suggestion: {
        action: 'rename_columns',
        params: { name, indices },
        rationale: '建议为重复表头加上区分后缀（如「年龄_1」「年龄_2」），或核对原始表头是否被截断。',
      },
      confidence: 1,
    });
  }

  return issues;
}
