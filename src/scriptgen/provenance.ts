import type { AppliedAction, Dataset } from '@/core';
import { buildPandasScript } from './pandas';
import type { Provenance, ProvenanceEnvironment, ProvenanceStep } from './types';

/**
 * 数据指纹。
 *
 * 用途只有一个：**核对「导出的这份是不是当时那一份」**。所以它必须
 *
 * - **与行序无关**：同一批数据换个顺序不该被当成另一份（读文件时行序可能变）
 * - **同量级下稳定**：同一份数据算两次必须一样
 *
 * 刻意不用 `crypto.subtle`：那是浏览器 API，会破坏 `core` 平台无关那条约束，
 * 而这个指纹是密码学用途之外的核对标记，不需要抗碰撞强度。
 */
export function datasetFingerprint(dataset: Dataset): string {
  const parts: string[] = [`rows:${dataset.rowCount}`];

  for (const column of dataset.columns) {
    // 取值先各自哈希再排序：这样列内顺序变化不影响结果，而取值本身变化会
    const valueHashes = column.values.map((value) => hash32(String(value ?? '\u0000'))).sort();
    parts.push(`${column.name}:${valueHashes.join(',')}`);
  }

  // 列名排序：列顺序变化同样不该改变指纹
  return hash32(parts.sort().join('|')).toString(16).padStart(8, '0');
}

/** FNV-1a 32 位。短、稳定、无依赖 —— 核对用途不需要更强的东西。 */
function hash32(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function stepOf(applied: AppliedAction, index: number): ProvenanceStep {
  return {
    index,
    actionType: applied.action.action,
    targetColumns: applied.action.columns,
    params: applied.action.params ?? {},
    appliedAt: applied.appliedAt,
    changedCells: applied.changedCells,
    beforeRowCount: applied.before.rowCount,
    afterRowCount: applied.after.rowCount,
  };
}

export interface ProvenanceInput {
  /** 清洗后的数据，用于生成脚本与结果指纹 */
  dataset: Dataset;
  /**
   * 清洗前的原始数据。
   *
   * 指纹算在它上面 —— 留痕的用途是让用户核对「导出的这份是不是我最初上传的那份」，
   * 用清洗后的数据算就对不上了。不给则退回用 `dataset`（调用方拿不到原始数据时）。
   */
  original?: Dataset;
  applied: AppliedAction[];
  sessionStartedAt: string;
  environment: ProvenanceEnvironment;
  sourceFileName?: string;
}

/**
 * 组装处理留痕（设计文档 §6.5）。
 *
 * **动作序列是核心，不是结果。** 结果只是动作的后果，可以从动作序列重放出来；
 * 反过来不行 —— 只看结果说不出「为什么这一格变了」。所以 `steps` 与
 * `generatedScript` 是这份留痕的主体，而 `datasetFingerprint` 只负责把
 * 「这份留痕对应哪份数据」钉住。
 */
export function buildProvenance(input: ProvenanceInput): Provenance {
  const {
    dataset,
    original,
    applied,
    sessionStartedAt,
    environment,
    sourceFileName = '原始数据.csv',
  } = input;

  return {
    // 指纹算在**清洗前**的数据上：它的用途是让用户核对「导出的这份是不是我最初
    // 上传的那份」。用清洗后的数据算就对不上了 —— 原始文件永远匹配不上留痕
    datasetFingerprint: datasetFingerprint(original ?? dataset),
    resultFingerprint: datasetFingerprint(dataset),
    sessionStartedAt,
    completedAt: new Date().toISOString(),
    steps: applied.map(stepOf),
    generatedScript: buildPandasScript({
      dataset,
      sourceFileName,
      actions: applied.map((item) => item.action),
    }),
    environment,
  };
}
