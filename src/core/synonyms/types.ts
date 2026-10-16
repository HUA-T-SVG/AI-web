/**
 * 类别同义归并的公共类型。
 *
 * 这一层刻意不含任何平台相关的东西：`core` 要能被浏览器与将来的 MCP Server
 * 共用同一份实现（设计文档 §3.4），所以向量由调用方算好传进来（见 SynonymVectors），
 * core 只做余弦与决策。
 */

/** 归一化后的一个取值，连同它在这一列里出现过的所有原始写法。 */
export interface SynonymCandidate {
  /** 归一化键（normalizeKey 的结果） */
  key: string;
  /** 原始写法，界面要展示「硕士／研究生」的差异 */
  variants: string[];
  count: number;
}

/** 一对候选之间的信号。三者都缺时不下结论。 */
export interface SynonymSignals {
  /** 两个 key，按字典序排好，保证同一对只出现一次 */
  a: string;
  b: string;
  /** L1：规范化后是否相等 */
  normalizedEqual: boolean;
  /** L2：字面相似度 0–1 */
  literalSimilarity: number;
  /** L3：语义余弦。未算过时为 undefined —— 不是 0，0 是一个有效余弦 */
  semanticCosine?: number;
}

export type SynonymVerdict = 'merge' | 'review' | 'ignore';

/**
 * 四个阈值，**由标注集扫描得出，不预设**（spec §5.5.4）。
 *
 * 实际取值与出处见 `decide.ts` 的 DEFAULT_THRESHOLDS —— 那里写着为什么
 * `semanticHigh` 是「不可达」而不是某个数字。
 *
 * 每一条判定路径都有一个「归并」下界与一个「待确认」下界。这不是对称洁癖：
 * 归并阈值要满足 spec 的精度硬指标（≥0.95），达标点必然落在分布的很右边，
 * 只用它会把大量本该被提起的候选静默丢掉；而**待确认不自动改数据**，
 * 允许精度低得多。L2 与 L3 都按这个形状配阈值。
 */
export interface SynonymThresholds {
  /** T_L2：字面相似度的**归并**阈值（自动改数据的边界，受 spec 精度指标约束） */
  literal: number;
  /** T_L2_low：字面相似度的**待确认**下界（只提问题，不执行） */
  literalReview: number;
  /** T_high：L3 直接建议归并的下界 */
  semanticHigh: number;
  /** T_low：L3 标记「待确认」的下界 */
  semanticLow: number;
}

/** 一列的全部候选与两两信号。 */
export interface SynonymAnalysis {
  column: string;
  candidates: SynonymCandidate[];
  signals: SynonymSignals[];
}
