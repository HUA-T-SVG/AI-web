'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
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
      className="border-b border-neutral-200 bg-white md:hidden"
    >
      <div className="flex items-baseline gap-2 px-4 pt-3">
        <span className="text-sm font-semibold text-neutral-900">科研数据质量治理</span>
        <span className="text-xs text-neutral-500">Agent</span>
      </div>

      <ul className="flex gap-1 overflow-x-auto px-3 py-2">
        {NAV_GROUPS.flatMap((group) => group.items).map((item) => {
          const active = isActivePath(item.href, pathname);

          if (!item.available) {
            return (
              <li key={item.href} className="shrink-0">
                <span
                  aria-disabled="true"
                  title={item.note}
                  className="relative flex cursor-not-allowed items-center gap-1 rounded-md px-3 py-1.5 text-sm text-neutral-400"
                >
                  {item.label}
                  <span className="sr-only">（{item.note}）</span>
                  <span className="text-xs text-neutral-500">· 开发中</span>
                </span>
              </li>
            );
          }

          return (
            <li key={item.href} className="shrink-0">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={navLinkClassName(active, 'px-3 py-1.5')}
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
