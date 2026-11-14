import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { generateText } from 'ai';
import { describe, expect, it } from 'vitest';
import { getChatModel } from '@/agent/server/provider';
import { embedder, type Embedder } from '@/embedding/instance';
import type { RuleIndex } from '@/knowledge/types';
import {
  evaluateRagPairs, ragCasesSchema, RAG_EVAL_INSTRUCTIONS, renderRagSummaryMarkdown,
  summarizeRagPairs, type ModelCall, type RagCase, type RagPair,
} from './ragComparison';

const cases = ragCasesSchema.parse(JSON.parse(readFileSync('knowledge/eval/rag-comparison-cases.json', 'utf8')));
// predev 从此处把同一份索引同步到 public；不依赖本机当前生成物或 dev server。
const index = JSON.parse(readFileSync('knowledge/index/rules.json', 'utf8')) as RuleIndex;
const runLive = process.env.RUN_RAG_COMPARISON === '1';
const timeoutMs = 30_000;
type RagPairArm = RagPair['with'];

function caseOf(id: string): RagCase {
  const item = cases.find((entry) => entry.id === id);
  if (!item) throw new Error(`找不到评测案例 ${id}`);
  return item;
}

const blockedEmbedding: Embedder = {
  embed: async () => { throw new Error('离线测试不加载模型'); },
  status: () => ({ kind: 'unavailable', reason: '离线测试' }),
  prefetch: () => undefined,
};

describe('RAG 生成质量配对评测 · 离线', () => {
  it('固定案例包含正反例、冲突、歧义和无适用规则，且标注规则真实存在', () => {
    const knownIds = new Set(index.entries.map((item) => item.id));
    const knownSubjects = new Set(index.entries.flatMap((item) => item.学科));
    expect(new Set(cases.map((item) => item.id)).size).toBe(cases.length);
    expect(cases.filter((item) => item.requiresAbstention).length).toBeGreaterThanOrEqual(3);
    expect(cases.filter((item) => !item.applicableRuleIds.length).length).toBeGreaterThanOrEqual(2);
    for (const item of cases) {
      expect(new Set(item.options.map((option) => option.id)).size).toBe(3);
      expect(item.applicableRuleIds.every((id) => knownIds.has(id))).toBe(true);
      expect(!item.subject || knownSubjects.has(item.subject)).toBe(true);
    }
  });

  it('公开质量看板的五项计数可从同一轮逐例记录与案例标注复算', () => {
    type Observation = {
      state: RagPairArm['state'];
      decision: RagCase['expected'] | null;
      abstain: boolean | null;
      citations: string[];
      retrieved: string[];
    };
    type PublishedRun = {
      measuredAt: string;
      model: string;
      repeats: number;
      cases: string[];
      index: { topK: number };
      observations: { caseId: string; repeat: number; without: Observation; with: Observation }[];
    };
    const panel = JSON.parse(readFileSync('knowledge/reports/eval-rag-comparison.json', 'utf8'));
    const { runs } = JSON.parse(readFileSync('knowledge/reports/eval-rag-comparison-runs.json', 'utf8')) as { runs: PublishedRun[] };
    const run = runs.find((item) => item.measuredAt === panel.measuredAt);
    expect(run, '看板汇总必须指向一轮真实的公开运行').toBeDefined();
    if (!run) return;
    const { observations } = run;
    expect(run.cases).toEqual(cases.map((item) => item.id));
    expect(new Set(observations.map((item) => `${item.caseId}:${item.repeat}`)).size).toBe(cases.length * run.repeats);
    expect(observations).toHaveLength(cases.length * run.repeats);
    expect(panel).toMatchObject({
      model: run.model, caseCount: cases.length, repeats: run.repeats, pairCount: observations.length, topK: run.index.topK,
    });

    for (const arm of ['without', 'with'] as const) {
      const rows = observations.map((observation) => {
        const gold = caseOf(observation.caseId);
        const output = observation[arm];
        const decisionCorrect = output.state === 'ok' && output.decision === gold.expected;
        const correct = decisionCorrect && output.abstain === gold.requiresAbstention;
        const citations = [...new Set(output.citations)];
        const valid = citations.filter((id) => output.retrieved.includes(id) && gold.applicableRuleIds.includes(id));
        return { decisionCorrect, correct, citations, valid, gold };
      });
      const needsAbstention = rows.filter((row) => row.gold.requiresAbstention);
      const withoutRule = rows.filter((row) => row.gold.applicableRuleIds.length === 0);
      expect(Object.fromEntries(Object.entries(panel.metrics).map(([key, value]) => [
        key, (value as Record<typeof arm, number[]>)[arm],
      ]))).toEqual({
        decisionCorrect: [rows.filter((row) => row.decisionCorrect).length, rows.length],
        decisionAndAbstentionCorrect: [rows.filter((row) => row.correct).length, rows.length],
        requiredAbstentionCorrect: [needsAbstention.filter((row) => row.correct).length, needsAbstention.length],
        applicableCitations: [rows.flatMap((row) => row.valid).length, rows.flatMap((row) => row.citations).length],
        citationsWithoutApplicableRule: [withoutRule.filter((row) => row.citations.length > 0).length, withoutRule.length],
      });
    }
  });

  it('请求只在候选规则上不同，接受召回且适用的引用；相关字样不能替代适用证据', async () => {
    const positive = caseOf('confirmed-sentinel');
    const neg = caseOf('legitimate-high-score');
    const prompts: Record<string, unknown>[] = [];
    const pairs = await evaluateRagPairs([positive, neg], index, blockedEmbedding, async (prompt) => {
      const payload = JSON.parse(prompt) as { question: string; candidateRules: { id: string }[] };
      prompts.push(payload);
      const isPositive = payload.question === positive.question;
      const citations = isPositive
        ? payload.candidateRules.filter((rule) => positive.applicableRuleIds.includes(rule.id)).slice(0, 1)
        : payload.candidateRules.slice(0, 1);
      return { text: JSON.stringify({
        decision: isPositive ? 'B' : 'A', abstain: false,
        citedRuleIds: citations.map((rule) => rule.id), reason: '离线测试固定输出',
      }) };
    });
    for (const [n, item] of [positive, neg].entries()) {
      const inputs = prompts.filter((message) => message.question === item.question);
      expect(inputs).toHaveLength(2);
      const withoutCandidates = (input: Record<string, unknown>) => {
        const copy = { ...input };
        delete copy.candidateRules;
        return copy;
      };
      expect(withoutCandidates(inputs[0]!)).toEqual(withoutCandidates(inputs[1]!));
      expect(inputs[n]!.candidateRules).toEqual([]); // 两个案例顺序相反
      expect(inputs[0]).not.toHaveProperty('expected');
      expect(inputs[0]).not.toHaveProperty('applicableRuleIds');
    }
    expect(pairs[0]!.with.validCitations).toHaveLength(1);
    expect(pairs[1]!.with.invalidCitations).toHaveLength(1);
    const summary = summarizeRagPairs(pairs);
    expect(summary.with).toMatchObject({
      correct: 2, total: 2, validCitations: 1, totalCitations: 2, fullyGroundedAnswers: 1,
      noRuleCasesWithUnfoundedCitations: 1, noRuleCasesWithRetrievedCandidates: 1,
    });
    expect(summary.outcome).toMatchObject({ bothCorrect: 2, wins: 0, losses: 0 });
  });

  it('错判暂缓、模型格式错误和接口错误不会算成正确或改善', async () => {
    const casesSubset = [caseOf('uncertain-negative'), caseOf('unrelated-request')];
    let call = 0;
    const pairs = await evaluateRagPairs(casesSubset, index, blockedEmbedding, async () => {
      call++;
      if (call === 3) throw Object.assign(new Error('供应商原始错误不应出现在产物里'), { statusCode: 429 });
      if (call === 4) return { text: '缺少机器可读答案' };
      return { text: JSON.stringify({
        decision: 'C', abstain: call === 2, citedRuleIds: call === 2 ? ['invented'] : [], reason: '离线测试固定输出',
      }) };
    });
    const summary = summarizeRagPairs(pairs);
    expect(summary.with).toMatchObject({
      decisionCorrect: 1, correct: 1, abstainedCorrectly: 1, validCitations: 0, totalCitations: 1, requestErrors: 1,
    });
    expect(summary.without).toMatchObject({ decisionCorrect: 1, correct: 0, invalidOutputs: 1, abstainedCorrectly: 0 });
    expect(summary.outcome).toMatchObject({ wins: 1, incomplete: 1 });
    expect(pairs[1]!.with.requestError).toBe('http-429');
    expect(JSON.stringify(pairs)).not.toContain('供应商原始错误');
  });
});

it.skipIf(!runLive)('真实模型 · 生成有无 RAG 的成对报告', async () => {
  // 只有明确执行评测时才加载本地配置；Node 仍以调用者已设置的环境为准。
  try {
    process.loadEnvFile('.env.local');
  } catch (error) {
    if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'ENOENT') throw error;
  }
  const model = getChatModel();
  const repeats = Number(process.env.RAG_COMPARISON_REPEATS ?? 1);
  if (!Number.isInteger(repeats) || repeats < 1 || repeats > 3) throw new Error('RAG_COMPARISON_REPEATS 必须为 1 至 3。');
  const ids = process.env.RAG_COMPARISON_CASES?.split(',').map((id) => id.trim()).filter(Boolean);
  const selected = ids?.length ? [...new Set(ids)].map(caseOf) : cases;
  const call: ModelCall = async (prompt) => {
    const result = await generateText({
      model, instructions: RAG_EVAL_INSTRUCTIONS, prompt, temperature: 0,
      maxOutputTokens: 1600, maxRetries: 0, abortSignal: AbortSignal.timeout(timeoutMs),
    });
    return { text: result.text, inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens };
  };
  const pairs = await evaluateRagPairs(selected, index, embedder, call, repeats);
  const summary = summarizeRagPairs(pairs);
  const measuredAt = new Date().toISOString();
  const mode = selected.length === cases.length ? '全案例' : '子集冒烟（不是全量结果）';
  const target = resolve('.tmp/rag-comparison', measuredAt.replace(/[:.]/g, '-'));
  mkdirSync(target, { recursive: true });
  const partial = summary.outcome.incomplete ? '请求有缺失；不可据此宣称有无 RAG 的效果差异。' : '每对均收到响应；格式错误计为判断失败。';
  const metadata = {
    measuredAt, model: model.modelId, mode, repeats, cases: selected.map((item) => item.id),
    settings: { temperature: 0, maxOutputTokens: 1600, maxRetries: 0, timeoutMs },
    index: { model: index.model, size: index.entries.length, builtAt: index.builtAt, topK: index.topK },
  };
  writeFileSync(resolve(target, 'raw.json'), JSON.stringify({ ...metadata, summary, pairs }, null, 2) + '\n', 'utf8');
  // 此投影可随报告公开复核，不带不受约束的模型文本。
  const compact = ({ state, requestError, retrieved, answer, requestMs, retrievalMs }: RagPairArm) => ({
    state, requestError, retrieved, decision: answer?.decision ?? null, abstain: answer?.abstain ?? null,
    citations: answer?.citedRuleIds ?? [], elapsedMs: Math.round(requestMs + retrievalMs),
  });
  writeFileSync(resolve(target, 'observations.json'), JSON.stringify({
    ...metadata,
    observations: pairs.map((pair) => ({
      caseId: pair.caseId, repeat: pair.repeat, without: compact(pair.without), with: compact(pair.with),
    })),
  }, null, 2) + '\n', 'utf8');
  writeFileSync(resolve(target, 'summary.md'), [
    '# 有无 RAG 配对评测 · 真实模型运行', '',
    `时间：${measuredAt} · 模型：${model.modelId} · ${mode} · ${selected.length} 个案例 × ${repeats} 次`,
    `索引：${index.entries.length} 条 · Top-${index.topK} · ${index.model}`, partial, '',
    renderRagSummaryMarkdown(summary, pairs),
  ].join('\n'), 'utf8');
  console.log(`配对评测产物：${target}\n\n${renderRagSummaryMarkdown(summary, pairs)}`);
  expect(summary.outcome.incomplete, '至少一组接口请求未完成；已保存逐条报告，但无需把试验误判为成功。').toBe(0);
}, 3 * cases.length * 2 * (timeoutMs + 1_000));
