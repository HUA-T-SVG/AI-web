import { describe, expect, it, vi } from 'vitest';
import { EmbedderUnavailableError, createEmbedder } from './embedder';
import type { ModelLoader } from './types';

/**
 * 单元测试不能下载 25 MB 模型 —— 注入一个假 loader，测的是状态机与降级，不是模型。
 * 模型本身由 knowledge/tools/validate-embedding.mjs 真跑验证（Task 1）。
 */
function fakeLoader(backend: 'webgpu' | 'wasm' = 'wasm'): ModelLoader {
  return async (onProgress) => {
    onProgress(0.5);
    onProgress(1);
    return { backend, run: async (texts) => texts.map(() => [1, 0, 0]) };
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
      return { backend: 'wasm', run: async (texts) => texts.map(() => [1]) };
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
      return { backend: 'wasm', run: async (texts) => texts.map(() => [1]) };
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
