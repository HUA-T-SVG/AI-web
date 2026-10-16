import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { literalSimilarity } from './literal';
import { isGuardedPair } from './guard';
import { DEFAULT_THRESHOLDS } from './decide';

/**
 * L2 阈值扫描 —— 让 `DEFAULT_THRESHOLDS.literal` 与 `literalReview` 有据可依。
 *
 * spec §5.5.4 规定的方法：在标注集上扫 `t ∈ [0.50, 0.99]`（步长 0.01），
 * 画出 PR 曲线，取 **Precision ≥ 0.95 条件下 Recall 最大**的点作为建议阈值。
 *
 * **为什么做成测试而不是一个脚本**：这一步要跑的就是 `decideSynonymVerdicts`
 * 真正会用的那几个函数。写成独立脚本就得把相似度、护栏**再抄一份**，
 * 抄本一旦与生产实现分叉，扫出来的阈值对应的就是另一个算法 ——
 * 而那种分叉不会报错，只会让常量看起来「有实测支撑」。
 * 测试直接 import 生产函数，抄本在结构上不可能存在。
 *
 * 标注集就是 `knowledge/labels/synonym-labels.json`（34 字段 / 242 正例 / 911 负例），
 * 与 `knowledge/tools/validate-embedding.mjs` 扫 L3 时用的是同一份 —— 两份数据一致，
 * L2 与 L3 的结论才放在同一张表里比。
 */

interface LabelSet {
  positivePairs: [string, string][];
  negativePairs: [string, string][];
}

function loadLabels(): LabelSet {
  const path = resolve(process.cwd(), 'knowledge/labels/synonym-labels.json');
  return JSON.parse(readFileSync(path, 'utf8')) as LabelSet;
}

interface OperatingPoint {
  threshold: number;
  precision: number;
  recall: number;
  f05: number;
  falsePositives: number;
}

/**
 * 扫描一遍阈值曲线。
 *
 * 护栏是**前置条件**（spec §5.5.3 的第四条）：命中的对根本不进归并流程，
 * 所以算指标之前先把它们剔掉，否则曲线会被一堆必然被拦的对比下去。
 */
function scan(): OperatingPoint[] {
  const labels = loadLabels();
  const positives = labels.positivePairs.filter(([a, b]) => !isGuardedPair(a, b));
  const negatives = labels.negativePairs.filter(([a, b]) => !isGuardedPair(a, b));

  const points: OperatingPoint[] = [];
  for (let step = 0; step <= 49; step += 1) {
    const threshold = Number((0.5 + step * 0.01).toFixed(2));
    const truePositives = positives.filter(([a, b]) => literalSimilarity(a, b) >= threshold).length;
    const falsePositives = negatives.filter(([a, b]) => literalSimilarity(a, b) >= threshold).length;
    const recall = truePositives / positives.length;
    const precision =
      truePositives + falsePositives === 0 ? 0 : truePositives / (truePositives + falsePositives);
    points.push({
      threshold,
      precision,
      recall,
      f05:
        precision + recall === 0
          ? 0
          : (1.25 * precision * recall) / (0.25 * precision + recall),
      falsePositives,
    });
  }
  return points;
}

describe('L2 阈值扫描（spec §5.5.4）', () => {
  it('归并阈值是「精度 ≥0.95 前提下召回最大」的那个点，不是随手一个数', () => {
    const points = scan();
    const qualified = points.filter(
      (point) => point.precision >= 0.95 && point.recall > 0,
    );
    expect(qualified.length, '没有任何阈值达到 0.95 —— 那要重新审视标注集，而不是放宽指标').toBeGreaterThan(0);

    const best = qualified.reduce((left, right) => (right.recall > left.recall ? right : left));
    expect(DEFAULT_THRESHOLDS.literal).toBe(best.threshold);
  });

  it('归并阈值处 precision 必须真的达标，且这个事实有具体数字支撑', () => {
    const point = scan().find((item) => item.threshold === DEFAULT_THRESHOLDS.literal);
    expect(point).toBeDefined();
    // 实测：0.95 处精度 1.0000、召回 0.0561（214 正例命中 12 条）
    expect(point?.precision).toBeGreaterThanOrEqual(0.95);
    // 把旧值也钉一下，免得有人「顺手调回去」：0.86 处精度只有 0.8222，
    // 直接违反 spec 的硬指标 —— 这正是这条测试存在的理由
    const old = scan().find((item) => item.threshold === 0.86);
    expect(old?.precision).toBeLessThan(0.95);
  });

  it('只看归并阈值会把召回砍到 6% —— 所以必须有待确认档', () => {
    const point = scan().find((item) => item.threshold === DEFAULT_THRESHOLDS.literal);
    expect(point?.recall).toBeLessThan(0.1);

    const reviewBand = scan().find((item) => item.threshold === DEFAULT_THRESHOLDS.literalReview);
    expect(reviewBand).toBeDefined();
    // 待确认档只提问题、不自动改数据，所以允许精度低得多；
    // 但它必须真的把召回捞回来，否则这一档没有意义
    expect(reviewBand?.recall).toBeGreaterThan(0.4);
  });

  it('待确认下界取 F0.5 最优点 —— spec 定的是 Precision 优先，而 F0.5 权重是 5:1', () => {
    const points = scan();
    const best = points.reduce((left, right) => (right.f05 > left.f05 ? right : left));
    expect(DEFAULT_THRESHOLDS.literalReview).toBe(best.threshold);

    // 「取 F0.5 最优」与「取召回最大」必须真的不是同一个点，否则这条判据是空的：
    // 若哪天两者重合，说明曲线形状变了，这个选择要重新审视
    const maxRecall = points.reduce((left, right) => (right.recall > left.recall ? right : left));
    expect(best.threshold).not.toBe(maxRecall.threshold);
  });

  /**
   * 把整条曲线打印出来，供人工核对与抄进报告。
   *
   * 为什么报告的数由这个测试产出、而不是由某个 Node 脚本产出：项目的 TS 无法被
   * Node 直接 import（`src/core/normalize` 是无扩展名的目录导入），凡是要用
   * 生产算法的脚本都得**再抄一份实现** —— 而抄本一旦与生产分叉，扫出来的阈值
   * 对应的就是另一个算法，且不会报错。这个测试直接 import 生产函数，
   * 抄本在结构上不可能存在。要更新报告，跑：
   *
   *   pnpm vitest run src/core/synonyms/literal-scan.test.ts
   */
  it('打印完整曲线，供报告引用', () => {
    const points = scan();
    const merge = points.find((point) => point.threshold === DEFAULT_THRESHOLDS.literal);
    const review = points.find((point) => point.threshold === DEFAULT_THRESHOLDS.literalReview);

    const table = points
      .map(
        (point) =>
          `| ${point.threshold.toFixed(2)} | ${point.precision.toFixed(4)} | ${point.recall.toFixed(4)} | ${point.f05.toFixed(4)} | ${point.falsePositives} |`,
      )
      .join('\n');

    console.log(
      [
        '',
        `归并阈值 literal = ${DEFAULT_THRESHOLDS.literal}（精度 ${merge?.precision}、召回 ${merge?.recall}）`,
        `待确认下界 literalReview = ${DEFAULT_THRESHOLDS.literalReview}（精度 ${review?.precision}、召回 ${review?.recall}、F0.5 ${review?.f05}）`,
        '',
        '| 阈值 | Precision | Recall | F0.5 | 误报 |',
        '| --- | --- | --- | --- | --- |',
        table,
        '',
      ].join('\n'),
    );

    expect(points.length).toBe(50);
  });
});
