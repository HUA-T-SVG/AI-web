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

  it('唯一值极多时跳过 —— 500 个唯一值约 12.5 万对，会吃掉全流程预算', () => {
    const values = Array.from({ length: 600 }, (_, index) => `值${index}`);
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
