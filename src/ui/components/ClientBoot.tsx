'use client';

import { useEffect } from 'react';

/**
 * 客户端启动信号（原「空闲预取语义模型」组件，2026-11-11 改为只做启动标记）。
 *
 * 为什么拿掉预取：端到端实测发现，页面挂载 3 秒后加载 25 MB 语义模型会在
 * 主线程阻塞 2.5–4.6 秒；用户此时往往刚点「开始分析」，表现为整段卡顿
 * （`knowledge/reports/e2e-timing.md` 的归属实验：先停留 9 秒再开始，长任务为 0）。
 * 而分析页用不到语义模型 —— 规则检索当前走稀疏路，语义归并只发生在导入/清洗流程，
 * 那里会在需要时按需加载，预取带来的收益抵不过卡顿。
 *
 * 仍然保留组件与 `data-app-hydrated` 标记：端到端测试靠它判断
 * 「React 已挂载、change 监听器已生效」，只看 SSR 的 DOM 会在 hydration 前误判。
 */
export function ClientBoot() {
  useEffect(() => {
    document.documentElement.dataset.appHydrated = 'true';
  }, []);

  return null;
}
