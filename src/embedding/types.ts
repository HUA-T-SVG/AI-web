/**
 * 端侧向量层的类型与加载契约。
 *
 * 这一层**只在浏览器跑**，所以不放进 `core/` —— `core` 必须保持平台无关
 * （`src/core/platform.test.ts` 守着这条）。core 只拿算好的向量做余弦，
 * 见 `src/core/synonyms/types.ts`。
 */

export type EmbeddingBackend = 'webgpu' | 'wasm';

/**
 * 加载状态。三种可用状态都是给界面看的：
 * `loading` 显示「语义归并准备中」，`unavailable` 显示降级原因，
 * 而不是让用户面对一个静默失效的功能（spec §4.3 要求界面明示降级）。
 */
export type EmbedderStatus =
  | { kind: 'idle' }
  | { kind: 'loading'; ratio: number }
  | { kind: 'ready'; backend: EmbeddingBackend }
  | { kind: 'unavailable'; reason: string };

export interface LoadedModel {
  backend: EmbeddingBackend;
  run(texts: string[]): Promise<number[][]>;
}

/**
 * 加载策略可注入。
 *
 * 单元测试用它绕开 25 MB 下载（测的是状态机与降级，不是模型本身）；
 * 生产用它做 WebGPU → WASM 回退。把「怎么加载」与「加载的状态机」分开，
 * 是这一层能被测的唯一办法。
 */
export type ModelLoader = (onProgress: (ratio: number) => void) => Promise<LoadedModel>;
