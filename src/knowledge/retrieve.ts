/**
 * 检索口径**照抄** `knowledge/tools/build-index.py` 的参考实现。
 *
 * 为什么要照抄而不是「照着思路重写一遍」：`knowledge/schema.md` 第 6 节与
 * `build-report.md` 里那句「分数、指标均可由构建脚本复现」只有在两边口径完全
 * 一致时才成立。四个数字必须与那边相同：
 *
 *   RRF_K = 60 · BM25_K1 = 1.2 · BM25_B = 0.75 · FIELD_HIT_BOOST = 0.05
 *
 * 列名加权 0.05 大于 RRF 双路 rank-1 的合计（约 0.033），所以**列名命中是最强信号**
 * —— 这是有意的：领域规则常含专有名词与编码（如「GB/T 2260」），纯向量检索对
 * 精确匹配不敏感，而列名「行政区划」能精确命中。
 */
import type { Embedder } from '@/embedding/instance';
import type { RuleHit, RuleIndex, RuleRecord } from './types';

const BM25_K1 = 1.2;
const BM25_B = 0.75;
const FIELD_HIT_BOOST = 0.05;

/**
 * 字符 2-gram。
 *
 * 先去掉所有空白再切：否则「硕士 研究生」会切出「士 」「 研」这种带空格的 gram，
 * 与「硕士研究生」召不回同一条规则。
 */
export function toGrams(text: string): string[] {
  const compact = text.replace(/\s+/g, '').toLowerCase();
  if (compact.length < 2) return compact === '' ? [] : [compact];
  const grams: string[] = [];
  for (let i = 0; i < compact.length - 1; i += 1) grams.push(compact.slice(i, i + 2));
  return grams;
}

function termFrequency(text: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const gram of toGrams(text)) counts.set(gram, (counts.get(gram) ?? 0) + 1);
  return counts;
}

function cosine(left: number[], right: number[]): number {
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let i = 0; i < left.length; i += 1) {
    const l = left[i] ?? 0;
    const r = right[i] ?? 0;
    dot += l * r;
    leftNorm += l * l;
    rightNorm += r * r;
  }
  if (leftNorm === 0 || rightNorm === 0) return 0;
  return dot / Math.sqrt(leftNorm * rightNorm);
}

function rankDense(query: number[], candidates: RuleRecord[]): string[] {
  return [...candidates]
    .map((record) => ({ id: record.id, score: cosine(query, record.embedding) }))
    .sort((a, b) => (b.score !== a.score ? b.score - a.score : a.id < b.id ? -1 : 1))
    .map((item) => item.id);
}

/** BM25。文档侧词频来自构建期，df 现算（语料就是全部条目，很小）。 */
function rankSparse(
  queryTf: Map<string, number>,
  candidates: RuleRecord[],
): Array<{ id: string; score: number }> {
  const totalDocs = candidates.length;
  const lengths = new Map(
    candidates.map((record) => [
      record.id,
      Object.values(record.sparse).reduce((sum, value) => sum + value, 0),
    ]),
  );
  const avgLength = totalDocs > 0 ? [...lengths.values()].reduce((a, b) => a + b, 0) / totalDocs : 0;

  const df = new Map<string, number>();
  for (const record of candidates) {
    for (const gram of Object.keys(record.sparse)) df.set(gram, (df.get(gram) ?? 0) + 1);
  }

  return candidates
    .map((record) => {
      let score = 0;
      const length = lengths.get(record.id) ?? 0;
      for (const [gram, queryCount] of queryTf) {
        const tf = record.sparse[gram];
        if (!tf) continue;
        const docFreq = df.get(gram) ?? 0;
        const idf = Math.log(1 + (totalDocs - docFreq + 0.5) / (docFreq + 0.5));
        const denominator =
          tf + BM25_K1 * (1 - BM25_B + BM25_B * (avgLength ? length / avgLength : 1));
        score += idf * ((tf * (BM25_K1 + 1)) / denominator) * (1 + Math.log(queryCount));
      }
      return { id: record.id, score };
    })
    .sort((a, b) => (b.score !== a.score ? b.score - a.score : a.id < b.id ? -1 : 1));
}

function rrfMerge(rankings: string[][], k: number): Map<string, number> {
  const fused = new Map<string, number>();
  for (const ranking of rankings) {
    ranking.forEach((id, position) => {
      fused.set(id, (fused.get(id) ?? 0) + 1 / (k + position + 1));
    });
  }
  return fused;
}

export interface RetrieveOptions {
  index: RuleIndex;
  embedder: Embedder;
  /** 当前学科。不传表示只召回「通用」 */
  subject?: string;
  /** 当前相关的列名，用于列名加权 */
  columns?: string[];
  topK?: number;
}

/**
 * 一次完整检索：学科过滤 → 双路召回 → RRF 融合 → 列名加权 → Top-K。
 */
export async function retrieveRules(query: string, options: RetrieveOptions): Promise<RuleHit[]> {
  const { index, embedder, subject, columns = [], topK } = options;

  const candidates = index.entries.filter(
    (record) => record.学科.includes('通用') || (subject ? record.学科.includes(subject) : false),
  );
  if (candidates.length === 0) return [];

  let queryVector: number[];
  try {
    const [vector] = await embedder.embed([query]);
    queryVector = vector ?? [];
  } catch {
    // 语义不可用时稀疏路仍然能召回 —— 这是降级路径，不是失败。
    // 用与索引等长的零向量，让稠密路的排名退化为「按 id 稳定排序」。
    queryVector = new Array<number>(index.dim).fill(0);
  }

  // 维度不一致时不硬算：余弦会得到一个毫无意义的数，而且不会抛异常。
  // 它对不上索引或模型换过版本时应当明确地不给结果。
  if (queryVector.length !== index.dim) return [];

  const dense = rankDense(queryVector, candidates);
  const sparse = rankSparse(termFrequency(query), candidates);
  const fused = rrfMerge(
    [dense, sparse.map((item) => item.id)],
    index.rrfK,
  );

  const normalizedColumns = new Set(columns.map((name) => name.replace(/\s+/g, '').toLowerCase()));
  const columnHits = new Set<string>();
  for (const record of candidates) {
    const aliases = record.适用字段.map((alias) => alias.toLowerCase());
    if (aliases.length > 0 && aliases.some((alias) => normalizedColumns.has(alias))) {
      fused.set(record.id, (fused.get(record.id) ?? 0) + FIELD_HIT_BOOST);
      columnHits.add(record.id);
    }
  }

  const byId = new Map(candidates.map((record) => [record.id, record]));
  // 「正文用词相近」这条理由只给**真的有命中**的条目：BM25 会给每条候选都排个名次，
  // 零分的条目也会出现在前 K 名里，无条件取前 K 会把「语义相近」误说成「用词相近」。
  const sparseHit = new Set(
    sparse.filter((item) => item.score > 0).slice(0, topK ?? index.topK).map((item) => item.id),
  );

  return [...fused.entries()]
    .sort((a, b) => (b[1] !== a[1] ? b[1] - a[1] : a[0] < b[0] ? -1 : 1))
    .slice(0, topK ?? index.topK)
    .flatMap(([id, score]) => {
      const rule = byId.get(id);
      if (!rule) return [];
      const reasons: string[] = [];
      if (columnHits.has(id)) reasons.push(`列名命中「${rule.适用字段.join('、')}」`);
      if (sparseHit.has(id)) reasons.push('正文用词相近');
      if (reasons.length === 0) reasons.push('语义相近');
      return [{ rule, score, reason: reasons.join('；') }];
    });
}
