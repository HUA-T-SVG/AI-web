import type { AppliedAction, CellValue, Dataset } from '@/core';
import { buildPandasScript } from './pandas';
import type {
  Provenance,
  ProvenanceDecision,
  ProvenanceEnvironment,
  ProvenanceStep,
} from './types';

/**
 * 数据指纹。
 *
 * 用途只有一个：**核对「导出的这份是不是当时那一份」**。所以它必须
 *
 * - **与行序无关**：同一批数据换个顺序不该被当成另一份（读文件时行序可能变）
 * - **与列序无关**：同一张表调整列顺序仍算同一份
 * - **保留行内对应关系**：只按列取哈希、再各自排序，会丢掉「哪个值属于哪条记录」——
 *   两份只交换了某人分数的数据会得到同一个指纹。所以先把**整行**编码，再对行排序
 * - **保留取值类型**：`1` / `'1'`、`null` / `'null'` 不能撞成同一个串
 * - **同量级下稳定**：同一份数据算两次必须一样
 *
 * 刻意不用 `crypto.subtle`：那是浏览器 API，会破坏 `core` 平台无关那条约束，
 * 而这个指纹是密码学用途之外的核对标记，不需要抗碰撞强度。
 *
 * **口径变更**：2026-10-22 起改为行级编码。此前生成的留痕指纹不能与新版本互相比对
 * （算法不同），旧文件仍带着当时的 `environment.appVersion`，可按版本区分。
 */
export function datasetFingerprint(dataset: Dataset): string {
  // 行内按列名排序：列顺序不影响结果；每行编码后再排序：行顺序不影响结果
  const columns = [...dataset.columns].sort((left, right) =>
    left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
  );
  // 列名前缀与长度前缀都算一次：5 万行 × 50 列时不重复做字符串拼接
  const prefixes = columns.map((column) => `${column.name.length}:${column.name}=`);

  const rows = new Array<string>(dataset.rowCount);
  for (let row = 0; row < dataset.rowCount; row += 1) {
    const segments = new Array<string>(columns.length);
    for (let index = 0; index < columns.length; index += 1) {
      const encoded = encodeCell(columns[index]!.values[row] ?? null);
      // 长度前缀让每一段可自定界：值里出现分隔符也不会把两行编码成同一个串
      segments[index] = `${prefixes[index]}${encoded.length}:${encoded}`;
    }
    rows[row] = segments.join('\u0001');
  }
  rows.sort();

  return hash32(`rows:${dataset.rowCount}\n${rows.join('\n')}`)
    .toString(16)
    .padStart(8, '0');
}

/**
 * 单元格的类型化编码。
 *
 * `String(1)` 与 `String('1')` 相同、`String(null)` 与 `String('null')` 相同，
 * 旧实现因此把不同数据算成同一个指纹。类型前缀让这些取值在编码层就分开。
 */
function encodeCell(value: CellValue): string {
  if (value === null) return 'z';
  if (typeof value === 'number') return `n${value}`;
  if (typeof value === 'boolean') return value ? 'b1' : 'b0';
  return `s${value.length}:${value}`;
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
  /**
   * 人工决定与理由。界面从 reviewStore 映射后传入；不传则记为「没有人工决定」。
   * 不让 scriptgen 直接依赖 reviewStore：这一层保持纯数据，才能被脚本/测试复用。
   */
  decisions?: readonly ProvenanceDecision[];
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
    decisions = [],
  } = input;

  const fingerprintSource = original ?? dataset;
  const datasetFp = datasetFingerprint(fingerprintSource);
  // 没做过清洗时 original 与 dataset 是同一个引用：同一份数据没必要算两遍
  const resultFp = fingerprintSource === dataset ? datasetFp : datasetFingerprint(dataset);

  return {
    // 指纹算在**清洗前**的数据上：它的用途是让用户核对「导出的这份是不是我最初
    // 上传的那份」。用清洗后的数据算就对不上了 —— 原始文件永远匹配不上留痕
    datasetFingerprint: datasetFp,
    resultFingerprint: resultFp,
    sessionStartedAt,
    completedAt: new Date().toISOString(),
    steps: applied.map(stepOf),
    decisions: decisions.map((decision) => ({ ...decision })),
    generatedScript: buildPandasScript({
      dataset,
      sourceFileName,
      actions: applied.map((item) => item.action),
    }),
    environment,
  };
}
