import { describe, it, expect } from 'vitest';
import type { ColumnData, Dataset } from './types';
import { profileDataset } from './profile';

/**
 * 设计文档 §2.3 的性能预算：5 万行 × 50 列，剖析 ≤ 3 秒。
 *
 * 这里刻意构造最坏形态：四分之一的列是逐行唯一的自由文本，
 * 每列都要走完整轮文本归一化。真实科研数据通常远轻于此。
 *
 * 注意：断言依赖运行机器的性能。若在明显更慢的机器上出现失败，
 * 先确认真实耗时再决定是放宽阈值还是排查回归，不要直接删掉这个用例。
 */
const SPEC_BUDGET_MS = 3000;
const ROWS = 50_000;
const COLS = 50;

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

describe('性能回归', () => {
  it(`5 万行 × 50 列的剖析在 ${SPEC_BUDGET_MS} ms 内完成`, () => {
    const dataset = buildWorstCaseDataset(ROWS, COLS);

    // 先热身一次，避免把 JIT 编译时间算进断言
    profileDataset(dataset);

    const started = performance.now();
    const profile = profileDataset(dataset);
    const elapsed = performance.now() - started;

    expect(profile.columns).toHaveLength(COLS);
    expect(
      elapsed,
      `剖析耗时 ${elapsed.toFixed(0)} ms，超出预算 ${SPEC_BUDGET_MS} ms`,
    ).toBeLessThan(SPEC_BUDGET_MS);
  }, 120_000);
});
