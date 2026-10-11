/**
 * core 包的公共类型契约。
 *
 * 本文件不得引用任何浏览器或 Node 专有 API —— 这是 core 能被浏览器
 * 与 MCP Server 共用同一份实现的前提（见设计文档 §3.4）。
 */

/** 单元格取值。null 表示缺失，注意 0 与 false 是有效取值。 */
export type CellValue = string | number | boolean | null;

export type ColumnType = 'number' | 'category' | 'text' | 'boolean' | 'empty' | 'mixed';

export interface ColumnData {
  name: string;
  /** 长度与 Dataset.rowCount 一致，缺失位置为 null */
  values: CellValue[];
}

export interface Dataset {
  columns: ColumnData[];
  rowCount: number;
}

export interface NumericStats {
  min: number;
  max: number;
  mean: number;
  q1: number;
  median: number;
  q3: number;
  stdDev: number;
}

export interface ColumnProfile {
  name: string;
  type: ColumnType;
  missingCount: number;
  missingRate: number;
  uniqueCount: number;
  /** 仅 category 与 boolean 列填充 */
  valueDistribution?: Record<string, number>;
  /** 仅 number 列填充 */
  numeric?: NumericStats;
  /**
   * 供人阅读的样例，最多 5 个。当前取行序前 5 个非缺失值。
   *
   * 注意：设计文档 §3.3 要求进入 LLM 摘要的样例必须是低频样例并受
   * 「样例脱敏」开关控制，因为它是摘要中唯一可能外传的原始内容。
   * 本阶段不外传任何样例，但后续若要把该字段直接透传给模型，
   * 必须先实现低频采样与脱敏，不要直接使用本字段。
   */
  samples: string[];
}

export interface DatasetProfile {
  rowCount: number;
  columnCount: number;
  columns: ColumnProfile[];
  /** CSV 表头重名时常见，无重名时为空数组 */
  duplicateColumnNames: string[];
}

export type Severity = 'high' | 'medium' | 'low';

export interface IssueEvidence {
  columns: string[];
  /** 涉及的行下标，从 0 开始 */
  rowIndices?: number[];
  statistics: Record<string, number | string>;
}

export interface IssueSuggestion {
  /** 动作标识，如 fill_or_drop、merge_categories */
  action: string;
  params: Record<string, unknown>;
  rationale: string;
}

export interface QualityIssue {
  /** 同一次运行内唯一 */
  id: string;
  checkId: string;
  severity: Severity;
  title: string;
  description: string;
  evidence: IssueEvidence;
  suggestion?: IssueSuggestion;
  /** 0–1 */
  confidence: number;
}

export type CheckFn = (dataset: Dataset) => QualityIssue[];

export function createEmptyDataset(): Dataset {
  return { columns: [], rowCount: 0 };
}

/**
 * 判断取值是否应视为缺失。
 * 判定为纯空白的字符串也算缺失 —— 从 Excel 导出时常留下空格。
 */
export function isMissingValue(value: CellValue | undefined): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  return false;
}
