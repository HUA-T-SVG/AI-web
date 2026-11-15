'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { nextRouteAfter } from '@/ui/lib/navigation';

/**
 * 客户端启动信号（原「空闲预取语义模型」组件，2026-11-11 改为只做启动标记）。
 *
 * 为什么拿掉语义模型预取：端到端实测发现，页面挂载 3 秒后加载 25 MB 语义模型会在
 * 主线程阻塞 2.5–4.6 秒；用户此时往往刚点「开始分析」，表现为整段卡顿
 * （`knowledge/reports/e2e-timing.md` 的归属实验：先停留 9 秒再开始，长任务为 0）。
 *
 * 2026-11-15 补的是另一种空闲预取：**只预取「下一步最可能去的那一页」**，而且等
 * 当前页可交互、浏览器空闲后才做。首屏不为它下载任何字节（交接 §8.36 的教训），
 * 首次点「质量检查」时又能直接命中已预热的 RSC。
 *
 * 仍然保留组件与 `data-app-hydrated` 标记：端到端测试靠它判断
 * 「React 已挂载、change 监听器已生效」，只看 SSR 的 DOM 会在 hydration 前误判。
 */
export function ClientBoot() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    document.documentElement.dataset.appHydrated = 'true';
  }, []);

  useEffect(() => {
    const target = nextRouteAfter(pathname);
    if (target === null) return;

    // 省流量/弱网下不预取：这一步是锦上添花，不能反过来花用户的流量。
    const connection = (navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    }).connection;
    if (connection?.saveData || ['slow-2g', '2g'].includes(connection?.effectiveType ?? '')) return;

    let cancelled = false;
    const warm = () => {
      if (!cancelled) router.prefetch(target);
    };
    const hasIdle = typeof window.requestIdleCallback === 'function';
    let idleHandle = 0;
    // 先等 2 秒让首屏传输/绘制基本结束，再等空闲窗口；否则在慢网下预取会和
    // 首屏 chunk 抢带宽，反而拖慢“进入网站”的体感。
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      idleHandle = hasIdle
        ? window.requestIdleCallback(warm, { timeout: 3000 })
        : window.setTimeout(warm, 0);
    }, 2000);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (hasIdle) window.cancelIdleCallback(idleHandle);
      else window.clearTimeout(idleHandle);
    };
  }, [pathname, router]);

  return null;
}
