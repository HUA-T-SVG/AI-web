import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_THRESHOLDS,
  checkCategorySynonyms,
  collectSynonymCandidates,
  decideSynonymVerdicts,
} from './decide';
import { resetIssueIdCounter } from '../checks/id';
import type { Dataset, QualityIssue } from '../types';
import type { SynonymAnalysis, SynonymThresholds } from './types';

/** 取第一项并保证非空 —— `noUncheckedIndexedAccess` 下直接 `[0]` 是 `T | undefined`。 */
function first<T>(items: T[]): T {
  const [head] = items;
  if (head === undefined) throw new Error('期望至少有一项，实际为空');
  return head;
}

/** 构造只有两个取值的分析结果；信号值通过 overrides 给，避免到处写 signals[0].x = ...。 */
function analysisOf(
  a: string,
  b: string,
  overrides: { normalizedEqual?: boolean; literalSimilarity?: number } = {},
): SynonymAnalysis {
  return {
    column: '学历',
    candidates: [
      { key: a, variants: [a], count: 10 },
      { key: b, variants: [b], count: 8 },
    ],
    signals: [
      {
        a,
        b,
        normalizedEqual: overrides.normalizedEqual ?? false,
        literalSimilarity: overrides.literalSimilarity ?? 0,
      },
    ],
  };
}

/**
 * 构造一对给定余弦的二维向量。
 *
 * 第一版用的是 `[[1], [value]]` —— 那算出来的余弦恒等于 1（value/value），
 * 于是「L3 低于下界」与「L3 等于 0.75」两个用例都失去了意义。二维才是真的可控。
 */
function cosinesOf(a: string, b: string, value: number): Map<string, number[]> {
  return new Map([
    [a, [1, 0]],
    [b, [value, Math.sqrt(Math.max(0, 1 - value * value))]],
  ]);
}

function datasetOf(values: Array<string | null>): Dataset {
  return { rowCount: values.length, columns: [{ name: '学历', values }] };
}

describe('阈值常量必须反映 Task 1 的实测，不能是拍脑袋的数', () => {
  it('semanticHigh 不可达 —— L3 永不单独触发归并', () => {
    // Task 1 在 34 字段 / 242 正例 / 911 负例上扫过 [0.50, 0.99]（q8，生产同款精度）：
    // 任何阈值下 Precision 都到不了 0.95，最好 0.5242。所以这个上限必须是「不可达」。
    expect(DEFAULT_THRESHOLDS.semanticHigh).toBe(Number.POSITIVE_INFINITY);
  });

  it('semanticLow 是一个具体值，且理由写在旁边 —— 它决定招牌用例能不能被提出来', () => {
    // 取 0.70 的唯一理由：Task 1 实测「硕士／研究生」在 q8 下余弦 0.7195，
    // 必须落进待确认区间，否则产品的招牌用例（messy-survey.csv 里的
    // 「硕士／研究生」）一条都不会出现。
    // 代价是待确认区间的精度只有约 0.45 —— 所以待确认只能是「问题」，不能自动执行。
    expect(DEFAULT_THRESHOLDS.semanticLow).toBe(0.7);
    expect(DEFAULT_THRESHOLDS.semanticLow).toBeLessThan(0.7195);
  });

  it('literal 阈值在 0–1 之间', () => {
    const literal: number = DEFAULT_THRESHOLDS.literal satisfies number;
    expect(literal).toBeGreaterThan(0);
    expect(literal).toBeLessThan(1);
  });

  /**
   * L2 的**归并**阈值必须是实测达到 spec 精度要求的那一个。
   *
   * spec §5.5.4 写明「主指标 Precision@建议阈值，目标 ≥ 0.95」，并给出方法
   * （扫描 [0.50,0.99] 步长 0.01）。这个数此前**从未被扫过** —— 0.86 是随口定的，
   * 而它在标注集上只有 **0.8222** 精度，直接违反 spec 的硬指标。
   * 实测（`src/core/synonyms/literal-scan.test.ts`）：
   *   0.86 → 精度 0.8222 / 召回 0.3458
   *   0.95 → 精度 1.0000 / 召回 0.0561  ← spec 要求的那一点
   */
  it('literal 取 spec 要求的精度达标点，不是随手一个数', () => {
    expect(DEFAULT_THRESHOLDS.literal).toBe(0.95);
  });

  /**
   * 只看归并阈值会把召回砍到 0.056 —— 绝大多数本该被提起的同义写法会静默消失。
   * 所以补一条**待确认**下界，与 L3 同构：拿不准的交给用户核对，而不是丢掉。
   * 下界取 F0.5 最优点（0.84，精度 0.8036 / 召回 0.4206），理由与整条曲线写在
   * `literal-scan.test.ts` 里。
   */
  it('literalReview 是待确认下界，且严格低于归并阈值', () => {
    expect(DEFAULT_THRESHOLDS.literalReview).toBe(0.84);
    expect(DEFAULT_THRESHOLDS.literalReview).toBeLessThan(DEFAULT_THRESHOLDS.literal);
  });

  it('阈值类型可被局部覆盖，用于将来的重扫', () => {
    // 用「本科在读／本科」而不是单字对：单字对会被护栏拦下，
    // 那样这条用例测的就成了护栏，而不是阈值覆盖。
    const overridden: Partial<SynonymThresholds> = { literal: 0.5 };
    const analysis = analysisOf('本科在读', '本科', { literalSimilarity: 0.6 });
    expect(first(decideSynonymVerdicts(analysis, { thresholds: overridden })).verdict).toBe('merge');
  });
});

describe('组合决策（spec §5.5.3，按 Task 1 实测校准）', () => {
  it('L1 规范化后相等 → 直接归并', () => {
    const analysis = analysisOf('MG', 'mg', { normalizedEqual: true });
    expect(first(decideSynonymVerdicts(analysis)).verdict).toBe('merge');
  });

  it('L2 达到阈值 → 归并', () => {
    const above = DEFAULT_THRESHOLDS.literal + 0.01;
    const analysis = analysisOf('硕士', '硕士研究生', { literalSimilarity: above });
    expect(first(decideSynonymVerdicts(analysis)).verdict).toBe('merge');
  });

  /**
   * L2 的**待确认**档。
   *
   * 这一档是「literal 取 0.95 之后」必须补上的东西：不补，0.67–0.95 之间的对
   * 会被直接判成 ignore，而它们正是最像同一个类别的那批（`大学本科／本科`
   * 这类）。归并阈值管「能自动改数据的」，待确认档管「值得人手看一眼的」。
   */
  it('L2 落在待确认区间 → review，而不是自动归并', () => {
    // 取在归并与下界**之间**（0.90）：写死 0.8 会在下界上移到 0.84 之后落到
    // 区间外面，让这条测试变成「测了忽略」—— 而它守的是待确认档，不是忽略档
    const middle = (DEFAULT_THRESHOLDS.literal + DEFAULT_THRESHOLDS.literalReview) / 2;
    const analysis = analysisOf('大学本科', '本科生', { literalSimilarity: middle });
    const verdict = first(decideSynonymVerdicts(analysis));
    expect(verdict.verdict).toBe('review');
    expect(verdict.reason).toContain('待确认');
    expect(verdict.literalSimilarity).toBe(middle);
  });

  it('L2 低于待确认下界 → 忽略', () => {
    const analysis = analysisOf('大学本科', '本科生', {
      literalSimilarity: DEFAULT_THRESHOLDS.literalReview - 0.01,
    });
    expect(first(decideSynonymVerdicts(analysis)).verdict).toBe('ignore');
  });

  it('归并阈值仍然优先于待确认档 —— 达标的对不该被降级成「需人工确认」', () => {
    const analysis = analysisOf('硕士', '硕士研究生', {
      literalSimilarity: DEFAULT_THRESHOLDS.literal,
    });
    expect(first(decideSynonymVerdicts(analysis)).verdict).toBe('merge');
  });

  it('**L3 再高也不能单独触发归并** —— 这是 Task 1 结论的可执行形式', () => {
    // 「研究生／硕士」字面零重叠，只能靠 L3。而实测：无护栏时 L3 最好 0.5242，
    // 做上 spec 护栏也只到 0.5500，且余弦 1.0000 的负例成片出现（短串退化向量）。
    const analysis = analysisOf('研究生', '硕士');
    expect(
      first(decideSynonymVerdicts(analysis, { vectors: cosinesOf('研究生', '硕士', 0.99) })).verdict,
    ).not.toBe('merge');
  });

  it('但 L3 足以把它提成「待确认」—— 招牌用例靠这条路出现', () => {
    const analysis = analysisOf('研究生', '硕士');
    expect(
      first(decideSynonymVerdicts(analysis, { vectors: cosinesOf('研究生', '硕士', 0.7195) })).verdict,
    ).toBe('review');
  });

  it('L3 低于待确认下界 → 忽略', () => {
    const analysis = analysisOf('研究生', '硕士');
    expect(
      first(decideSynonymVerdicts(analysis, { vectors: cosinesOf('研究生', '硕士', 0.5) })).verdict,
    ).toBe('ignore');
  });

  it('护栏命中的对即使 L3 高达 0.99 也不归并也不待确认', () => {
    const analysis = analysisOf('男', '女');
    expect(
      first(decideSynonymVerdicts(analysis, { vectors: cosinesOf('男', '女', 0.99) })).verdict,
    ).toBe('ignore');
  });

  it('L3 被记进判决里 —— 界面要能说清「为什么提这条」', () => {
    const analysis = analysisOf('研究生', '硕士');
    const verdict = first(
      decideSynonymVerdicts(analysis, { vectors: cosinesOf('研究生', '硕士', 0.75) }),
    );
    expect(verdict.semanticCosine).toBeCloseTo(0.75, 5);
    expect(verdict.reason).toContain('0.75');
  });

  it('没有向量时也能工作 —— 语义不可用是降级路径，不是失败', () => {
    const analysis = analysisOf('本科在读', '本科', { literalSimilarity: 0.99 });
    const verdict = first(decideSynonymVerdicts(analysis));
    expect(verdict.verdict).toBe('merge');
    expect(verdict.semanticCosine).toBeUndefined();
  });

  it('没有向量时「研究生／硕士」不会被提出 —— 承认能力边界', () => {
    expect(first(decideSynonymVerdicts(analysisOf('研究生', '硕士'))).verdict).toBe('ignore');
  });

  it('没有任何信号 → 忽略', () => {
    expect(first(decideSynonymVerdicts(analysisOf('北京', '上海'))).verdict).toBe('ignore');
  });
});

describe('候选生成', () => {
  it('排除缺失值，并按归一化键合并写法', () => {
    const analyses = collectSynonymCandidates(datasetOf(['硕士', '研究生', '硕士', null, ' ']));
    expect(analyses).toHaveLength(1);
    const keys = first(analyses).candidates.map((candidate) => candidate.key);
    expect(keys).toEqual(['研究生', '硕士'].sort());
  });

  /**
   * 全角与隐形字符必须在**候选生成**这一层就合并掉。
   *
   * 这一条守的是「同一个类别被拆成两个候选」：`keyOf` 原先只做
   * `trim().toLowerCase()`，跳过了 `normalizeText`（全角转半角 + 去零宽字符），
   * 于是 `mg` 与全角的 `ｍｇ`、`男` 与带零宽空格的 `男` 在这条检查眼里
   * 是两个不同的类别 —— 而 `literal.ts`、`guard.ts`、`units.ts` 都用
   * `normalizeText`，当它们同一个。**同一个概念两套归一化，迟早给出互相矛盾的判定。**
   */
  it('全角与隐形字符在候选层就归并 —— 与其它检查共用同一套归一化', () => {
    const analyses = collectSynonymCandidates(datasetOf(['mg', 'ｍｇ', 'mg', '　mg　']));
    // 四种写法归一后是同一个键，只剩一个候选 → 没有可归并的对
    expect(analyses).toHaveLength(0);
  });

  it('归一化之后确实不同的写法仍然各自成候选', () => {
    const analyses = collectSynonymCandidates(datasetOf(['硕士', '博士']));
    expect(analyses).toHaveLength(1);
    expect(first(analyses).candidates).toHaveLength(2);
  });

  it('唯一值极多时跳过 —— 500 个唯一值约 12.5 万对，会吃掉全流程预算', () => {    const values = Array.from({ length: 600 }, (_, index) => `值${index}`);
    expect(collectSynonymCandidates(datasetOf(values))).toHaveLength(0);
  });

  it('只有一种取值的列不进候选 —— 没有可归并的对', () => {
    expect(collectSynonymCandidates(datasetOf(['硕士', '硕士', '硕士']))).toHaveLength(0);
  });

  it('500 个唯一值这一档真的跑得完 —— Review Focus 第 3 条要的是耗时，不只是「有个上限」', () => {
    // spec §2.3 要求「检查全流程 ≤ 30 秒」，而这一项是唯一做两两比较的检查：
    // 500 个唯一值 → 约 12.5 万对，每对一次 L2 相似度。上限只是闸门，
    // **闸门之内的耗时必须实测过**，否则上限只是把问题推迟到 499 个取值。
    //
    // 预算给得比目标宽松（2 秒）：它与其它测试文件并行跑，负载高时会偏慢，
    // 而这条守的是「量级没炸」—— 若有人去掉粗筛或把 L2 换成更贵的算法，
    // 这个数会成十倍地涨，宽松的预算也拦得住。
    const values = Array.from({ length: 500 }, (_, index) => `类别${index}`);
    const startedAt = performance.now();
    const analyses = collectSynonymCandidates(datasetOf(values));
    const elapsed = performance.now() - startedAt;

    expect(analyses).toHaveLength(1);
    expect(analyses[0]?.signals.length).toBe((500 * 499) / 2);
    expect(elapsed).toBeLessThan(2000);
  });
});

describe('产出问题', () => {
  beforeEach(() => resetIssueIdCounter());

  /**
   * 这一组是整分支审查的 Critical，也是**护栏修好之后最该在决策层钉住的东西**：
   * `semanticHigh = ∞` 关掉语义路的自动归并之后，L2 字面层成了唯一会自动改数据的
   * 路径，而它当时没有任何反义护栏 —— 这几对都以 **0.85 置信度自动建议归并**。
   *
   * 只在 `isGuardedPair` 上测是不够的：护栏对不对，要看最终产出。
   * 所以这里断言的是「一条问题都不产出」。
   */
  it.each([
    ['满意', '不满意'],
    ['合格', '不合格'],
    ['通过', '未通过'],
    ['阴性', '阳性'],
    ['毫克', '克'],
    ['厘米', '米'],
  ])('互斥取值「%s／%s」构成的列不产出任何归并建议', (a, b) => {
    // 只在 `isGuardedPair` 上测是不够的：护栏对不对，要看最终产出。
    // 所以这里断言的是「一条问题都不产出」——重复多轮以凑够唯一值统计
    expect(checkCategorySynonyms(datasetOf([a, b, a, b, a, b]))).toEqual([]);
  });

  it('而该归并的写法仍照常归并 —— 别把该做的事一起封死', () => {
    // 护栏是从宽的，容易顺手把正常模式也封死。这一条是那道防线
    const issues = checkCategorySynonyms(datasetOf(['硕士', '硕士研究生', '硕士', '硕士研究生']));
    expect(issues).toHaveLength(1);
    expect(issues[0]?.suggestion?.action).toBe('merge_categories');
    expect(issues[0]?.confidence).toBe(0.85);
  });

  it('L2 能定的对由一条问题覆盖整组写法，而不是每对一条', () => {
    const issues = checkCategorySynonyms(datasetOf(['硕士', '硕士研究生', '硕士']));
    expect(issues).toHaveLength(1);
    const issue = first(issues);
    expect(issue.checkId).toBe('category-synonyms');
    expect(String(issue.evidence.statistics.variants)).toContain('硕士');
  });

  it('「硕士／研究生」在没有向量时不出现 —— 这条断言是能力边界的记录', () => {
    expect(checkCategorySynonyms(datasetOf(['硕士', '研究生', '硕士', '研究生']))).toHaveLength(0);
  });

  it('「硕士／研究生」在有向量时作为**待确认**出现，且不自动执行', () => {
    const issues = checkCategorySynonyms(datasetOf(['硕士', '研究生', '硕士', '研究生']), {
      vectors: cosinesOf('研究生', '硕士', 0.7195),
    });
    const issue = first(issues);
    // 待确认的性质要写进问题的文本里 —— 用户看到的是「请确认」，不是「结论」
    expect(issue.description).toContain('确认');
    expect(issue.confidence).toBeLessThan(0.6);
  });

  it('L1/L2 定的对置信度更高 —— 用户据此判断哪条更可信', () => {
    const byLiteral: QualityIssue = first(
      checkCategorySynonyms(datasetOf(['硕士', '硕士研究生', '硕士'])),
    );
    const bySemantic: QualityIssue = first(
      checkCategorySynonyms(datasetOf(['硕士', '研究生', '硕士']), {
        vectors: cosinesOf('研究生', '硕士', 0.7195),
      }),
    );
    expect(byLiteral.confidence).toBeGreaterThan(bySemantic.confidence);
  });

  it('建议动作带着列名，界面据此执行清洗', () => {
    const issue = first(checkCategorySynonyms(datasetOf(['硕士', '硕士研究生', '硕士'])));
    expect(issue.suggestion?.action).toBe('merge_categories');
    expect(issue.suggestion?.params.column).toBe('学历');
  });

  it('不相关的写法不产出问题', () => {
    expect(checkCategorySynonyms(datasetOf(['男', '女', '男', '女']))).toHaveLength(0);
  });
});
