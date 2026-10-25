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
  /**
   * 当前学科，**只用来加权，不用来排除**。
   *
   * 早先它的语义是「不传就只召回通用条目」—— 后果索引里的学科层
   * （「数据科学与大数据技术」21 条，占 18.6%）**结构上永远不可达**：
   * 运行时没有任何一处会传它，而它又没有任何地方能取到当前数据集属于哪个学科。
   * 一个永远不生效的过滤条件，比没有过滤更坏：它让人以为学科层在工作。
   *
   * 改成加权的好处是两条都保住：不传时全部 178 条都可被召回（学科条目够得着了），
   * 传了时该学科的条目排得更前。实测（`retrieve.test.ts` 里有对照用例）
   * 通用条目的 Top5 排序不受影响。
   */
  subject?: string;
  /** 当前相关的列名，用于列名加权 */
  columns?: string[];
  topK?: number;
  /**
   * 查询向量的来源模型标识。
   *
   * **用来判断稠密路是否可用**：查询向量与索引向量必须在同一个向量空间里，
   * 否则算出来的余弦没有语义含义。维度校验挡不住这件事 —— 换过后端但维度相同
   * （都是 512）时它会静默通过，然后把噪声标成「语义相近」。
   * 不传表示调用方不知道查询向量的来源，此时只走稀疏路（保守但不会骗人）。
   */
  queryModel?: string;
}

/**
 * 判断索引的后端能不能和查询模型配对。
 *
 * `index.model` 形如 `Xenova/bge-small-zh-v1.5` 或
 * `char-ngram-hash-512-v1（离线降级后端，非语义模型）`。相等即配对；
 * 否则**只走稀疏路**，并如实说明是关键词召回。
 */
function denseIsUsable(index: RuleIndex, queryModel: string | undefined): boolean {
  return queryModel !== undefined && index.model === queryModel;
}

/**
 * 一次完整检索：学科过滤 → 双路召回 → RRF 融合 → 列名加权 → Top-K。
 */
export async function retrieveRules(query: string, options: RetrieveOptions): Promise<RuleHit[]> {
  const { index, embedder, subject, columns = [], topK, queryModel } = options;

  // 候选集＝全部条目。学科只影响加权（见下面 subjectBoost），不参与排除 ——
  // 排除会让学科层永远够不着（不传 subject 时它们一条都进不了候选）。
  const candidates = index.entries;
  if (candidates.length === 0) return [];

  // 后端不配对时**不算**查询向量：省掉一次模型推理，也不会产生一个误导性的排名
  let denseUsable = denseIsUsable(index, queryModel);

  let queryVector: number[] = [];
  if (denseUsable) {
    try {
      const [vector] = await embedder.embed([query]);
      queryVector = vector ?? [];
    } catch {
      // 语义不可用**不等于**「用零向量去排个名次」：零向量的余弦恒为 0，
      // 融合后稠密路等于「按 id 字典序」——于是任意查询都会返回同一批规则，
      // 而理由还写着「语义相近」。错误注入比不注入更坏。
      // 所以这里直接关掉稠密路，只留稀疏路，并如实说成「关键词召回」。
      denseUsable = false;
      queryVector = [];
    }

    // 维度不一致时不硬算：余弦会得到一个毫无意义的数，而且不会抛异常。
    // 它对不上索引或模型换过版本时应当明确地不给结果。
    if (denseUsable && queryVector.length !== index.dim) denseUsable = false;
  }

  const sparse = rankSparse(termFrequency(query), candidates);
  const routes = denseUsable
    ? [rankDense(queryVector, candidates), sparse.map((item) => item.id)]
    : [sparse.map((item) => item.id)];
  const fused = rrfMerge(routes, index.rrfK);

  const normalizedColumns = new Set(columns.map((name) => name.replace(/\s+/g, '').toLowerCase()));
  const columnHits = new Set<string>();
  const subjectHits = new Set<string>();
  for (const record of candidates) {
    const aliases = record.适用字段.map((alias) => alias.toLowerCase());
    if (aliases.length > 0 && aliases.some((alias) => normalizedColumns.has(alias))) {
      fused.set(record.id, (fused.get(record.id) ?? 0) + FIELD_HIT_BOOST);
      columnHits.add(record.id);
    }
    // 学科加权：与列名加权同一个量级，都是「这条更贴当前场景」的证据。
    // 只加正向分，不减通用条目的分 —— 通用条目在哪个学科下都该候选。
    if (subject !== undefined && record.学科.includes(subject)) {
      fused.set(record.id, (fused.get(record.id) ?? 0) + FIELD_HIT_BOOST);
      subjectHits.add(record.id);
    }
  }

  const byId = new Map(candidates.map((record) => [record.id, record]));
  // 「正文用词相近」这条理由只给**真的有命中**的条目：BM25 会给每条候选都排个名次，
  // 零分的条目也会出现在前 K 名里，无条件取前 K 会把「语义相近」误说成「用词相近」。
  const sparseHit = new Set(
    sparse.filter((item) => item.score > 0).slice(0, topK ?? index.topK).map((item) => item.id),
  );

  return [...fused.entries()]
    // 只走稀疏路时，把 BM25 为 0 的条目丢掉：它们进榜单只是因为 `rankSparse`
    // 会给每条候选都排个名次。留着就会出现「任意查询都返回同一批规则」——
    // 那正是「错误注入比不注入更坏」要防的情形
    .filter(([id]) => denseUsable || sparseHit.has(id))
    .sort((a, b) => (b[1] !== a[1] ? b[1] - a[1] : a[0] < b[0] ? -1 : 1))
    .slice(0, topK ?? index.topK)
    .flatMap(([id, score]) => {
      const rule = byId.get(id);
      if (!rule) return [];
      const reasons: string[] = [];
      if (columnHits.has(id)) reasons.push(`列名命中「${rule.适用字段.join('、')}」`);
      if (sparseHit.has(id)) reasons.push('正文用词相近');
      // 学科加权也要说成理由：用户/模型要能看出「为什么这条比那条靠前」。
      // 不写出来，同一个查询在传与不传 subject 时的排序差异会显得毫无来由。
      if (subjectHits.has(id)) reasons.push(`学科命中「${subject}」`);
      // 「语义相近」只在稠密路真的可用时才敢说：索引后端与查询模型不配对时，
      // 那条路的分数是跨向量空间的噪声，把它说成语义相似是在编一个不存在的依据
      if (reasons.length === 0) reasons.push(denseUsable ? '语义相近' : '关键词召回');
      return [{ rule, score, reason: reasons.join('；') }];
    });
}
