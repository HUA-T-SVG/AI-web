import { createEmbedder } from './embedder';

/**
 * 模块级单例。
 *
 * 必须在模块作用域而不是组件里建：`createEmbedder` 的「同一实例只加载一次」
 * 是按实例算的，每个组件各建一个就会把 25 MB 下多遍。
 */
export const embedder = createEmbedder();

export { createEmbedder, EmbedderUnavailableError, embeddingDimension } from './embedder';
export type { Embedder } from './embedder';
export type { EmbeddingBackend, EmbedderStatus } from './types';
