import { describe, expect, it, vi } from 'vitest';
import { runSynonymCheck } from './synonymBridge';
import type { Embedder } from '@/embedding/instance';
import type { Dataset } from '@/core';

function fakeEmbedder(vectorOf: (text: string) => number[]): Embedder {
  return {
    embed: async (texts) => texts.map(vectorOf),
    status: () => ({ kind: 'ready', backend: 'wasm' }),
    prefetch: () => undefined,
  };
}

/** 与 core 侧测试同一套构造：给定余弦的二维向量。 */
function cosineVector(value: number): number[] {
  return [value, Math.sqrt(Math.max(0, 1 - value * value))];
}

/** 字面层能定的对（同一基准的两种写法）。 */
const literalDataset: Dataset = {
  rowCount: 4,
  columns: [{ name: '学历', values: ['硕士', '硕士研究生', '硕士', '硕士研究生'] }],
};

/** 字面零重叠、只能靠语义的对。 */
const semanticDataset: Dataset = {
  rowCount: 4,
  columns: [{ name: '学历', values: ['硕士', '研究生', '硕士', '研究生'] }],
};

/**
 * `MG／mg` 这类**归一化后是同一个 key** 的写法刻意不在测试里：
 * 它们只剩一个候选，检查不报问题是正确的 —— 分组统计用的就是归一化键，
 * 本来就不会分家。把它们当成「该报未报」会误以为这里有 bug。
 */
describe('类别归并的桥接层', () => {
  it('只给 L1/L2 判不了的取值算向量 —— 否则 500 个唯一值的列会整列送去 embed', async () => {
    const embed = vi.fn(async (texts: string[]) => texts.map(() => [1, 0]));
    const outcome = await runSynonymCheck(literalDataset, {
      embed,
      status: () => ({ kind: 'ready', backend: 'wasm' }),
      prefetch: () => undefined,
    });
    expect(embed).not.toHaveBeenCalled();
    expect(outcome.embeddedKeyCount).toBe(0);
    expect(outcome.degraded).toBe(false);
    expect(outcome.issues).toHaveLength(1);
  });

  it('字面零重叠的对会去算向量，并被提成「待确认」', async () => {
    const outcome = await runSynonymCheck(semanticDataset, fakeEmbedder(() => cosineVector(0.7195)));
    expect(outcome.embeddedKeyCount).toBe(2);
    expect(outcome.issues).toHaveLength(1);
    expect(outcome.issues[0]?.description).toContain('确认');
  });

  it('向量与 key 对齐 —— 报告的相似度必须等于这两个 key 向量的真实余弦', async () => {
    // 三个候选才能让「错位」可观察：两两算的话余弦是对称的，换位看不出来。
    // 取值刻意用四字且共享「类项目」—— 两字不相交的中文对会被护栏拦下，
    // 那样这条测的就成了护栏而不是对齐。
    const dataset: Dataset = {
      rowCount: 3,
      columns: [{ name: '类别', values: ['甲类项目', '乙类项目', '丙类项目'] }],
    };
    const unit = (degrees: number) => [
      Math.cos((degrees * Math.PI) / 180),
      Math.sin((degrees * Math.PI) / 180),
    ];
    const vectors: Record<string, number[]> = {
      甲类项目: unit(0),
      乙类项目: unit(37), // 与甲余弦 ≈ 0.799 → 待确认
      丙类项目: unit(120), // 与甲 -0.5、与乙 0.122 → 都在下界之下
    };
    const outcome = await runSynonymCheck(dataset, fakeEmbedder((text) => vectors[text] ?? [0, 0]));
    expect(outcome.embeddedKeyCount).toBe(3);

    const 甲 = vectors['甲类项目'] ?? [];
    const 乙 = vectors['乙类项目'] ?? [];
    const expected = (甲[0]! * 乙[0]! + (甲[1] ?? 0) * (乙[1] ?? 0)).toFixed(3);
    expect(outcome.issues).toHaveLength(1);
    expect(outcome.issues[0]?.evidence.statistics.semanticSimilarity).toBe(expected);
  });

  it('embedding 抛错时降级为 L1/L2，且 degraded 与原因都带出来', async () => {
    const failing: Embedder = {
      embed: async () => {
        throw new Error('模型不可用');
      },
      status: () => ({ kind: 'unavailable', reason: '测试' }),
      prefetch: () => undefined,
    };
    const outcome = await runSynonymCheck(semanticDataset, failing);
    expect(outcome.degraded).toBe(true);
    expect(outcome.degradedReason).toContain('模型不可用');
    // 降级之后「研究生／硕士」提不出来 —— 这是能力边界的如实反映
    expect(outcome.issues).toHaveLength(0);
  });

  it('降级不影响 L1/L2 能定的对', async () => {
    const failing: Embedder = {
      embed: async () => {
        throw new Error('离线');
      },
      status: () => ({ kind: 'unavailable', reason: '测试' }),
      prefetch: () => undefined,
    };
    const outcome = await runSynonymCheck(literalDataset, failing);
    expect(outcome.degraded).toBe(false); // 这一列压根不需要向量，所以不算降级
    expect(outcome.issues).toHaveLength(1);
  });

  it('没有任何候选时不加载模型', async () => {
    const embed = vi.fn(async () => []);
    const outcome = await runSynonymCheck(
      { rowCount: 3, columns: [{ name: '学历', values: ['硕士', '硕士', '硕士'] }] },
      { embed, status: () => ({ kind: 'idle' }), prefetch: () => undefined },
    );
    expect(embed).not.toHaveBeenCalled();
    expect(outcome.issues).toHaveLength(0);
  });
});
