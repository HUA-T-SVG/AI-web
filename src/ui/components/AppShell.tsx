import type { ReactNode } from 'react';
import { AppSidebar } from '@/ui/components/AppSidebar';
import { DataContextBar } from '@/ui/components/DataContextBar';
import { EmbeddingPrefetch } from '@/ui/components/EmbeddingPrefetch';
import { MobileNav } from '@/ui/components/MobileNav';
import { RestoreNotice } from '@/ui/components/RestoreNotice';

/**
 * 应用外壳：宽屏是左侧导航 + 右侧内容，窄屏换成顶部横向导航。
 *
 * 窄屏不用抽屉：这个产品在手机上主要是看结果，抽出侧栏再点一次的成本
 * 高于一条横向导航条占掉的那点高度。
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      {/* 键盘用户第一下 Tab 就能跳过导航，直接进正文 */}
      <a
        href="#main-content"
        className="sr-only z-50 rounded-lg bg-brand-700 px-4 py-2 text-sm text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        跳到主要内容
      </a>

      {/* 语义模型的空闲预取挂在外壳上，所以每个页面都能享受到已缓存的模型 */}
      <EmbeddingPrefetch />

      <aside className="hidden md:block">
        <div className="md:sticky md:top-0 md:h-screen">
          <AppSidebar />
        </div>
      </aside>

      <MobileNav />

      <main id="main-content" className="min-w-0 flex-1">
        {/* 「这是上次的数据」必须出现在每个页面：用户刷新后可能停在任意一页 */}
        <RestoreNotice />
        {/* 当前文件 / 规模 / 数据版本，工作页统一可见 */}
        <DataContextBar />
        {children}
      </main>
    </div>
  );
}
