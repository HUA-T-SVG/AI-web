import { describe, it, expect } from 'vitest';
import { profileDataset } from '../profile';
import { runAllChecks, type Dataset, type ColumnData } from '..';
import { buildDataSummary } from '@/agent/shared/summary';
import { writeEvalSection, type EvalMetric } from '../../../scripts/evalEmit';

/**
 * L5（系统层）评测：耗时与成本。
 *
 * 设计文档 §2.3 的非功能指标：**5 万行 × 50 列，剖析 ≤ 3 秒；检查全流程 ≤ 30 秒；
 * 界面全程不卡顿**。前三项里的前两项由本文件测。「界面不卡顿」取决于检查跑在
 * 哪个线程 —— 那是 Task 8（Worker 化）的事，本文件的结论决定它的优先级。
 *
 * **测的是端到端耗时，不是单个函数**：`profileDataset` 与 `runAllChecks` 正是
 * 界面上「上传之后那几秒」里跑的东西（现在跑在主线程）。
 *
 * 为什么报**中位数**而不是一个数：§8.5 第 7 条记过一次实测抖动 ——
 * 同一个 5 万 × 50 的性能用例在不同负载下打出过 3311–6161 ms。单次采样会把
 * 「机器当时在忙」错记成「实现变慢了」，而据此做的判断（要不要 Worker 化）
 * 会跟着错。所以每次取 5 次的中位数，并把最小/最大一并打印出来当抖动证据。
 *
 * 本文件**不设严苛的达标断言**：它的产出是「报告里的数字」，而判断（达不达标、
 * 要不要 Worker 化)由人看报告做。唯一的断言是「不要荒谬地慢」（给一个宽松上限），
 * 防的是回归到不可用，而不是把性能测试变成会随机变红的门禁。
 */

const ROWS = 50_000;
const COLS = 50;
/** 采样次数。5 次取中位数对抖动不敏感，又不至于让这个文件跑太久 */
const SAMPLES = 5;

/**
 * 最坏形态的数据集。
 *
 * 与 `src/core/perf.test.ts` 同一构造（这里复制而非 import：那份的生成器没导出，
 * 而导出测试文件的内部函数会把测试之间的边界弄模糊）。四分之一的列是**逐行唯一
 * 的自由文本**，每列都要走完整轮文本归一化 —— 真实科研数据通常远轻于此。
 * 另有四分之一的列是分类列、四分之一数值、四分之一布尔，用来覆盖四类检查路径。
 */
function buildWorstCaseDataset(rows: number, cols: number): Dataset {
  const columns: ColumnData[] = [];

  for (let c = 0; c < cols; c += 1) {
    const values = [];
    for (let r = 0; r < rows; r += 1) {
      if (r % 20 === 7) {
        values.push(null);
      } else if (c % 4 === 0) {
        values.push(Number((r * 1.37 + c).toFixed(2)));
      } else if (c % 4 === 1) {
        values.push(['本科', '硕士', '博士', '大专'][r % 4] as string);
      } else if (c % 4 === 2) {
        values.push(`备注内容-${c}-${r}-唯一文本`);
      } else {
        values.push(r % 2 === 0);
      }
    }
    columns.push({ name: `列${c}`, values });
  }

  return { columns, rowCount: rows };
}

/**
 * 高基数分类列：每列 500 个唯一值（`MAX_UNIQUE_VALUES` 的上限档）。
 *
 * 为什么单独测它：`category-synonyms` 是唯一做**两两比较**的检查，而它的成本
 * 由**唯一值数**决定、与行数无关 —— 500 个唯一值约 12.5 万对。把它混在
 * 5 万行数据集里测不出东西（那数据集的分类列只有 4 个唯一值）。
 *
 * 取值刻意两两相似度低（`类别001` 这种编号式），免得真触发归并计算。
 */
function buildHighCardinalityDataset(rows: number, cols: number, uniquePerColumn = 500): Dataset {
  const columns: ColumnData[] = [];
  for (let c = 0; c < cols; c += 1) {
    const values: (string | null)[] = [];
    for (let r = 0; r < rows; r += 1) {
      values.push(`类别${String((r % uniquePerColumn) + 1).padStart(3, '0')}`);
    }
    columns.push({ name: `分类${c}`, values });
  }
  return { columns, rowCount: rows };
}

interface Timing {
  label: string;
  median: number;
  min: number;
  max: number;
  budget?: number;
}

function measure(label: string, run: () => void, budget?: number): Timing {
  // 热身一次：不把 JIT 编译与首次分配算进采样
  run();
  const samples: number[] = [];
  for (let index = 0; index < SAMPLES; index += 1) {
    const started = performance.now();
    run();
    samples.push(performance.now() - started);
  }
  const sorted = [...samples].sort((left, right) => left - right);
  return {
    label,
    median: sorted[Math.floor(sorted.length / 2)] ?? 0,
    min: sorted[0] ?? 0,
    max: sorted[sorted.length - 1] ?? 0,
    budget,
  };
}

const timings: Timing[] = [];

describe('L5 系统评测 · 耗时', () => {
  it(`5 万行 × 50 列的剖析（${SAMPLES} 次取中位数）`, () => {
    const dataset = buildWorstCaseDataset(ROWS, COLS);
    timings.push(measure('剖析 5 万 × 50', () => void profileDataset(dataset), 3000));
  }, 600_000);

  it(`5 万行 × 50 列的全量检查（${SAMPLES} 次取中位数）`, () => {
    const dataset = buildWorstCaseDataset(ROWS, COLS);
    timings.push(measure('全量检查 5 万 × 50', () => void runAllChecks(dataset), 30_000));
  }, 600_000);

  it(`500 唯一值档的类别归并（${SAMPLES} 次取中位数）—— 成本随唯一值数而非行数`, () => {
    // 2000 行就够：每列 500 个唯一值、约 12.5 万对，是这项检查的上限档
    const dataset = buildHighCardinalityDataset(2000, 3);
    timings.push(measure('类别归并 500 唯一值 × 3 列', () => void runAllChecks(dataset)));
  }, 600_000);

  it('打印耗时分布', () => {
    expect(timings).toHaveLength(3);

    const lines: string[] = [''];
    lines.push('| 场景 | 中位数 | 最小 | 最大 | 预算 | 结论 |');
    lines.push('| --- | --- | --- | --- | --- | --- |');
    for (const item of timings) {
      const verdict =
        item.budget === undefined
          ? '——'
          : item.median <= item.budget
            ? '✅ 达标'
            : `❌ 超预算 ${(item.median / item.budget).toFixed(2)} 倍`;
      lines.push(
        `| ${item.label} | **${item.median.toFixed(0)} ms** | ${item.min.toFixed(0)} ms | ` +
          `${item.max.toFixed(0)} ms | ${item.budget ?? '——'} ms | ${verdict} |`,
      );
    }
    const spread = timings.map((item) => item.max - item.min);
    lines.push('');
    lines.push(
      `抖动（最大−最小）：${spread.map((value, index) => `${timings[index]?.label} ${value.toFixed(0)} ms`).join(' · ')}`,
    );
    lines.push('');
    console.log(lines.join('\n'));

    // 唯一的硬断言：不能荒谬地慢。真正的判断（达不达标、要不要 Worker 化）
    // 由人看报告做 —— 把性能测试变成会随负载随机变红的门禁，门禁就失去判断力
    const profile = timings[0];
    const checks = timings[1];
    expect(profile?.median ?? Infinity).toBeLessThan(30_000);
    expect(checks?.median ?? Infinity).toBeLessThan(120_000);

    // 结构化产出，供指标看板读。达标线来自 spec §2.3 的非功能指标
    const metrics: EvalMetric[] = timings.map((item) => ({
      name: item.label,
      value: Math.round(item.median),
      unit: 'ms',
      rule:
        item.budget === undefined
          ? '无预算（单项拆解用；它的成本随唯一值数增长，不随行数）'
          : `spec §2.3 要求 ≤ ${item.budget} ms（5 万行 × 50 列）`,
      passed: item.budget === undefined ? undefined : item.median <= item.budget,
    }));

    // token 与成本也放这里一起产出：它们同属 L5，而**先告诉用户「一次分析要发出去
    // 多大东西」比只报耗时更有说服力**（数据不出浏览器，所以出站只有摘要）
    const summaryDataset = buildWorstCaseDataset(ROWS, 5);
    const summaryText = JSON.stringify(
      buildDataSummary({
        dataset: summaryDataset,
        profile: profileDataset(summaryDataset),
        fileName: '大型数据.csv',
      }),
    );
    const nonAscii = (summaryText.match(/[^\u0000-\u007F]/g) ?? []).length;
    const estimatedTokens = nonAscii + Math.ceil((summaryText.length - nonAscii) / 4);
    metrics.push(
      {
        name: '结构摘要字符数',
        value: summaryText.length,
        unit: '字符',
        rule: '数据不出浏览器，出站的只有结构摘要 —— 所以这个数字就是「发出去多少」',
      },
      {
        name: '估算输入 token',
        value: estimatedTokens,
        unit: 'token',
        rule: '**估算而非实测**：中文按 1 字符 ≈ 1 token、ASCII 按 4 字符 ≈ 1 token。真实值要调 API（属 L4）',
      },
    );

    writeEvalSection('system', {
      title: 'L5 系统性能与出站规模',
      description: '按设计文档 §2.3 的非功能指标实测：5 万行 × 50 列，取 5 次中位数。',
      metrics,
      measuredAt: new Date().toISOString(),
      command: 'pnpm vitest run src/core/evaluate/systemEval.test.ts',
      notCovered: [
        '「界面是否真的不卡」要在浏览器里量长任务与掉帧，本项只在 Node 里量函数耗时',
        '低端机与移动端未验证 —— 本项跑在开发机上',
        '真实 token 与成本要调 API 才知道（属 L4）。本项只给摘要字符数与估算',
      ],
    });
  }, 60_000);
});

describe('L5 系统评测 · token 与成本估算', () => {
  it('打印一次分析要发出去的摘要规模', () => {
    const dataset = buildWorstCaseDataset(ROWS, COLS);
    const profile = profileDataset(dataset);
    const summary = buildDataSummary({ dataset, profile, fileName: '大型数据.csv' });
    const summaryText = JSON.stringify(summary);
    const characters = summaryText.length;

    /**
     * token 估算：**粗略**，必须写明。
     *
     * 中文按「1 个汉字 ≈ 1 token」量级估（各家分词器对中文的实际比例在 0.6–1.5
     * 之间波动）；ASCII 按 4 字符 ≈ 1 token。这比「字符数 / 2」之类的拍脑袋说法
     * 好一点，但**不是实测** —— 真实 token 数要调 API 才知道，属于 Task 5（L4）。
     */
    const nonAscii = (summaryText.match(/[^\u0000-\u007F]/g) ?? []).length;
    const ascii = characters - nonAscii;
    const estimatedTokens = nonAscii + Math.ceil(ascii / 4);

    /**
     * 单价：DeepSeek 的公开定价（**2026-10 查询到的量级**：输入约 ¥2/百万 token、
     * 输出约 ¥8/百万 token，缓存命中更便宜）。
     *
     * **硬编码并注明**，不写成会静默失效的「动态查价」：换模型之后这份报告必须
     * 有人回来改，而写死加注明正是为了让它无法被忽略。
     */
    const INPUT_PRICE_PER_MILLION = 2;
    const OUTPUT_PRICE_PER_MILLION = 8;
    /** 一次分析里的输出：若干轮工具调用参数 + 结论文本，按经验取 2000 token 量级 */
    const estimatedOutputTokens = 2000;
    const cost =
      (estimatedTokens / 1_000_000) * INPUT_PRICE_PER_MILLION +
      (estimatedOutputTokens / 1_000_000) * OUTPUT_PRICE_PER_MILLION;

    console.log(
      [
        '',
        `摘要字符数 ${characters}（中文/全角 ${nonAscii} · ASCII ${ascii}）`,
        `估算输入 token ≈ ${estimatedTokens}`,
        `估算单次分析成本 ≈ ¥${cost.toFixed(4)}（输入 ¥${INPUT_PRICE_PER_MILLION}/百万 + 输出 ¥${OUTPUT_PRICE_PER_MILLION}/百万）`,
        '',
      ].join('\n'),
    );

    // 结构摘要的意义就在这个数量级上：5 万行数据的摘要仍是**几万字符**，
    // 而不是几 MB —— 这是「单次分析 token 消耗在千级～万级」的可执行形式
    expect(estimatedTokens).toBeLessThan(200_000);
    expect(estimatedTokens).toBeGreaterThan(0);
  }, 300_000);
});
