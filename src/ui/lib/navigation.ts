import { BookOpen, FileOutput, FolderInput, ScanSearch, Sparkles, type LucideIcon } from 'lucide-react';

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
      { href: '/analysis', label: 'AI 分析', icon: Sparkles, available: false, note: 'Agent 工作流开发中' },
      { href: '/rules', label: '领域规则库', icon: BookOpen, available: false, note: '规则库与检索开发中' },
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
