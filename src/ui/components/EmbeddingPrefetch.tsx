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
    // 给端到端测试一个「React 已经挂载、事件监听器已经生效」的可观察信号。
    // 只看 DOM 不够：SSR 出来的上传按钮在 hydration 前就存在，此时 setInputFiles
    // 触发的 change 事件没有监听器，文件不会进入解析 —— 表现为随机「数据预览不出现」。
    document.documentElement.dataset.appHydrated = 'true';

    // 延迟 3 秒：让首屏的解析与渲染先做完。模型约 25 MB，
    // 立刻开下会和首屏抢带宽 —— 而这个功能在用户点开分析之前都用不到。
    const timer = window.setTimeout(() => embedder.prefetch(), 3000);
    return () => window.clearTimeout(timer);
  }, []);

  return null;
}
