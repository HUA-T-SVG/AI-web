import {
  DEFAULT_THRESHOLDS,
  checkCategorySynonyms,
  collectSynonymCandidates,
  type Dataset,
  type QualityIssue,
  type SynonymThresholds,
} from '@/core';
import { EmbedderUnavailableError, type Embedder } from '@/embedding/instance';

export interface SynonymCheckOutcome {
  issues: QualityIssue[];
  /**
   * 语义模型不可用，本次只跑了 L1/L2。
   * 界面必须把它显示出来 —— 悄悄降级会让用户以为「检查过了，没问题」。
   */
  degraded: boolean;
  /** 降级原因，直接取自 EmbedderUnavailableError 的消息 */
  degradedReason?: string;
  /** 实际算了多少个取值的向量，用于说明这次到底做了什么 */
  embeddedKeyCount: number;
}

/**
 * 串起 core 与 embedding：粗筛 → 算向量 → 决策。
 *
 * 为什么分两趟而不是让 core 自己去调 embedding：**core 必须保持平台无关且同步**
 * （`src/core/platform.test.ts` 守着这条），而 embedding 是异步的、只在浏览器跑。
 * 所以向量在这里算好，作为普通数据喂进 core。
 *
 * 代价是 core 的检查签名多了一个可选参数；收益是同一份 core 能被将来的
 * MCP Server 复用，且「界面显示的结果」与「导出脚本的结果」架构上不可能不一致。
 */
export async function runSynonymCheck(
  dataset: Dataset,
  embedder: Embedder,
  options: { thresholds?: Partial<SynonymThresholds> } = {},
): Promise<SynonymCheckOutcome> {
  const thresholds = { ...DEFAULT_THRESHOLDS, ...options.thresholds };
  const analyses = collectSynonymCandidates(dataset);

  // 只给「L1/L2 判不了、需要语义」的取值算向量。
  // 不做这一层粗筛的话，500 个唯一值的列会把整列都送去 embed —— 而其中绝大多数
  // 对早就由字面层定完了，算它们纯属浪费（也拖慢「检查全流程 ≤30 秒」的预算）。
  const needSemantic = new Set<string>();
  for (const analysis of analyses) {
    for (const signal of analysis.signals) {
      const decidedByStructure =
        signal.normalizedEqual || signal.literalSimilarity >= thresholds.literal;
      if (!decidedByStructure) {
        needSemantic.add(signal.a);
        needSemantic.add(signal.b);
      }
    }
  }

  let vectors: Map<string, number[]> | undefined;
  let degraded = false;
  let degradedReason: string | undefined;

  if (needSemantic.size > 0) {
    try {
      const keys = [...needSemantic];
      const computed = await embedder.embed(keys);
      vectors = new Map(keys.map((key, index) => [key, computed[index] ?? []]));
    } catch (error) {
      // 降级不是失败：L1/L2 仍然工作（spec §5.5.2 的分层策略本来就为此设计）
      degraded = true;
      degradedReason =
        error instanceof EmbedderUnavailableError
          ? error.message
          : `语义模型不可用（${error instanceof Error ? error.message : String(error)}）。`;
    }
  }

  return {
    issues: checkCategorySynonyms(dataset, { thresholds: options.thresholds, vectors }),
    degraded,
    degradedReason,
    embeddedKeyCount: vectors?.size ?? 0,
  };
}
