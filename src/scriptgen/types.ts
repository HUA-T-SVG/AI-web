import type { AppliedAction } from '@/core';
import type { Dataset } from '@/core';

/**
 * 脚本生成与处理留痕的类型（对应设计文档 §6.5 的 `Provenance`）。
 */

/** 留痕里的一个步骤。字段名刻意展平 —— 这份 JSON 是给人读的 */
export interface ProvenanceStep {
  index: number;
  actionType: string;
  targetColumns: string[];
  params: Record<string, unknown>;
  appliedAt: string;
  changedCells: number;
  beforeRowCount: number;
  afterRowCount: number;
}

export interface ProvenanceEnvironment {
  appVersion: string;
  /** 规则库版本，如「113 条」 */
  ruleLibraryVersion: string;
  /** 语义模型标识。换模型后同一条结论的可信度不同，所以要记下来 */
  embeddingModel: string;
}

export interface Provenance {
  /** **清洗前**数据的指纹，用于核对「导出的这份是不是最初上传的那份」 */
  datasetFingerprint: string;
  /** 清洗后数据的指纹。与 `datasetFingerprint` 一起说明「从哪来、到哪去」 */
  resultFingerprint: string;
  sessionStartedAt: string;
  completedAt: string;
  steps: ProvenanceStep[];
  /** 与 `steps` 等价的 pandas 脚本。留痕的全部意义是「可复现」 */
  generatedScript: string;
  environment: ProvenanceEnvironment;
}

export interface ScriptInput {
  dataset: Dataset;
  sourceFileName: string;
  actions: AppliedAction['action'][];
}
