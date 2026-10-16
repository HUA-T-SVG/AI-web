import { describe, expect, it, vi } from 'vitest';
import { EmbedderUnavailableError, createEmbedder, embeddingDimension } from './embedder';
import type { ModelLoader } from './types';

/**
 * 单元测试不能下载 25 MB 模型 —— 注入一个假 loader，测的是状态机与降级，不是模型。
 * 模型本身由 knowledge/tools/validate-embedding.mjs 真跑验证（Task 1）。
 *
 * **假向量的维度必须是 `embeddingDimension`**：维度校验生效之后，随手写个
 * `[1, 0, 0]` 会被当成「模型与索引对不上」而抛错 —— 那是对的，但会让这些
 * 测状态机的用例红得莫名其妙。把「纬度正确」这件事交给一个 helper，
 * 需要测「维度不符」的用例再显式绕过它。
 */
function vectorOf(firstComponent = 1): number[] {
  return [firstComponent, ...new Array<number>(embeddingDimension - 1).fill(0)];
}

function fakeLoader(backend: 'webgpu' | 'wasm' = 'wasm'): ModelLoader {
  return async (onProgress) => {
    onProgress(0.5);
    onProgress(1);
    return { backend, run: async (texts) => texts.map(() => vectorOf()) };
  };
}

describe('Embedder 状态机', () => {
  it('初始是 idle，不加载任何东西', () => {
    const embedder = createEmbedder({ load: fakeLoader() });
    expect(embedder.status()).toEqual({ kind: 'idle' });
  });

  it('embed 触发懒加载，成功后状态变 ready 并带上后端', async () => {
    const embedder = createEmbedder({ load: fakeLoader('webgpu') });
    const vectors = await embedder.embed(['硕士']);
    expect(vectors).toHaveLength(1);
    expect(embedder.status()).toEqual({ kind: 'ready', backend: 'webgpu' });
  });

  it('加载过程中状态是 loading 并带上进度 —— 界面要据此显示「语义归并准备中」', async () => {
    const seen: string[] = [];
    const slow: ModelLoader = async (onProgress) => {
      onProgress(0.3);
      return { backend: 'wasm', run: async (texts) => texts.map(() => vectorOf()) };
    };
    const embedder = createEmbedder({
      load: async (onProgress) => {
        const model = await slow(onProgress);
        seen.push(JSON.stringify(embedder.status()));
        return model;
      },
    });
    await embedder.embed(['x']);
    expect(seen[0]).toContain('loading');
    expect(seen[0]).toContain('0.3');
  });

  it('加载失败降级为 unavailable，并且把原因带出来给界面显示', async () => {
    const failing: ModelLoader = async () => {
      throw new Error('网络不可达');
    };
    const embedder = createEmbedder({ load: failing });
    await expect(embedder.embed(['硕士'])).rejects.toBeInstanceOf(EmbedderUnavailableError);
    const status = embedder.status();
    expect(status.kind).toBe('unavailable');
    if (status.kind === 'unavailable') expect(status.reason).toContain('网络不可达');
  });

  it('降级的错误信息要说清「什么不可用 + 已经怎么办了」', async () => {
    const failing: ModelLoader = async () => {
      throw new Error('离线');
    };
    const embedder = createEmbedder({ load: failing });
    await expect(embedder.embed(['x'])).rejects.toThrow(/降级为结构化规则/);
  });

  it('同一实例只加载一次 —— 重复加载会把 25 MB 下两遍', async () => {
    const load = vi.fn(fakeLoader());
    const embedder = createEmbedder({ load });
    await embedder.embed(['a']);
    await embedder.embed(['b']);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('并发调用只触发一次加载 —— 两列同时要向量时不能下两遍', async () => {
    const load = vi.fn(fakeLoader());
    const embedder = createEmbedder({ load });
    await Promise.all([embedder.embed(['a']), embedder.embed(['b']), embedder.embed(['c'])]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('空数组不触发加载 —— 没有候选对时不该白下 25 MB', async () => {
    const load = vi.fn(fakeLoader());
    const embedder = createEmbedder({ load });
    expect(await embedder.embed([])).toEqual([]);
    expect(load).not.toHaveBeenCalled();
    expect(embedder.status()).toEqual({ kind: 'idle' });
  });

  it('加载失败后允许重试 —— 网络恢复不必刷新页面', async () => {
    let attempt = 0;
    const flaky: ModelLoader = async () => {
      attempt += 1;
      if (attempt === 1) throw new Error('第一次离线');
      return { backend: 'wasm', run: async (texts) => texts.map(() => vectorOf()) };
    };
    const embedder = createEmbedder({ load: flaky });
    await expect(embedder.embed(['a'])).rejects.toBeInstanceOf(EmbedderUnavailableError);
    await expect(embedder.embed(['b'])).resolves.toHaveLength(1);
    expect(embedder.status().kind).toBe('ready');
  });

  it('预取不抛异常，失败只记状态', async () => {
    const failing: ModelLoader = async () => {
      throw new Error('离线');
    };
    const embedder = createEmbedder({ load: failing });
    expect(() => embedder.prefetch()).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(embedder.status().kind).toBe('unavailable');
  });

  it('已经 ready 时预取不重复加载', async () => {
    const load = vi.fn(fakeLoader());
    const embedder = createEmbedder({ load });
    await embedder.embed(['a']);
    embedder.prefetch();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(load).toHaveBeenCalledTimes(1);
  });
});

describe('向量维度校验', () => {
  /**
   * `embeddingDimension` 导出的唯一理由就是让「索引里的向量」与「查询向量」
   * 能被核对 —— 而在此之前**全仓零处使用它**，等于一个没人看的常量。
   *
   * 维度不符为什么必须抛：余弦对长度不同的两向量算出来的数**不会抛异常**，
   * 只会是一个没有意义的数。索引（512 维，构建期由 Python 脚本算好）与查询
   * （换过模型、或模型换了量化版本）不一致时，检索会照常给出排名，理由还写着
   * 「语义相近」—— 而那是编出来的依据。宁可不给结果。
   */
  it('模型返回的向量维度与约定不符时抛错，而不是让余弦算出无意义的数', async () => {
    const wrongDimension: ModelLoader = async () => ({
      backend: 'wasm',
      run: async (texts) => texts.map(() => [1, 0, 0]),
    });
    const embedder = createEmbedder({ load: wrongDimension });

    await expect(embedder.embed(['硕士'])).rejects.toThrow(/512/);
  });

  it('维度不符时状态记成 ready 也仍然抛 —— 状态与这次调用的结果不是一回事', async () => {
    // 模型**加载成功**了（status = ready），但它的输出与索引对不上。
    // 这条测试是给「以后有人把校验放进 load() 的 .then()」留的标记：
    // 校验必须在**用**的时候做，因为错的不是加载，是这个模型与索引的配对。
    const wrongDimension: ModelLoader = async () => ({
      backend: 'wasm',
      run: async (texts) => texts.map(() => [1, 0, 0]),
    });
    const embedder = createEmbedder({ load: wrongDimension });

    await expect(embedder.embed(['硕士'])).rejects.toThrow();
    expect(embedder.status().kind).toBe('ready');
  });
});
