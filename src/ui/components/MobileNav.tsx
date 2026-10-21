'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { NAV_GROUPS, isActivePath, navLinkClassName } from '@/ui/lib/navigation';

/**
 * 窄屏顶部导航条。
 *
 * 必须是客户端组件：选中态要看 usePathname，而外壳本身要留在服务端。
 * 待实现项同样列出来（置灰）—— 只显示可点的两项，会让手机上打开的人
 * 以为产品就只有两个功能。
 */
export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="顶部导航"
      data-testid="mobile-nav"
      className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur md:hidden"
    >
      <div className="flex items-center gap-2.5 px-4 pt-3">
        <span
          className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-700 text-white"
          aria-hidden="true"
        >
          <ShieldCheck className="h-4 w-4" />
        </span>
        <span className="text-sm font-semibold text-ink">科研数据质量治理</span>
        <span className="text-xs text-ink-muted">Agent</span>
      </div>

      <ul className="flex gap-0.5 overflow-x-auto px-2 py-2">
        {NAV_GROUPS.flatMap((group) => group.items).map((item) => {
          const active = isActivePath(item.href, pathname);

          if (!item.available) {
            return (
              <li key={item.href} className="shrink-0">
                <span
                  aria-disabled="true"
                  title={item.note}
                  className="relative flex cursor-not-allowed items-center gap-1 rounded-lg px-3 py-1.5 text-sm text-ink-muted/60"
                >
                  {item.label}
                  <span className="sr-only">（{item.note}）</span>
                  <span className="text-xs text-ink-muted">· 开发中</span>
                </span>
              </li>
            );
          }

          return (
            <li key={item.href} className="shrink-0">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={navLinkClassName(active, 'px-2.5 py-1.5 text-[13px]')}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
