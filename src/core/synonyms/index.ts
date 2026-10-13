/**
 * 类别同义归并。
 *
 * 分层来自 spec §5.5.2：L1 规范化 / L2 字面 / L3 语义。
 * **L3 需要向量，而 core 不做 embedding** —— 向量由调用方（浏览器侧的
 * `src/embedding/`）算好，经 `vectors` 传进来。这样 core 保持平台无关且同步，
 * 同一份实现能被将来的 MCP Server 复用（设计文档 §3.4）。
 */
export { checkCategorySynonyms, collectSynonymCandidates, decideSynonymVerdicts, DEFAULT_THRESHOLDS } from './decide';
export type { SynonymVerdictResult } from './decide';
export { isGuardedPair } from './guard';
export { jaroWinkler, levenshteinDistance, literalSimilarity, normalizedLevenshtein, stripSuffixes } from './literal';
export type {
  SynonymAnalysis,
  SynonymCandidate,
  SynonymSignals,
  SynonymThresholds,
  SynonymVerdict,
} from './types';
