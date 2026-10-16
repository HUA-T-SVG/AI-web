import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { retrieveRules } from './retrieve';
import type { Embedder } from '@/embedding/instance';
import type { RuleIndex } from './types';
import { writeEvalSection, type EvalMetric } from '../../scripts/evalEmit';

/**
 * L3（RAG 检索）评测：在真实索引上跑一组查询，算命中率与 MRR。
 *
 * 设计文档 §9 的「RAG 技术应用 6%」明文要求「建立检索评测集验证有效性」。
 * 在此之前只有 `build-index.py` 里的**自召回冒烟**（用规则自己的正例造查询），
 * 那份东西天然偏乐观，而且 `embedding-validation.md` 自己写着「它不能替代评测集」。
 *
 * **为什么做成测试而不是脚本**：Node 跑不了项目的 TS（无扩展名的目录导入），
 * 任何独立脚本都得把检索逻辑再抄一份 —— 那样评的就成了抄本。这里直接 import
 * 生产的 `retrieveRules`。
 *
 * 为什么传入的 embedder 一调用就抛错：当前索引后端是离线降级的
 * `char-ngram-hash`（非语义），`retrieveRules` 的 `queryModel` 核对会**关掉稠密路**，
 * 所以它根本不该碰模型。这条 embedder 把「不该调」变成了可执行的断言 ——
 * 哪天有人把后端配对逻辑改坏、真去调了模型，这里立刻红。
 */

const INDEX_PATH = resolve(process.cwd(), 'public/knowledge/rules.json');
const QUERIES_PATH = resolve(process.cwd(), 'knowledge/eval/retrieval-queries.json');

interface EvalQuery {
  query: string;
  columns: string[];
  category: string;
  expected: string[];
  expectMaxHits?: number;
  why: string;
}

const index = JSON.parse(readFileSync(INDEX_PATH, 'utf8')) as RuleIndex;
const spec = JSON.parse(readFileSync(QUERIES_PATH, 'utf8')) as {
  queries: EvalQuery[];
  达标线: { hitAt5: number; mrr: number };
};

const forbiddenEmbedder: Embedder = {
  embed: async () => {
    throw new Error('不该调用 embedder：索引后端与查询模型不配对时应当只走稀疏路');
  },
  status: () => ({ kind: 'unavailable', reason: '评测环境不提供模型' }),
  prefetch: () => undefined,
};

async function hitsOf(query: EvalQuery): Promise<string[]> {
  const hits = await retrieveRules(query.query, {
    index,
    embedder: forbiddenEmbedder,
    columns: query.columns,
    // 索引里存的就是这个后端名；传它表示「配对」，从而真的走一遍配对判断
    queryModel: index.model,
    topK: 5,
  });
  return hits.map((hit) => hit.rule.id);
}

interface Metrics {
  query: string;
  category: string;
  rank: number | null;
  top5: string[];
}

async function evaluate(): Promise<Metrics[]> {
  const metrics: Metrics[] = [];
  for (const query of spec.queries) {
    const top5 = await hitsOf(query);
    // 命中排名：expected 里最早出现的那一条的位置（1-based）；没命中记 null
    const ranks = query.expected
      .map((id) => top5.indexOf(id))
      .filter((position) => position >= 0)
      .map((position) => position + 1);
    metrics.push({
      query: query.query,
      category: query.category,
      rank: ranks.length > 0 ? Math.min(...ranks) : null,
      top5,
    });
  }
  return metrics;
}

describe('L3 检索评测 · 真实索引', () => {
  it('索引后端必须是 char-ngram-hash —— 换了后端必须重扫达标线', () => {
    // 达标线是按当前后端定的。换 bge 之后检索会变强，但**阈值与后端强绑定**
    // （spec §5.5.4 第五步），所以这里先拦住「换了后端却没回来重看达标线」
    expect(index.model).toContain('char-ngram-hash');
  });

  it('查询集规模与形态：至少 20 条，含学科专属 / 通用 / 边界三类', () => {
    expect(spec.queries.length).toBeGreaterThanOrEqual(20);
    const categories = new Set(spec.queries.map((query) => query.category));
    expect([...categories].sort()).toEqual(['学科专属', '边界', '通用']);
    // 期望命中的 id 必须真实存在，否则「没命中」会是测试自己的错
    const ids = new Set(index.entries.map((entry) => entry.id));
    const missing = spec.queries
      .flatMap((query) => query.expected)
      .filter((id) => !ids.has(id) && id !== '');
    expect(missing, `查询集里的期望 id 在索引里不存在：${missing.join('、')}`).toEqual([]);
  });

  it('每条查询的达标情况与整体指标', async () => {
    const queryMetrics = await evaluate();
    // 只有「有期望命中」的查询才参与命中率与 MRR —— 边界查询本来就不该命中，
    // 把它们算进分母会让 Hit@1 凭空变低（实测踩过：21 当分母得 85.7%，
    // 正确分母是 19，得 94.7%）
    const withExpectation = queryMetrics.filter((metric) =>
      spec.queries.some((query) => query.query === metric.query && query.expected.length > 0),
    );

    const hitAt1 = withExpectation.filter((item) => item.rank === 1).length;
    const hitAt5 = withExpectation.filter((item) => item.rank !== null).length;
    const rr = withExpectation.reduce((sum, item) => sum + (item.rank === null ? 0 : 1 / item.rank), 0);
    const mrr = rr / withExpectation.length;

    const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
    const lines: string[] = [''];
    lines.push(`索引 ${index.entries.length} 条 · 后端 ${index.model.split('（')[0]} · 查询 ${queryMetrics.length} 条`);
    lines.push(`有期望命中的查询 ${withExpectation.length} 条（其余是边界查询，不参与命中率）`);
    lines.push('');
    lines.push('| 查询 | 类别 | 命中排名 | Top-5 |');
    lines.push('| --- | --- | --- | --- |');
    for (const metric of queryMetrics) {
      const expectation = spec.queries.find((q) => q.query === metric.query);
      const hasExpectation = (expectation?.expected.length ?? 0) > 0;
      const limit = expectation?.expectMaxHits;
      const verdict =
        hasExpectation
          ? metric.rank === null
            ? '**未命中**'
            : `#${metric.rank}`
          : metric.top5.length <= (limit ?? 0)
            ? `空/少（${metric.top5.length}）`
            : `**${metric.top5.length} 条**`;
      lines.push(`| ${metric.query} | ${metric.category} | ${verdict} | ${metric.top5.join(', ') || '（空）'} |`);
    }
    lines.push('');
    lines.push(
      `**Hit@1 ${percent(hitAt1 / withExpectation.length)} · Hit@5 ${percent(hitAt5 / withExpectation.length)} · MRR ${mrr.toFixed(4)}**`,
    );
    lines.push(`达标线：Hit@5 ≥ ${percent(spec.达标线.hitAt5)}、MRR ≥ ${spec.达标线.mrr}`);
    lines.push('');
    console.log(lines.join('\n'));

    const hit5Rule = `注入 Prompt 的是 Top-5，答案落在前五条里模型就能用到，要求 ≥${percent(spec.达标线.hitAt5)}`;
    const mrrRule = `保证答案不是永远排第五，要求 ≥${spec.达标线.mrr}`;
    const hitAt5Value = hitAt5 / withExpectation.length;

    /**
     * 边界查询实际召回了多少 —— **实测，不写死**。
     *
     * 第一版这里写的是常量 2（我从探针输出里抄的）。那是错的：一旦换了边界
     * 查询、改了后端或调了排序，这个数字就会撒谎，而看板上看不出它是写死的。
     * 现在真跑一遍边界查询来数。
     */
    const boundaryQueries = spec.queries.filter((query) => query.category === '边界');
    const boundaryHits: number[] = [];
    for (const query of boundaryQueries) {
      boundaryHits.push((await hitsOf(query)).length);
    }
    const boundaryMax = Math.max(0, ...boundaryHits);
    const boundaryAllowed = Math.max(0, ...boundaryQueries.map((query) => query.expectMaxHits ?? 0));
    const boundaryRule = `边界查询实际最多 ${boundaryMax} 条（允许 ≤${boundaryAllowed} 条）。字符 2-gram 只按字面重叠打分，所以它对无关查询也会给分 —— 这是后端的固有弱点`;

    const metrics: EvalMetric[] = [
      { name: 'Hit@5', value: hitAt5Value, rule: hit5Rule, passed: hitAt5Value >= spec.达标线.hitAt5 },
      { name: 'MRR', value: mrr, rule: mrrRule, passed: mrr >= spec.达标线.mrr },
      {
        name: 'Hit@1',
        value: hitAt1 / withExpectation.length,
        rule: '没有达标线，仅作参照；它反映排到第 1 的比例',
      },
      {
        name: '无关查询的误召回',
        value: boundaryMax,
        unit: '条',
        rule: boundaryRule,
        passed: boundaryMax <= boundaryAllowed,
      },
      {
        name: '索引条目',
        value: index.entries.length,
        unit: '条',
        rule: '规则库规模，来自团队填写',
      },
    ];

    writeEvalSection('retrieval', {
      title: 'L3 领域规则检索',
      description:
        '在真实索引（113 条）上跑 21 条查询（8 条学科专属 + 11 条通用 + 2 条边界）算命中率与 MRR。',
      metrics,
      groups: spec.queries.map((query, position) => {
        const metric = queryMetrics[position];
        return {
          name: query.query,
          metrics: [
            {
              name: '命中排名',
              text: metric?.rank === null ? '未命中' : `#${metric?.rank}`,
              rule: `期望命中：${query.expected.join('、') || '（不该命中）'}`,
              passed: query.expected.length === 0 ? (metric?.top5.length ?? 0) <= (query.expectMaxHits ?? 0) : metric?.rank !== null,
            },
          ],
        };
      }),
      measuredAt: new Date().toISOString(),
      command: 'pnpm vitest run src/knowledge/retrievalEval.test.ts',
      notCovered: [
        '查询是手写的、且取自规则描述的关键词 —— 所以本报告的分数比 Agent 真实发出的 query 乐观',
        '稠密路（语义检索）没被测：当前索引后端是 char-ngram-hash，配对检查会关掉稠密路',
        '检索结果的生成质量（规则正文有没有帮到模型）属于 L4',
      ],
    });

    // 这两条是**达标门禁**，不是参考值。定这条线的理由写在查询集的 JSON 里
    expect(hitAt5 / withExpectation.length).toBeGreaterThanOrEqual(spec.达标线.hitAt5);
    expect(mrr).toBeGreaterThanOrEqual(spec.达标线.mrr);
  });

  it('边界查询不得被通用规则淹没', async () => {
    const boundary = spec.queries.filter((query) => query.category === '边界');
    expect(boundary.length).toBeGreaterThanOrEqual(2);
    for (const query of boundary) {
      const top5 = await hitsOf(query);
      // 期望命中为空时，`expectMaxHits` 就是「最多容忍几条」
      expect(
        top5.length,
        `「${query.query}」召回了 ${top5.length} 条：${top5.join(', ')}`,
      ).toBeLessThanOrEqual(query.expectMaxHits ?? 0);
    }
  });

  it('无关查询也能召回 0～2 条这件事本身，是换后端的最硬证据之一', async () => {
    // 这条不是断言「实现很烂」，而是把后端弱点**量出来**：
    // 字符 2-gram 只按字面重叠打分，任何 2-gram 有交集就会给分，
    // 所以它对无关查询也会返回结果。换 bge 之后这个数字应当显著下降。
    const unrelated = await hitsOf(
      spec.queries.find((query) => query.query.includes('量子纠缠'))!,
    );
    expect(unrelated.length).toBeGreaterThan(0);
    // 但**必须都低于命中阈值**：这些结果不该被伪装成「语义相近」
    const hits = await retrieveRules(
      spec.queries.find((query) => query.query.includes('量子纠缠'))!.query,
      { index, embedder: forbiddenEmbedder, columns: [], queryModel: index.model, topK: 5 },
    );
    for (const hit of hits) {
      expect(hit.reason).not.toContain('语义相近');
    }
  });
});
