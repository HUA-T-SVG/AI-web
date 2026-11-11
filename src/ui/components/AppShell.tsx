import type { ReactNode } from 'react';
import { DataContextBar } from '@/ui/components/DataContextBar';
import { ClientBoot } from '@/ui/components/ClientBoot';
import { MobileNav } from '@/ui/components/MobileNav';
import { RestoreNotice } from '@/ui/components/RestoreNotice';
import { ScenarioHydration } from '@/ui/components/ScenarioHydration';
import { SidebarFrame } from '@/ui/components/SidebarFrame';

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

      {/* 客户端启动标记（hydrated 信号）。语义模型不再后台预取：实测预取会
          在主线程阻塞数秒、与「开始分析」撞车，改为在导入/清洗流程里按需加载 */}
      <ClientBoot />

      {/* 场景选择存在 sessionStorage；mount 后恢复一次，避免与预渲染 HTML 的 hydration 不一致 */}
      <ScenarioHydration />

      <SidebarFrame />

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
