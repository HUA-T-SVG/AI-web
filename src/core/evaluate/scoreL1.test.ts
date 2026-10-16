import { describe, expect, it } from 'vitest';
import { scoreL1, type DefectAnswer } from './scoreL1';
import type { Dataset, QualityIssue } from '../types';

/**
 * L1（检查引擎）评分。
 *
 * 被测对象是**确定性检查**，而确定性检查可以被独立复现 —— 所以这一层的评测
 * 必须能给出「检出率」与「误报率」两个数，缺一个都没有意义：
 * 一个把所有列都报成问题的实现检出率是 100%。
 *
 * 各指标的口径写在这里，因为**口径含糊会让指标失去意义**：
 *
 * | 指标 | 口径 |
 * | --- | --- |
 * | 真阳性 TP | 计分答案里被任意一条问题覆盖的条数（每条答案最多算一次） |
 * | 漏报 FN | 计分答案里没被覆盖的条数 |
 * | 误报 FP | **报出来的问题里**，没有任何计分答案与它对应的条数 |
 * | Precision | TP / (TP + FP) |
 * | Recall | TP / (TP + FN) |
 *
 * 三个容易含糊的点，都在测试里各有一条：
 *   1. **同一处缺陷被两项检查各报一次**（年龄 999 同时命中 outliers 与 range-rules）
 *      → 算两次 TP（答案本来就是两个 kind 各一条），而不是算成一次命中
 *   2. **同一处缺陷被同一项检查报两次** → 仍只算一次 TP，不能虚高
 *   3. **列级缺陷只要该列被报就计入**，不要求行号精确 —— 列级检查（missing 等）
 *      结构上拿不到行号，用行号去要求它就是评测口径错了
 */

const dataset: Dataset = {
  rowCount: 4,
  columns: [
    { name: '年龄', values: [23, 24, 999, 25] },
    { name: '备注', values: [null, null, '已完成', '缺访'] },
  ],
};

function issueOf(partial: Partial<QualityIssue> & Pick<QualityIssue, 'checkId'>): QualityIssue {
  return {
    id: `${partial.checkId}-${partial.evidence?.columns.join('-') ?? 'x'}`,
    severity: 'medium',
    title: '测试问题',
    description: '测试',
    evidence: { columns: [], statistics: {} },
    confidence: 1,
    ...partial,
  };
}

describe('L1 评分 · 完全命中', () => {
  it('每一条计分缺陷都被覆盖时，precision 与 recall 都是 1', () => {
    const answers: DefectAnswer[] = [
      { kind: 'outliers', scope: 'row', row: 2, column: '年龄' },
      { kind: 'missing', scope: 'column', column: '备注' },
    ];
    const issues = [
      issueOf({ checkId: 'outliers', evidence: { columns: ['年龄'], rowIndices: [2], statistics: {} } }),
      issueOf({ checkId: 'missing', evidence: { columns: ['备注'], statistics: {} } }),
    ];

    const score = scoreL1(issues, answers, dataset);

    expect(score.overall).toMatchObject({ detected: 2, total: 2, falsePositives: 0 });
    expect(score.overall.precision).toBe(1);
    expect(score.overall.recall).toBe(1);
    expect(score.byCheck.outliers).toMatchObject({ detected: 1, total: 1, falsePositives: 0 });
    expect(score.byCheck.missing).toMatchObject({ detected: 1, total: 1, falsePositives: 0 });
  });
});

describe('L1 评分 · 漏报', () => {
  it('少报一处时 recall 下降，且计入对应的 checkId', () => {
    const answers: DefectAnswer[] = [
      { kind: 'outliers', scope: 'row', row: 2, column: '年龄' },
      { kind: 'missing', scope: 'column', column: '备注' },
    ];
    // 只报了 outliers，没报 missing
    const issues = [
      issueOf({ checkId: 'outliers', evidence: { columns: ['年龄'], rowIndices: [2], statistics: {} } }),
    ];

    const score = scoreL1(issues, answers, dataset);

    expect(score.overall).toMatchObject({ detected: 1, total: 2, falsePositives: 0 });
    expect(score.overall.recall).toBe(0.5);
    expect(score.byCheck.missing).toMatchObject({ detected: 0, total: 1 });
    // 没报就不会有误报 —— 漏报与误报是两件事，不能混
    expect(score.overall.falsePositives).toBe(0);
  });

  it('行为不完全对时不算检出：行号不在证据里就是漏报', () => {
    const answers: DefectAnswer[] = [{ kind: 'outliers', scope: 'row', row: 2, column: '年龄' }];
    // 报了「年龄」列的第 1 行，不是第 2 行
    const issues = [
      issueOf({ checkId: 'outliers', evidence: { columns: ['年龄'], rowIndices: [1], statistics: {} } }),
    ];

    const score = scoreL1(issues, answers, dataset);

    expect(score.overall.detected).toBe(0);
    expect(score.overall.recall).toBe(0);
    // 报的这一条也不该算误报：它只是**另一处**问题（虽然答案里没有那一处）
    expect(score.overall.falsePositives).toBe(1);
  });
});

describe('L1 评分 · 误报', () => {
  it('报了答案里没有的问题时 precision 下降，且不计入任何 checkId 的检出', () => {
    const answers: DefectAnswer[] = [{ kind: 'outliers', scope: 'row', row: 2, column: '年龄' }];
    const issues = [
      issueOf({ checkId: 'outliers', evidence: { columns: ['年龄'], rowIndices: [2], statistics: {} } }),
      // 这一条没人要它报
      issueOf({ checkId: 'missing', evidence: { columns: ['备注'], statistics: {} } }),
    ];

    const score = scoreL1(issues, answers, dataset);

    expect(score.overall).toMatchObject({ detected: 1, total: 1, falsePositives: 1 });
    expect(score.overall.precision).toBe(0.5);
    expect(score.byCheck.missing).toMatchObject({ total: 0, falsePositives: 1 });
  });

  it('对照项（scored:false）报出来要算误报，不能当没看见', () => {
    // 这就是「8%/10%/15% 缺失本来不该报，报了就是误报」
    const answers: DefectAnswer[] = [{ kind: 'missing', scope: 'column', column: '备注', scored: false }];
    const issues = [
      issueOf({ checkId: 'missing', evidence: { columns: ['备注'], statistics: {} } }),
    ];

    const score = scoreL1(issues, answers, dataset);

    expect(score.overall.total).toBe(0); // 对照项不计入召回
    expect(score.overall.falsePositives).toBe(1);
    expect(score.overall.precision).toBe(0);
  });
});

describe('L1 评分 · 整表级缺陷', () => {
  it('没有 row/column 的答案也能计入（如重复列名）', () => {
    const answers: DefectAnswer[] = [{ kind: 'duplicate-column-names', scope: 'table' }];
    const issues = [
      issueOf({ checkId: 'duplicate-column-names', evidence: { columns: ['年龄'], statistics: {} } }),
    ];

    const score = scoreL1(issues, answers, dataset);

    expect(score.overall).toMatchObject({ detected: 1, total: 1, falsePositives: 0 });
    expect(score.overall.recall).toBe(1);
  });

  it('整表级缺陷没被报时计入对应 checkId 的漏报', () => {
    const answers: DefectAnswer[] = [{ kind: 'duplicate-column-names', scope: 'table' }];
    const score = scoreL1([], answers, dataset);

    expect(score.overall).toMatchObject({ detected: 0, total: 1 });
    expect(score.byCheck['duplicate-column-names']).toMatchObject({ detected: 0, total: 1 });
  });
});

describe('L1 评分 · 不能虚高', () => {
  it('同一处缺陷被两项检查各报一次 → 按答案的两个 kind 各算一次', () => {
    // 年龄 999 同时命中 outliers 与 range-rules，而答案里本来就是两条
    const answers: DefectAnswer[] = [
      { kind: 'outliers', scope: 'row', row: 2, column: '年龄' },
      { kind: 'range-rules', scope: 'row', row: 2, column: '年龄' },
    ];
    const issues = [
      issueOf({ checkId: 'outliers', evidence: { columns: ['年龄'], rowIndices: [2], statistics: {} } }),
      issueOf({ checkId: 'range-rules', evidence: { columns: ['年龄'], rowIndices: [2], statistics: {} } }),
    ];

    const score = scoreL1(issues, answers, dataset);

    expect(score.overall).toMatchObject({ detected: 2, total: 2, falsePositives: 0 });
    expect(score.overall.precision).toBe(1);
  });

  it('同一处缺陷被同一项检查报两次 → 仍只算一次，且第二条不算误报', () => {
    const answers: DefectAnswer[] = [{ kind: 'outliers', scope: 'row', row: 2, column: '年龄' }];
    const issues = [
      issueOf({ checkId: 'outliers', evidence: { columns: ['年龄'], rowIndices: [2], statistics: {} } }),
      // 同一种问题、同一行，只是 id 不同 —— 不能算成两条 TP，也不该算误报
      issueOf({ checkId: 'outliers', evidence: { columns: ['年龄'], rowIndices: [2], statistics: {} } }),
    ];

    const score = scoreL1(issues, answers, dataset);

    expect(score.overall).toMatchObject({ detected: 1, total: 1, falsePositives: 0 });
    expect(score.overall.precision).toBe(1);
  });

  it('列级缺陷不要求行号：missing 的问题不带 rowIndices 也算检出', () => {
    const answers: DefectAnswer[] = [{ kind: 'missing', scope: 'column', column: '备注' }];
    const issues = [issueOf({ checkId: 'missing', evidence: { columns: ['备注'], statistics: {} } })];

    expect(scoreL1(issues, answers, dataset).overall.detected).toBe(1);
  });
});

describe('L1 评分 · 输入的边界', () => {
  it('没有任何答案时不崩，指标为 0（分母是 0，不是 undefined）', () => {
    const score = scoreL1([], [], dataset);
    expect(score.overall).toEqual({
      detected: 0,
      total: 0,
      falsePositives: 0,
      precision: 0,
      recall: 0,
    });
    expect(score.byCheck).toEqual({});
  });

  it('只报问题、没有任何答案时全是误报，而不是「没问题」', () => {
    // 这条守的是：答案文件坏掉（读成空数组）时，指标不能显示成完美
    const issues = [issueOf({ checkId: 'missing', evidence: { columns: ['备注'], statistics: {} } })];
    const score = scoreL1(issues, [], dataset);
    expect(score.overall.falsePositives).toBe(1);
    expect(score.overall.precision).toBe(0);
  });
});
