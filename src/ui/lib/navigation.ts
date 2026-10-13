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
      {
        href: '/export',
        label: '报告与导出',
        icon: FileOutput,
        available: false,
        note: '脚本生成与留痕开发中',
      },
    ],
  },
];

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
 * 焦点环复用按钮的写法：Tailwind 的 preflight 不会移除默认 outline，
 * 但默认 outline 在各浏览器里粗细不一，显式给一个更稳。
 */
export function navLinkClassName(active: boolean, className?: string): string {
  return cn(
    'relative flex items-center gap-2.5 rounded-md text-sm transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:ring-offset-2',
    active
      ? 'bg-neutral-100 font-medium text-neutral-900'
      : 'text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900',
    className,
  );
}
