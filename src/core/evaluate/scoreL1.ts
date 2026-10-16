import type { Dataset, QualityIssue } from '../types';

/**
 * L1（检查引擎）评测：把「实现报出来的问题」与「注入缺陷时记下的标准答案」比对。
 *
 * 这一层只评**确定性检查** —— 它们可以独立复现，所以能给硬指标。
 *
 * ## 口径（含糊会让指标失去意义）
 *
 * | 指标 | 口径 |
 * | --- | --- |
 * | 真阳性 TP | 计分答案里被任意一条问题覆盖的条数；**每条答案最多算一次** |
 * | 漏报 FN | 计分答案里没被覆盖的条数 |
 * | 误报 FP | 报出来的问题里，**没有任何计分答案与它对应**的条数 |
 * | Precision | TP / (TP + FP) |
 * | Recall | TP / (TP + FN) |
 *
 * ## 三条刻意的判断
 *
 * 1. **对照项（`scored: false`）不进 TP/FN，但会进 FP。** 它们代表「本来就
 *    不该报出来的东西」（缺失率低于阈值的列）。所以实现报了它们就是误报 ——
 *    这正是误报率的用武之地。删掉对照项会让「什么都报」的实现拿到满分。
 * 2. **同一处缺陷被两项检查各报一次算两次 TP**，因为答案里本来就是两个 kind
 *    各一条（`outliers` 与 `range-rules` 都会命中越界值）。那不是重复计数，
 *    是两个不同的结论。
 * 3. **同一处缺陷被同一项检查报两次仍只算一次 TP，且第二条不算误报。**
 *    第一条已经让答案命中，第二条是对同一处缺陷的重复表述，不构成新的误报
 *    （否则指标的精度会随去重实现的好坏而变）。
 */

/** 标准答案里的一条缺陷。字段与 `knowledge/eval/dataset/answers.json` 对齐。 */
export interface DefectAnswer {
  /** 与 core 的 checkId 一一对应 */
  kind: string;
  /**
   * 答案的作用域。**必须跟着检查的作用域走**：`missing` 这类列级检查
   * 结构上拿不到行号，用行号去要求它就是把评测口径搞错了。
   */
  scope: 'column' | 'row' | 'table';
  row?: number;
  /** 重复对记的是一对行号（原行 + 复制行），任一行在证据里即算覆盖 */
  relatesRows?: number[];
  column?: string;
  /** false 表示对照项：正确答案是「不报」 */
  scored?: boolean;
}

export interface CheckScore {
  detected: number;
  total: number;
  falsePositives: number;
  precision: number;
  recall: number;
}

export interface L1Score {
  /** 按 checkId 分组。没被报、也没有答案的检查项不出现在这里 */
  byCheck: Record<string, CheckScore>;
  overall: CheckScore;
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

function scoreOf(detected: number, total: number, falsePositives: number): CheckScore {
  return {
    detected,
    total,
    falsePositives,
    precision: ratio(detected, detected + falsePositives),
    recall: ratio(detected, total),
  };
}

/**
 * 一条问题是否覆盖了某条答案。
 *
 * 判据按 `scope` 分三种，**每种都必要且不能互相替代**：
 *   - `table`：只看 `checkId`（列名重复这类问题没有列可指）
 *   - `column`：`checkId` 相同 + 证据里含该列。**不要求行号** —— 列级检查不给行号
 *   - `row`：`checkId` 相同 + 列名（若有）命中 + 行号落在证据里；
 *     证据不带行号时视为覆盖（有些行级检查可能只给统计量）
 *
 * `relatesRows` 是重复对专用：复制产生的两行里任一在证据里，就算这处重复被发现。
 */
function covers(issue: QualityIssue, answer: DefectAnswer): boolean {
  if (issue.checkId !== answer.kind) return false;
  if (answer.scope === 'table') return true;

  if (answer.column !== undefined && !issue.evidence.columns.includes(answer.column)) return false;
  if (answer.scope === 'column') return true;

  const rows = issue.evidence.rowIndices ?? [];
  if (answer.relatesRows !== undefined) {
    if (rows.length === 0) return true;
    return answer.relatesRows.some((row) => rows.includes(row));
  }
  if (answer.row === undefined) return true;
  return rows.length === 0 || rows.includes(answer.row);
}

export function scoreL1(
  issues: QualityIssue[],
  answers: DefectAnswer[],
  dataset: Dataset,
): L1Score {
  // dataset 目前不参与计算：匹配只看问题与答案。参数留着是因为
  // 「按行覆盖率评分」需要它（知道该列共有多少行才能算覆盖率），
  // 而那一步已经在计划里显式排除了 —— 见文件末尾说明。
  void dataset;

  const scored = answers.filter((answer) => answer.scored !== false);

  // 每条计分答案最多算一次命中：同一处缺陷被同一项检查报两次不虚高评分
  const detectedAnswers = scored.filter((answer) =>
    issues.some((issue) => covers(issue, answer)),
  );

  // 误报：这条问题没有对应任何**计分**答案。注意对照项也不算「对应」——
  // 它们代表不该报的东西，报了就是误报
  const falsePositiveIssues = issues.filter(
    (issue) => !scored.some((answer) => covers(issue, answer)),
  );

  const kinds = new Set<string>([
    ...scored.map((answer) => answer.kind),
    ...issues.map((issue) => issue.checkId),
  ]);

  const byCheck: Record<string, CheckScore> = {};
  for (const kind of kinds) {
    const total = scored.filter((answer) => answer.kind === kind).length;
    const detected = detectedAnswers.filter((answer) => answer.kind === kind).length;
    const falsePositives = falsePositiveIssues.filter((issue) => issue.checkId === kind).length;
    // 既没答案也没误报的项不占位置，否则报告里会全是 0/0 的噪声行
    if (total === 0 && falsePositives === 0) continue;
    byCheck[kind] = scoreOf(detected, total, falsePositives);
  }

  return {
    byCheck,
    overall: scoreOf(detectedAnswers.length, scored.length, falsePositiveIssues.length),
  };
}

/*
 * 已知的粗糙处（有意留着，不是遗漏）：
 *
 * **列级缺陷只要该列被报就计入**，不检查「报出的范围覆盖了百分之多少」。
 * 于是「一列 201 行缺失、实现只报出 1 行」与「全部报出」得分相同。
 *
 * 要做按覆盖率的评分，需要答案带上被注入的行区间（`injectedCount` 已经有了，
 * 但还缺区间），以及检查结果里可信的行集合 —— 而列级检查**本来就不给行号**，
 * 只能借助 `evidence.statistics` 里的计数（如 `missingCount`），那是按检查项
 * 定制的口径。在只有 5 处列级注入的规模下，为它引入一套按检查项分派的口径
 * 不划算，也容易让评分逻辑本身成为误差来源。
 *
 * 所以这里如实说明：**列级缺陷的 Recall 是「有没有报」而不是「报全了没有」。**
 * 报告里要写明这一点，否则读的人会以为 Recall 1.0 等于「一条不漏」。
 */
