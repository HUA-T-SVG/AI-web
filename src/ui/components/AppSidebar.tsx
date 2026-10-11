'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV_GROUPS, isActivePath, navLinkClassName } from '@/ui/lib/navigation';

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="侧边导航"
      data-testid="sidebar"
      className="flex h-full w-60 shrink-0 flex-col overflow-y-auto border-r border-neutral-200 bg-white"
    >
      <div className="px-4 py-5">
        <p className="text-sm font-semibold text-neutral-900">科研数据质量治理</p>
        <p className="mt-0.5 text-xs text-neutral-500">Agent</p>
      </div>

      {NAV_GROUPS.map((group) => (
        <div key={group.title} className="border-t border-neutral-100 px-2 py-3">
          {/* 用 500 而非 400：这是要读的分组标题，neutral-400 在白底上只有 2.58:1，
              不到 WCAG AA 要求的 4.5:1。400 只留给图标一类的装饰 */}
          <p className="px-2 pb-1.5 text-xs font-medium text-neutral-500">{group.title}</p>

          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const Icon = item.icon;
              const active = isActivePath(item.href, pathname);

              if (!item.available) {
                return (
                  <li key={item.href}>
                    {/* 待实现项保留在 DOM 里并带说明：直接不渲染会让人以为
                        产品就这几项。note 用 sr-only 补进内容 —— title 只有鼠标够得着，
                        键盘与读屏用户拿不到 */}
                    <span
                      aria-disabled="true"
                      title={item.note}
                      className="relative flex cursor-not-allowed items-center gap-2.5 rounded-md px-2 py-2 text-sm text-neutral-400"
                    >
                      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span className="truncate">{item.label}</span>
                      <span className="sr-only">（{item.note}）</span>
                      <span className="ml-auto shrink-0 text-xs text-neutral-500">开发中</span>
                    </span>
                  </li>
                );
              }

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={navLinkClassName(active, 'px-2 py-2')}
                  >
                    {/* 选中态用左侧细条而不是高饱和底色：用户要长时间核对数据，界面得克制 */}
                    {active ? (
                      <span
                        className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-neutral-900"
                        aria-hidden="true"
                      />
                    ) : null}
                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="truncate">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
