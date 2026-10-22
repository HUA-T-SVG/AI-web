'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { NAV_GROUPS, isActivePath, navLinkClassName } from '@/ui/lib/navigation';

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="侧边导航"
      data-testid="sidebar"
      className="flex h-full w-[232px] shrink-0 flex-col overflow-y-auto border-r border-line bg-surface"
    >
      <div className="flex items-center gap-3 px-4 py-5">
        <span
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-700 text-white shadow-sm"
          aria-hidden="true"
        >
          <ShieldCheck className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">科研数据质量治理</p>
          <p className="mt-0.5 text-xs text-ink-muted">Agent</p>
        </div>
      </div>

      {NAV_GROUPS.map((group) => (
        <div key={group.title} className="border-t border-line px-2 py-3">
          {/* 用 ink-muted 而不是更浅的灰：这是要读的分组标题，浅灰在白底上不到 4.5:1 */}
          <p className="px-2 pb-1.5 text-xs font-medium text-ink-muted">{group.title}</p>

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
                      className="relative flex cursor-not-allowed items-center gap-2.5 rounded-lg px-2 py-2 text-sm text-ink-muted/60"
                    >
                      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span className="truncate">{item.label}</span>
                      <span className="sr-only">（{item.note}）</span>
                      <span className="ml-auto shrink-0 text-xs text-ink-muted">开发中</span>
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
                    {/* 选中态用左侧细条 + 浅青底：用户要长时间核对数据，界面得克制 */}
                    {active ? (
                      <span
                        className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-brand-600"
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

      <div className="mt-auto border-t border-line px-4 py-4">
        <p className="text-xs leading-relaxed text-ink-muted">
          数据只在你的浏览器里处理。
          <br />
          只有统计摘要会发给大模型。
        </p>
      </div>
    </nav>
  );
}
