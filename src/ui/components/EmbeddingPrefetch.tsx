'use client';

import { useEffect } from 'react';
import { embedder } from '@/embedding/instance';

/**
 * 空闲时后台预取语义模型（spec §4.3 的「懒加载 + 后台预取」）。
 *
 * **单独一个组件而不是写进 `AppShell`**：`AppShell` 目前是 Server Component，
 * 给它加 `useEffect` 就要加 `'use client'`，那会把整个应用外壳拖成客户端组件 ——
 * 只为了跑一个 3 秒后的定时器。这个组件渲染 `null`，客户端边界就限定在它自己。
 */
export function EmbeddingPrefetch() {
  useEffect(() => {
    // 延迟 3 秒：让首屏的解析与渲染先做完。模型约 25 MB，
    // 立刻开下会和首屏抢带宽 —— 而这个功能在用户点开分析之前都用不到。
    const timer = window.setTimeout(() => embedder.prefetch(), 3000);
    return () => window.clearTimeout(timer);
  }, []);

  return null;
}
