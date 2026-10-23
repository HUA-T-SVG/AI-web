'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { AppSidebar } from '@/ui/components/AppSidebar';
import { cn } from '@/ui/lib/cn';

/**
 * 768–1279px 的侧栏收起。
 *
 * 设计文档把宽度分成三档：≥1280 固定侧栏，768–1279 可收起，<768 顶部导航。
 * 这里只处理中间那档：收起后留一个固定展开按钮，而不是做抽屉 —— 抽屉要盖住
 * 核对工作区再点一次，不适合「边看数据边切导航」。
 */
export function SidebarFrame() {
  const [open, setOpen] = useState(true);

  return (
    <>
      <aside className={cn('hidden md:block', !open && 'md:hidden xl:block')}>
        <div className="relative md:sticky md:top-0 md:h-screen">
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="收起导航"
            title="收起导航"
            className="absolute right-2 top-4 z-10 hidden h-8 w-8 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-canvas hover:text-ink md:flex xl:hidden"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <AppSidebar />
        </div>
      </aside>

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="展开导航"
          title="展开导航"
          className="fixed left-2 top-3 z-40 hidden h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface/95 text-ink-muted shadow-sm backdrop-blur transition-colors hover:text-ink md:flex xl:hidden"
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      ) : null}
    </>
  );
}
