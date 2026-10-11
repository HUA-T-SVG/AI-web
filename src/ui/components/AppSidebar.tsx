'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV_GROUPS, isActivePath } from '@/ui/lib/navigation';
import { cn } from '@/ui/lib/cn';

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="主导航"
      data-testid="sidebar"
      className="flex h-full w-60 shrink-0 flex-col overflow-y-auto border-r border-neutral-200 bg-white"
    >
      <div className="px-4 py-5">
        <p className="text-sm font-semibold text-neutral-900">科研数据质量治理</p>
        <p className="mt-0.5 text-xs text-neutral-500">Agent</p>
      </div>

      {NAV_GROUPS.map((group) => (
        <div key={group.title} className="border-t border-neutral-100 px-2 py-3">
          <p className="px-2 pb-1.5 text-xs font-medium text-neutral-400">{group.title}</p>

          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const Icon = item.icon;
              const active = isActivePath(item.href, pathname);

              if (!item.available) {
                return (
                  <li key={item.href}>
                    {/* 待实现项保留在 DOM 里并带说明：直接不渲染会让人以为
                        产品就这几项，只置灰不解释则让人反复点击 */}
                    <span
                      aria-disabled="true"
                      title={item.note}
                      className="flex cursor-not-allowed items-center gap-2.5 rounded-md px-2 py-2 text-sm text-neutral-300"
                    >
                      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span className="truncate">{item.label}</span>
                      <span className="ml-auto shrink-0 text-[10px] text-neutral-300">开发中</span>
                    </span>
                  </li>
                );
              }

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'relative flex items-center gap-2.5 rounded-md px-2 py-2 text-sm transition-colors',
                      active
                        ? 'bg-neutral-100 font-medium text-neutral-900'
                        : 'text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900',
                    )}
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
