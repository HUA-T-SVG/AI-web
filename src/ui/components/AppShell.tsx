import type { ReactNode } from 'react';
import Link from 'next/link';
import { AppSidebar } from '@/ui/components/AppSidebar';
import { NAV_GROUPS } from '@/ui/lib/navigation';

/**
 * 应用外壳：宽屏是左侧导航 + 右侧内容，窄屏换成顶部横向导航。
 *
 * 窄屏不用抽屉：这个产品在手机上主要是看结果，抽出侧栏再点一次的成本
 * 高于一条横向导航条占掉的那点高度。
 */
export function AppShell({ children }: { children: ReactNode }) {
  const availableItems = NAV_GROUPS.flatMap((group) => group.items).filter(
    (item) => item.available,
  );

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="hidden md:block">
        <div className="md:sticky md:top-0 md:h-screen">
          <AppSidebar />
        </div>
      </aside>

      <nav
        aria-label="主导航"
        data-testid="mobile-nav"
        className="flex gap-1 overflow-x-auto border-b border-neutral-200 bg-white px-3 py-2 md:hidden"
      >
        {availableItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="shrink-0 rounded-md px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-50"
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
