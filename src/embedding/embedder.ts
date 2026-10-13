import { loadModel } from './loadModel';
import type { EmbedderStatus, LoadedModel, ModelLoader } from './types';

/**
 * 语义模型不可用。
 *
 * 单独一个错误类型是为了让调用方能区分「模型不可用」（降级，界面明示即可）
 * 与「算向量时出错」（真故障）。前者不该被当成异常上报给监控。
 */
export class EmbedderUnavailableError extends Error {}

/**
 * bge-small-zh-v1.5 的向量维度。
 *
 * 写死是为了让 `knowledge/index/rules.json` 里预存的向量维度能被校验 ——
 * 索引与查询端维度不一致时，余弦会算出毫无意义的数，而那种错误不会抛异常。
 */
export const embeddingDimension = 512;

export interface Embedder {
  /** 懒加载后批量算向量；不可用时抛 EmbedderUnavailableError */
  embed(texts: string[]): Promise<number[][]>;
  status(): EmbedderStatus;
  /** 空闲时预取，不阻塞主流程 */
  prefetch(): void;
}

export function createEmbedder(options: { load?: ModelLoader } = {}): Embedder {
  const load = options.load ?? loadModel;
  let status: EmbedderStatus = { kind: 'idle' };
  let pending: Promise<LoadedModel> | null = null;

  function start(): Promise<LoadedModel> {
    // 同一实例只加载一次。`pending` 在赋值之前就完成同步设置，
    // 所以并发调用（两列同时要向量）也只会触发一次 —— 否则 25 MB 会被下两遍。
    if (!pending) {
      status = { kind: 'loading', ratio: 0 };
      pending = load((ratio) => {
        status = { kind: 'loading', ratio };
      })
        .then((model) => {
          status = { kind: 'ready', backend: model.backend };
          return model;
        })
        .catch((error: unknown) => {
          const reason = error instanceof Error ? error.message : String(error);
          status = { kind: 'unavailable', reason };
          // 置空以允许重试：网络恢复后不必刷新页面。代价是重试会再下一次 —— 可接受，
          // 因为失败一次之后用户下次真的要用时，重试比「永久失效」有用得多。
          pending = null;
          throw error;
        });
    }
    return pending;
  }

  return {
    async embed(texts) {
      // 没有候选对时不加载：白下 25 MB 而一个向量都用不上
      if (texts.length === 0) return [];
      let model: LoadedModel;
      try {
        model = await start();
      } catch (error) {
        throw new EmbedderUnavailableError(
          `语义模型不可用（${error instanceof Error ? error.message : String(error)}），已降级为结构化规则。`,
        );
      }
      return model.run(texts);
    },

    status: () => status,

    prefetch() {
      // 空闲预取是优化，不是主流程：失败只记状态，绝不抛给调用方。
      // 抛出去会让一个纯优化把应用外壳的 useEffect 打崩。
      if (status.kind !== 'idle') return;
      void start().catch(() => undefined);
    },
  };
}
