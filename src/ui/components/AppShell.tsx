import type { ReactNode } from 'react';
import { AppSidebar } from '@/ui/components/AppSidebar';
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
      {/* 语义模型的空闲预取挂在外壳上，所以每个页面都能享受到已缓存的模型 */}
      <EmbeddingPrefetch />

      <aside className="hidden md:block">
        <div className="md:sticky md:top-0 md:h-screen">
          <AppSidebar />
        </div>
      </aside>

      <MobileNav />

      {/* 限一个宽松的内容上限：不加的话 2560px 超宽屏下表格会拉满整屏，行长得难以阅读 */}
      <main className="min-w-0 flex-1">
        {/* 「这是上次的数据」必须出现在每个页面：用户刷新后可能停在任意一页 */}
        <RestoreNotice />
        <div className="mx-auto max-w-[1600px]">{children}</div>
      </main>
    </div>
  );
}
