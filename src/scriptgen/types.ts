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
  /**
   * 生成这份留痕时的数据版本。
   *
   * 可选是为了兼容既有调用方；产品里会写入。理由：同一份文件在不同版本上
   * 执行过不同动作，只靠时间戳无法判断这份留痕对应哪一版数据。
   */
  dataVersion?: number;
}

/** 留痕里的一条人工决定。字段名刻意展平 —— 这份 JSON 是给人读的。 */
export type ProvenanceDecisionKind = 'pending' | 'accepted' | 'modified' | 'rejected';

export interface ProvenanceDecision {
  title: string;
  severity: 'high' | 'medium' | 'low';
  decision: ProvenanceDecisionKind;
  /**
   * 用户填写的理由；没填为 null。
   *
   * 不用空字符串：`""` 与「没写」在复核时是两种状态，留痕要能区分。
   */
  note: string | null;
  suggestionAction: string;
  suggestionRationale: string;
  suggestionParams: Record<string, unknown>;
  /** decision 为 modified 时，用户实际改成了什么 */
  overrideAction?: string;
  overrideParams?: Record<string, unknown>;
}

export interface Provenance {
  /** **清洗前**数据的指纹，用于核对「导出的这份是不是最初上传的那份」 */
  datasetFingerprint: string;
  /** 清洗后数据的指纹。与 `datasetFingerprint` 一起说明「从哪来、到哪去」 */
  resultFingerprint: string;
  sessionStartedAt: string;
  completedAt: string;
  steps: ProvenanceStep[];
  /**
   * 人工确认记录（接受 / 修改后执行 / 拒绝 / 待确认）与理由。
   *
   * `steps` 只记真正执行过的动作；被拒绝的、只写理由不改数据的建议不会进 steps。
   * 但「为什么没做」和「为什么这样做」同样是可追溯性的一部分，所以单独列出。
   */
  decisions: ProvenanceDecision[];
  /** 与 `steps` 等价的 pandas 脚本。留痕的全部意义是「可复现」 */
  generatedScript: string;
  environment: ProvenanceEnvironment;
}

export interface ScriptInput {
  dataset: Dataset;
  sourceFileName: string;
  actions: AppliedAction['action'][];
}
