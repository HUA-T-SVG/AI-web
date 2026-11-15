import { BookOpen, FileOutput, FolderInput, ScanSearch, Sparkles, type LucideIcon } from 'lucide-react';
import { cn } from '@/ui/lib/cn';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** 必须显式声明：true 表示可点击，false 表示尚未实现。不用「省略即为可用」的默认值 */
  available: boolean;
  /** available 为 false 时的说明，必须写 —— 只置灰不解释最让人困惑 */
  note?: string;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

/**
 * 导航项的单一真源。
 * 侧边栏与端到端测试都从这里读，避免两处各写一份而漂移。
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    title: '数据处理',
    items: [
      { href: '/import', label: '数据导入', icon: FolderInput, available: true },
      { href: '/check', label: '质量检查', icon: ScanSearch, available: true },
    ],
  },
  {
    title: '分析',
    items: [
      { href: '/analysis', label: 'AI 分析', icon: Sparkles, available: true },
      { href: '/rules', label: '领域规则库', icon: BookOpen, available: true },
    ],
  },
  {
    title: '交付',
    items: [
      { href: '/export', label: '报告与导出', icon: FileOutput, available: true },
    ],
  },
];

/**
 * 「下一步最可能去哪」的映射。
 *
 * 只用于**页面空闲后的预取**：首屏不预取（否则又会把所有路由的包一起拉下来，
 * 见交接 §8.36），等当前页真正可交互、且浏览器空闲时，再预热下一站。
 * 映射保持显式，避免用「导航顺序」去猜业务顺序。
 */
const NEXT_ROUTE_AFTER: Readonly<Record<string, string>> = {
  '/import': '/check',
  '/check': '/analysis',
  '/analysis': '/export',
  '/rules': '/check',
};

/** 当前路径的下一站；没有明确业务顺序的页面返回 null，不预取。 */
export function nextRouteAfter(pathname: string): string | null {
  if (!Object.hasOwn(NEXT_ROUTE_AFTER, pathname)) return null;
  return NEXT_ROUTE_AFTER[pathname] ?? null;
}

/**
 * 判断导航项是否处于激活态。
 *
 * 不能简单用 startsWith：`/import-extra` 会误命中 `/import`。
 * 要么完全相等，要么以 `href + '/'` 开头。
 */
export function isActivePath(itemHref: string, pathname: string): boolean {
  if (itemHref === '/') return pathname === '/';
  return pathname === itemHref || pathname.startsWith(`${itemHref}/`);
}

/**
 * 导航链接的共用样式。侧边栏与窄屏顶部条共用一份，
 * 否则两处的选中态与焦点样式会各写各的、慢慢漂移。
 *
 * 键盘焦点不在这里写：全局 `:focus-visible` 统一处理。
 */
export function navLinkClassName(active: boolean, className?: string): string {
  return cn(
    'relative flex items-center gap-2.5 rounded-lg text-sm transition-colors',
    active
      ? 'bg-brand-50 font-medium text-brand-800'
      : 'text-ink-muted hover:bg-canvas hover:text-ink',
    className,
  );
}
