import type { Dataset, QualityIssue } from '../types';
import { createIssueId } from '../checks/id';
import { normalizeText } from '../normalize';
import { isGuardedPair } from './guard';
import { literalSimilarity } from './literal';
import type { SynonymAnalysis, SynonymCandidate, SynonymThresholds, SynonymVerdict } from './types';

/**
 * 四个阈值。**它们不是拍脑袋定的**，出处是标注集上的扫描
 * （spec §5.5.4 的方法：`t ∈ [0.50, 0.99]` 步长 0.01；标注集 34 字段 /
 * 242 正例 / 911 负例，即 `knowledge/labels/synonym-labels.json`）。
 *
 * **L2（字面层）**：`literal = 0.95` 是 spec「Precision@建议阈值 ≥ 0.95」
 * 那一条的达标点，实测精度 1.0000、召回 0.0561。这个数此前从未被扫过 ——
 * 原来的 0.86 精度只有 **0.8222**，直接违反 spec 的硬指标。
 *
 * 而达标点必然落在分布很右边：只用它，召回只剩 0.056，绝大多数本该被提起的
 * 同义写法会静默消失。所以配一条待确认下界 `literalReview = 0.84`
 * （F0.5 最优点：精度 0.8036 / 召回 0.4206）—— **它只提问题，不自动改数据**，
 * 用户可以据此核对，而不会有人替他合并掉。取 F0.5 而不是取召回最大的点，
 * 是因为 spec §5.5.4 定的是「Precision 优先」，而 F0.5 把精度权重放大 5 倍，
 * 正是这个口径的形式化；再往左取会拿「多提出来的一批」去换用户要逐条核对的误报。
 *
 * **L3（语义层）**：`semanticHigh = Infinity`（不可达）：实测在 [0.50, 0.99] 上
 * 任何阈值下 Precision 都到不了 0.95 —— 最好只有 0.5242。原因是余弦高达 1.0000
 * 的负例成片出现（`A型／B型`、`M／F`、`mL／L` 这类短串的退化向量），
 * 不是「语义判断差一点」。因此 **L3 永不单独触发归并** —— 这正是 spec §5.5.6 的降级方案。
 *
 * `semanticLow = 0.70` 是唯一一个带取舍的数：取它是因为实测「硕士／研究生」
 * 在 q8 下余弦 **0.7195**，必须落进待确认区间，否则产品的招牌用例
 * （`tests/e2e/fixtures/messy-survey.csv` 里的「硕士／研究生」）一条都不会出现。
 * 代价是待确认区间的精度只有约 0.45 —— 所以 **待确认只能作为「问题」提出，
 * 绝不能自动执行**，这一点由 `checkCategorySynonyms` 产出的文本与置信度承担。
 *
 * 每条曲线的完整数据在 `src/core/synonyms/literal-scan.test.ts`（跑的是本文件
 * 的生产实现，不是另抄一份）与 `knowledge/reports/embedding-validation.md`。
 */
export const DEFAULT_THRESHOLDS: SynonymThresholds = {
  literal: 0.95,
  literalReview: 0.84,
  semanticHigh: Number.POSITIVE_INFINITY,
  semanticLow: 0.7,
};

/**
 * 单列参与两两比较的唯一值上限。
 *
 * spec §5.5.5 举的就是 500 个唯一值 → 约 12.5 万对。这里是唯一的成本闸门：
 * 不加它，一列自由文本就能吃掉检查全流程 30 秒的预算。
 *
 * 刻意**不做字符集粗筛**：`研究生／硕士` 字面零重叠，粗筛会把招牌用例一并筛掉。
 */
const MAX_UNIQUE_VALUES = 500;

function toCandidates(counts: Map<string, number>, originalOf: Map<string, string[]>): SynonymCandidate[] {
  const byKey = new Map<string, SynonymCandidate>();
  for (const [key, count] of counts) {
    byKey.set(key, { key, variants: originalOf.get(key) ?? [key], count });
  }
  // 排序保证结果稳定：同一份数据跑两次必须得到同样的问题清单。
  // 刻意用默认的码元序而不是 localeCompare —— 后者随语言环境变化，
  // 会让同一份数据在不同机器上产出顺序不同的问题清单，而那是没法测的。
  return [...byKey.values()].sort((left, right) => (left.key < right.key ? -1 : 1));
}

export function collectSynonymCandidates(
  dataset: Dataset,
  options: { maxUniqueValues?: number } = {},
): SynonymAnalysis[] {
  const limit = options.maxUniqueValues ?? MAX_UNIQUE_VALUES;
  const analyses: SynonymAnalysis[] = [];

  for (const column of dataset.columns) {
    const counts = new Map<string, number>();
    const originalOf = new Map<string, string[]>();

    for (const value of column.values) {
      // 归一化键的算法与其它检查共用（normalizeKey），所以这里不重复实现
      const key = keyOf(value);
      if (key === '') continue; // 缺失值不参与归并
      counts.set(key, (counts.get(key) ?? 0) + 1);
      const originals = originalOf.get(key) ?? [];
      const raw = typeof value === 'string' ? value : String(value);
      // 同一归一化键下的多种原始写法要留着 —— 界面要展示「硕士／研究生」的差异
      if (!originals.includes(raw)) originals.push(raw);
      originalOf.set(key, originals);
    }

    if (counts.size < 2 || counts.size > limit) continue;

    const candidates = toCandidates(counts, originalOf);
    const signals = [];
    for (let i = 0; i < candidates.length; i += 1) {
      for (let j = i + 1; j < candidates.length; j += 1) {
        // key 已按字典序排好，所以 a < b 天然成立，同一对只会出现一次
        const leftCandidate = candidates[i];
        const rightCandidate = candidates[j];
        if (!leftCandidate || !rightCandidate) continue;
        const a = leftCandidate.key;
        const b = rightCandidate.key;
        signals.push({
          a,
          b,
          normalizedEqual: a === b,
          literalSimilarity: literalSimilarity(a, b),
        });
      }
    }
    if (signals.length > 0) analyses.push({ column: column.name, candidates, signals });
  }

  return analyses;
}

/**
 * 归一化键：**先过 `normalizeText`**（全角转半角、去零宽字符），再统一小写、压缩空白。
 *
 * 为什么不能直接用 `normalizeKey`：它是给「按列取值分组」用的，只做
 * `normalizeText + toLowerCase`，**保留内部空白差异**（`研究 生` 与 `研究  生`
 * 算两个键）。那是别的检查要的语义；而这里要的是「同一个类别」，
 * 多一个空格不该让一个类别变成两个候选。
 *
 * 但**全角与隐形字符必须一起归一**：原先这个函数只写 `trim().toLowerCase()`，
 * 跳过了 `normalizeText`，于是 `mg` 与全角的 `ｍｇ` 在候选层是两个类别，
 * 而 `literal.ts`、`guard.ts`、`units.ts` 都用 `normalizeText`，当它们同一个。
 * 同一个概念两套归一化，迟早给出互相矛盾的判定 —— 所以两边的**公共部分必须共用**，
 * 差异只有「空白是否压缩」这一处，且写在这里。
 */
function keyOf(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return normalizeText(String(value)).toLowerCase().replace(/\s+/g, ' ');
}

export interface SynonymVerdictResult {
  keys: [string, string];
  verdict: SynonymVerdict;
  reason: string;
  /** 算过的语义余弦。它只作佐证，不单独决定任何事 —— 见 DEFAULT_THRESHOLDS 的说明 */
  semanticCosine?: number;
  /**
   * 字面相似度，被判成 `review` 且走的是 L2 待确认档时带上。
   *
   * 为什么值得单独记：界面/问题文案必须说清**依据是哪一层** ——
   * 「字面写法相近」与「语义模型觉得相近」是两条可信度不同的理由，
   * 混成一句会让用户以为语义模型给了某个结论。`undefined` 表示这条
   * 待确认是 L3 给的。
   */
  literalSimilarity?: number;
}

function cosine(left: number[], right: number[]): number {
  if (left.length !== right.length) return 0;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let i = 0; i < left.length; i += 1) {
    // `?? 0` 与仓库既有写法一致；下标由长度相等保证有效
    const l = left[i] ?? 0;
    const r = right[i] ?? 0;
    dot += l * r;
    leftNorm += l * l;
    rightNorm += r * r;
  }
  if (leftNorm === 0 || rightNorm === 0) return 0;
  return dot / Math.sqrt(leftNorm * rightNorm);
}

export function decideSynonymVerdicts(
  analysis: SynonymAnalysis,
  options: { thresholds?: Partial<SynonymThresholds>; vectors?: Map<string, number[]> } = {},
): SynonymVerdictResult[] {
  const thresholds = { ...DEFAULT_THRESHOLDS, ...options.thresholds };

  return analysis.signals.map((signal) => {
    const { a, b } = signal;

    // 护栏优先于一切其它信号 —— 包括很高的 L3 余弦
    if (isGuardedPair(a, b)) {
      return {
        keys: [a, b] as [string, string],
        verdict: 'ignore' as SynonymVerdict,
        reason: '属于反义或互斥取值，不参与归并',
      };
    }
    if (signal.normalizedEqual) {
      return {
        keys: [a, b] as [string, string],
        verdict: 'merge' as SynonymVerdict,
        reason: '规范化后完全相同',
      };
    }
    if (signal.literalSimilarity >= thresholds.literal) {
      return {
        keys: [a, b] as [string, string],
        verdict: 'merge' as SynonymVerdict,
        reason: `字面相似度 ${signal.literalSimilarity.toFixed(3)} 达到阈值 ${thresholds.literal}`,
      };
    }
    // L2 的待确认档：相似但没到自动归并的线。**不自动改数据**，
    // 只是把它提出来让人核对 —— 没有这一档，0.67–0.95 之间的对会被静默丢掉。
    if (signal.literalSimilarity >= thresholds.literalReview) {
      return {
        keys: [a, b] as [string, string],
        verdict: 'review' as SynonymVerdict,
        reason: `字面相似度 ${signal.literalSimilarity.toFixed(3)} 落在待确认区间，需人工判断`,
        literalSimilarity: signal.literalSimilarity,
      };
    }

    const left = options.vectors?.get(a);
    const right = options.vectors?.get(b);
    const semanticCosine = left && right ? cosine(left, right) : undefined;

    if (semanticCosine !== undefined && semanticCosine >= thresholds.semanticHigh) {
      // 目前 semanticHigh 是不可达的，所以这条分支不会命中。
      // 留着它是为了让 spec §5.5.3 的决策式保持完整 —— 将来换更强的模型、
      // 重扫出可用的 T_high 之后，这里就是它该走的路。
      return {
        keys: [a, b] as [string, string],
        verdict: 'merge' as SynonymVerdict,
        reason: `语义相似度 ${semanticCosine.toFixed(3)} 达到阈值 ${thresholds.semanticHigh}`,
        semanticCosine,
      };
    }
    if (semanticCosine !== undefined && semanticCosine >= thresholds.semanticLow) {
      return {
        keys: [a, b] as [string, string],
        verdict: 'review' as SynonymVerdict,
        reason: `语义相似度 ${semanticCosine.toFixed(3)} 落在待确认区间，需人工判断`,
        semanticCosine,
      };
    }

    const withCosine =
      semanticCosine === undefined ? '' : `（语义相似度 ${semanticCosine.toFixed(3)}）`;
    return {
      keys: [a, b] as [string, string],
      verdict: 'ignore' as SynonymVerdict,
      reason: `所有信号均未达到阈值${withCosine}`,
      semanticCosine,
    };
  });
}

/** 并查集：把互相判定为同一判决的取值连成组。 */
function groupByVerdict(
  verdicts: SynonymVerdictResult[],
  wanted: SynonymVerdict,
): string[][] {
  const parent = new Map<string, string>();
  const find = (key: string): string => {
    const up = parent.get(key) ?? key;
    if (up === key) return key;
    const root = find(up);
    parent.set(key, root);
    return root;
  };

  for (const verdict of verdicts) {
    if (verdict.verdict !== wanted) continue;
    const [a, b] = verdict.keys;
    if (!parent.has(a)) parent.set(a, a);
    if (!parent.has(b)) parent.set(b, b);
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent.set(rootA, rootB);
  }

  const groups = new Map<string, string[]>();
  for (const key of parent.keys()) {
    const root = find(key);
    groups.set(root, [...(groups.get(root) ?? []), key]);
  }
  return [...groups.values()].filter((keys) => keys.length > 1);
}

export function checkCategorySynonyms(
  dataset: Dataset,
  options: {
    thresholds?: Partial<SynonymThresholds>;
    vectors?: Map<string, number[]>;
    maxUniqueValues?: number;
  } = {},
): QualityIssue[] {
  const analyses = collectSynonymCandidates(dataset, {
    maxUniqueValues: options.maxUniqueValues,
  });
  const issues: QualityIssue[] = [];

  for (const analysis of analyses) {
    const verdicts = decideSynonymVerdicts(analysis, options);
    const variantsOf = (keys: string[]) =>
      analysis.candidates
        .filter((candidate) => keys.includes(candidate.key))
        .flatMap((candidate) => candidate.variants);

    // 一组写法产出一条问题，而不是每对一条：`硕士／研究生／硕士研究生`
    // 会产出 3 对，用户看到 3 条几乎一样的问题要逐个接受，而它们本来就是一件事。
    for (const keys of groupByVerdict(verdicts, 'merge')) {
      const sorted = [...keys].sort();
      const variants = variantsOf(sorted);
      const reasons = verdicts
        .filter((verdict) => verdict.verdict === 'merge' && sorted.includes(verdict.keys[0]))
        .map((verdict) => verdict.reason);

      issues.push({
        id: createIssueId('category-synonyms', `${analysis.column}:${variants.join('|')}`),
        checkId: 'category-synonyms',
        severity: variants.length > 2 ? 'medium' : 'low',
        title: `「${analysis.column}」列存在同类别的多种写法`,
        // 取值**不写进 description**：这是自由文本字段，而 `outbound.ts` 的
        // `issueForModel` 对 title/description 是原样透传的（只过滤 statistics），
        // 于是原始取值会随 run_checks 的返回值上行到模型。
        //
        // 而 `evidence.statistics` 经白名单只放行**数值型**，所以 `variants` 这个
        // 字符串字段出不了门。取值放这里，用户（读 evidence）看得到、模型看不到 ——
        // 两个需求同时满足，也不必让 outbound 去猜 description 里哪一段是取值。
        description:
          `该列有 ${variants.length} 个取值被判定为同一个类别的不同写法，建议归并` +
          `（具体是哪些见下方「判定依据」）。` +
          `判定依据：${[...new Set(reasons)].join('；')}。` +
          '请确认它们在你的业务口径下确实指同一个类别 —— 例如「研究生」在教育统计口径下通常指硕士。',
        evidence: {
          columns: [analysis.column],
          statistics: {
            variantCount: variants.length,
            variants: variants.join('、'),
            // 置信度也进统计量：它是要给用户看的判断依据之一
            confidence: 0.85,
          },
        },
        suggestion: {
          action: 'merge_categories',
          params: { column: analysis.column, groups: [variants] },
          rationale: `归并后该列的唯一值从 ${analysis.candidates.length} 个减少，分组统计才不会把同一类别拆成多份。`,
        },
        confidence: 0.85,
      });
    }

    // 待确认：分两条来源，**依据必须说清是哪一层**。
    //
    // 一条是 L2：字面写法相近但没到自动归并的线（`大学本科／本科` 这类）。
    // 另一条是 L3：字面毫无重合、只靠语义模型觉得相近（`硕士／研究生`）。
    // 两者的可信度不同（L2 待确认档的精度远高于 L3 那一档），把它们混成一句
    // 「语义相近」会让用户以为语义模型给了结论 —— 而它的结论恰恰是最不可信的那条。
    const reviewByLiteral = verdicts.filter(
      (verdict) => verdict.verdict === 'review' && verdict.literalSimilarity !== undefined,
    );
    const reviewBySemantic = verdicts.filter(
      (verdict) => verdict.verdict === 'review' && verdict.literalSimilarity === undefined,
    );

    for (const keys of groupByVerdict(reviewByLiteral, 'review')) {
      const sorted = [...keys].sort();
      const variants = variantsOf(sorted);
      const scores = reviewByLiteral
        .filter((verdict) => sorted.includes(verdict.keys[0]))
        .map((verdict) => verdict.literalSimilarity)
        .filter((value): value is number => typeof value === 'number');
      const best = Math.max(...scores).toFixed(3);

      issues.push({
        id: createIssueId('category-synonyms', `${analysis.column}:${variants.join('|')}`),
        checkId: 'category-synonyms',
        severity: 'low',
        // 不把取值写进 description —— 原因见上面 merge 分支的注释
        title: `「${analysis.column}」列有写法相近的取值，需人工确认`,
        description:
          `该列有 ${variants.length} 个取值的字面写法相近（最高字面相似度 ${best}），` +
          '但没到自动归并的线（具体是哪些见下方「判定依据」）。' +
          '**这只是待确认，不是结论** —— 字面像不等于同一个类别，' +
          '例如「本科」与「本科在读」是人话里的两件事。' +
          '请对照你的业务口径判断它们是否真的指同一个类别；不确认就不要合并。',
        evidence: {
          columns: [analysis.column],
          statistics: {
            variantCount: variants.length,
            variants: variants.join('、'),
            literalSimilarity: Number(best),
            confidence: 0.6,
          },
        },
        suggestion: {
          action: 'merge_categories',
          params: { column: analysis.column, groups: [variants] },
          rationale: `若确认同义，归并后该列唯一值从 ${analysis.candidates.length} 个减少，分组统计才不会把同一类别拆成多份。`,
        },
        // 比 L3 那一档高：L2 待确认实测精度约 0.69，而 L3 那一档约 0.45
        confidence: 0.6,
      });
    }

    // 待确认：语义上相近，但**没有**任何字面或规范化上的正信号。
    // 置信度刻意压低（0.45），因为实测这一档的精度只有约 0.45 ——
    // 它是一条「问题」，不是「结论」。界面与文案都必须这么对待它。
    for (const keys of groupByVerdict(reviewBySemantic, 'review')) {
      const sorted = [...keys].sort();
      const variants = variantsOf(sorted);
      const cosines = reviewBySemantic
        .filter((verdict) => sorted.includes(verdict.keys[0]))
        .map((verdict) => verdict.semanticCosine)
        .filter((value): value is number => typeof value === 'number');
      const best = cosines.length > 0 ? Math.max(...cosines).toFixed(3) : '未知';

      issues.push({
        id: createIssueId('category-synonyms', `${analysis.column}:${variants.join('|')}`),
        checkId: 'category-synonyms',
        severity: 'low',
        title: `「${analysis.column}」列有语义相近的取值，需人工确认`,
        // 同样不把取值写进 description（原因见上面 merge 分支的注释）
        description:
          `该列有 ${variants.length} 个取值在语义上相近（最高相似度 ${best}），` +
          '但字面写法没有任何重合，属于跨表述的同义候选（具体是哪些见下方「判定依据」）。' +
          '**这只是待确认，不是结论** —— 语义模型在这一档的准确率并不高，' +
          '请对照你的业务口径判断它们是否真的指同一个类别；不确认就不要合并。',
        evidence: {
          columns: [analysis.column],
          statistics: {
            variantCount: variants.length,
            variants: variants.join('、'),
            semanticSimilarity: Number(best === '未知' ? 0 : best),
            confidence: 0.45,
          },
        },
        suggestion: {
          action: 'merge_categories',
          params: { column: analysis.column, groups: [variants] },
          rationale: `若确认同义，归并后该列唯一值从 ${analysis.candidates.length} 个减少，分组统计才不会把同一类别拆成多份。`,
        },
        confidence: 0.45,
      });
    }
  }

  return issues;
}
