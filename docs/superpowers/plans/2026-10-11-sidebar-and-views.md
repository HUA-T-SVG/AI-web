# 侧边栏与应用外壳实施计划（Plan 1c）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给应用加左侧导航栏，并把当前堆在一页的内容拆成「数据导入」与「质量检查」两个路由视图。

**Architecture:** 侧边栏放在根布局里，与主内容区并排；导航项由一份声明式配置驱动，未实现的项自动渲染为禁用态并标注「开发中」。数据仍集中在 Zustand store，客户端路由切换不会丢状态。样式沿用现有浅色体系，不引入新配色。

**Tech Stack:** Next.js 16 App Router · React 19 · TypeScript strict · Tailwind CSS 4 · lucide-react（图标）· Zustand

**Spec:** `docs/superpowers/specs/2026-10-09-data-quality-agent-design.md`
**前置计划:** `docs/superpowers/plans/2026-10-11-parsing-and-ui.md`（已完成，分支 `feat/parsing-ui`）

## Global Constraints

- Node ≥ 24.0.0；包管理器 **pnpm**，禁止 npm/yarn
- TypeScript `strict` + `noUncheckedIndexedAccess`
- 注释、文案、提交信息一律**中文**，界面文案不写机翻腔
- **每次提交前必须 `pnpm typecheck && pnpm test` 全绿**；含 `.tsx` 改动的任务还要跑 `pnpm build`
- 执行 pnpm 前置 `$env:TEMP='D:\tmp'; $env:TMP='D:\tmp'`
- 端到端测试前置 `$env:PLAYWRIGHT_BROWSERS_PATH='D:\ms-playwright'`
- **不引入组件库与图标以外的 UI 依赖**（shadcn、MUI 等）；`lucide-react` 已在依赖中
- **禁用项不得点了没反应**：要么禁用并给视觉反馈，要么给出说明文案

## Review Focus

1. **未导入数据时直接访问 `/check`**——必须给出明确的引导（去导入数据），不得渲染空画像、空表格或报错
2. **导航项的选中态与实际路由一致**——不能出现「在 /check 但侧边栏高亮 /import」这类错位
3. **窄屏下的侧边栏**——小于 768px 时必须收起为图标条或抽屉，不得把主内容挤到不可用
4. **键盘可达**——侧边栏可以用 Tab 遍历、Enter 激活，当前项对读屏软件可见（`aria-current`）
5. **切换视图不丢数据**——从 `/import` 切到 `/check` 再切回来，已解析的数据集仍在

---

## 文件结构

| 文件 | 职责 |
| --- | --- |
| `src/ui/components/AppSidebar.tsx` | 侧边栏导航 |
| `src/ui/lib/navigation.ts` | 导航项配置（单一真源） |
| `src/ui/components/AppShell.tsx` | 侧边栏 + 内容区的布局外壳 |
| `src/app/layout.tsx` | 接入 AppShell |
| `src/app/page.tsx` | 根路径 → 重定向到 `/import` |
| `src/app/import/page.tsx` | 上传 + 数据预览 |
| `src/app/check/page.tsx` | 列画像 + 问题清单（含未导入数据的引导） |

---

### Task 1: 导航项配置

**Files:**
- Create: `src/ui/lib/navigation.ts`
- Create: `src/ui/lib/navigation.test.ts`

**Interfaces:**
- Consumes: 无
- Produces: `NavItem` 类型、`NAV_GROUPS: NavGroup[]`、`isActivePath(itemHref: string, pathname: string): boolean`

- [ ] **Step 1: 写失败测试**

`src/ui/lib/navigation.test.ts`：
```ts
import { describe, it, expect } from 'vitest';
import { NAV_GROUPS, isActivePath } from './navigation';

describe('导航配置', () => {
  it('每项都有 href、标签与图标', () => {
    for (const group of NAV_GROUPS) {
      for (const item of group.items) {
        expect(item.href.startsWith('/')).toBe(true);
        expect(item.label.length).toBeGreaterThan(0);
        expect(item.icon).toBeDefined();
      }
    }
  });

  it('已实现的项才有 available: true', () => {
    const available = NAV_GROUPS.flatMap((g) => g.items).filter((i) => i.available !== false);
    expect(available.map((i) => i.href).sort()).toEqual(['/check', '/import']);
  });

  it('未实现的项必须写明原因，不能只置灰', () => {
    const pending = NAV_GROUPS.flatMap((g) => g.items).filter((i) => i.available === false);
    expect(pending.length).toBeGreaterThan(0);
    for (const item of pending) expect(item.note?.length).toBeGreaterThan(0);
  });
});

describe('isActivePath', () => {
  it('完全相同算激活', () => {
    expect(isActivePath('/import', '/import')).toBe(true);
  });

  it('子路径也算激活，父项要能高亮', () => {
    expect(isActivePath('/check', '/check/detail')).toBe(true);
  });

  it('前缀相同但不是同一段的不算激活', () => {
    // /import-extra 不该让 /import 高亮
    expect(isActivePath('/import', '/import-extra')).toBe(false);
  });

  it('根路径只在完全相等时激活', () => {
    expect(isActivePath('/', '/import')).toBe(false);
    expect(isActivePath('/', '/')).toBe(true);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```powershell
pnpm test src/ui/lib/navigation.test.ts
```

Expected：FAIL，模块不存在。

- [ ] **Step 3: 实现 `src/ui/lib/navigation.ts`**

```ts
import { BookOpen, FileOutput, FolderInput, ScanSearch, Sparkles, type LucideIcon } from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** false 表示尚未实现，渲染为禁用态 */
  available?: boolean;
  /** 未实现时的说明，必须写 —— 只置灰不解释最让人困惑 */
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
      { href: '/analysis', label: 'AI 分析', icon: Sparkles, note: 'Agent 工作流开发中' },
      { href: '/rules', label: '领域规则库', icon: BookOpen, note: '规则库与检索开发中' },
    ],
  },
  {
    title: '交付',
    items: [
      { href: '/export', label: '报告与导出', icon: FileOutput, note: '脚本生成与留痕开发中' },
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
```

- [ ] **Step 4: 运行测试确认通过**

```powershell
pnpm test src/ui/lib/navigation.test.ts
pnpm typecheck
```

Expected：PASS，8 个测试通过。

- [ ] **Step 5: 提交**

```bash
git add src/ui/lib/navigation.ts src/ui/lib/navigation.test.ts
git commit -m "feat(ui): 定义导航项配置与激活态判定

未实现的项带 note 说明，避免只置灰不解释"
```

---

### Task 2: 侧边栏组件

**Files:**
- Create: `src/ui/components/AppSidebar.tsx`
- Modify: `src/app/globals.css`（仅在需要时加滚动条样式，能不加就不加）

**Interfaces:**
- Consumes: `NAV_GROUPS`、`isActivePath`（Task 1）；`cn`（已有）
- Produces: `<AppSidebar />`（无 props，自己读 `usePathname()`）

- [ ] **Step 1: 实现 `src/ui/components/AppSidebar.tsx`**

```tsx
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
              const disabled = item.available === false;

              if (disabled) {
                return (
                  <li key={item.href}>
                    {/* 禁用项保留在 DOM 里并带说明：直接不渲染会让用户
                        以为产品就这几项，只置灰不解释则让人反复点击 */}
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
```

- [ ] **Step 2: 在浏览器里单独确认渲染**

先把 `AppSidebar` 临时挂到 `src/app/layout.tsx` 的 body 里（Task 3 会正式接好），跑 `pnpm dev` 后用 Playwright 打开 `http://localhost:3000`，确认：

- 三个分组标题都在
- 「数据导入」「质量检查」可点击
- 「AI 分析」「领域规则库」「报告与导出」是灰色且带「开发中」
- 控制台无错误

- [ ] **Step 3: 提交**

```powershell
pnpm typecheck
pnpm build
git add src/ui/components/AppSidebar.tsx
git commit -m "feat(ui): 实现侧边栏导航

- 分组、图标、左侧细条选中态，沿用浅色体系
- 未实现的项禁用并标注开发中，带 title 说明"
```

---

### Task 3: 应用外壳与响应式

**Files:**
- Create: `src/ui/components/AppShell.tsx`
- Modify: `src/app/layout.tsx`

**Interfaces:**
- Consumes: `<AppSidebar />`（Task 2）
- Produces: `<AppShell>{children}</AppShell>`

- [ ] **Step 1: 实现 `src/ui/components/AppShell.tsx`**

```tsx
import type { ReactNode } from 'react';
import { AppSidebar } from '@/ui/components/AppSidebar';

/**
 * 应用外壳：左侧导航 + 右侧内容区。
 *
 * 窄屏下侧边栏收成顶部的一条横向导航 —— 这个产品在手机上主要是
 * 看结果，不需要完整的侧边导航占掉半屏宽度。
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="hidden border-b border-neutral-200 bg-white md:block md:border-b-0">
        <div className="md:sticky md:top-0 md:h-screen">
          <AppSidebar />
        </div>
      </aside>

      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
```

- [ ] **Step 2: 接入根布局**

`src/app/layout.tsx`：
```tsx
import type { Metadata } from 'next';
import { AppShell } from '@/ui/components/AppShell';
import './globals.css';

export const metadata: Metadata = {
  title: '科研数据质量治理 Agent',
  description: '把数据清洗变成一份可复现、可追溯的处理记录',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-neutral-50 text-neutral-900 antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
```

- [ ] **Step 3: 浏览器验证响应式**

用 Playwright 分别在 1440px、1024px、768px、390px 四个宽度截图，确认：

- ≥ 768px：侧边栏可见，内容区不被挤到不可用
- < 768px：侧边栏不显示（顶部导航在 Task 6 补，此处先确认不塌陷）

- [ ] **Step 4: 提交**

```powershell
pnpm typecheck
pnpm build
git add src/ui/components/AppShell.tsx src/app/layout.tsx
git commit -m "feat(ui): 接入应用外壳，窄屏隐藏侧边栏"
```

---

### Task 4: 拆分「数据导入」视图

**Files:**
- Create: `src/app/import/page.tsx`
- Create: `src/app/page.tsx`（改为重定向）

**Interfaces:**
- Consumes: `useDatasetStore`、`FileDropzone`、`DataTable`
- Produces: `/import` 路由

- [ ] **Step 1: 实现 `src/app/import/page.tsx`**

把现有 `src/app/page.tsx` 里的「上传区 + 警告 + 数据预览」整块搬过来，去掉 `max-w-5xl mx-auto` 的外层容器（外壳已经提供了布局），改为：

```tsx
'use client';

import { useDatasetStore } from '@/ui/stores/datasetStore';
import { FileDropzone } from '@/ui/components/FileDropzone';
import { DataTable } from '@/ui/components/DataTable';
import { Card, CardBody, CardHeader, CardTitle } from '@/ui/components/base/Card';
import { Spinner } from '@/ui/components/base/Spinner';

export default function ImportPage() {
  const status = useDatasetStore((state) => state.status);
  const error = useDatasetStore((state) => state.error);
  const parseResult = useDatasetStore((state) => state.parseResult);
  const loadFile = useDatasetStore((state) => state.loadFile);

  return (
    <div className="px-6 py-8 lg:px-10">
      <h1 className="text-lg font-semibold text-neutral-900">数据导入</h1>
      <p className="mt-1 text-sm text-neutral-500">
        文件在浏览器内解析，不会上传到任何服务器
      </p>

      <div className="mt-6">
        <FileDropzone onFile={(file) => void loadFile(file)} disabled={status === 'parsing'} />
      </div>

      {status === 'parsing' ? (
        <div className="mt-6 flex items-center gap-2 text-sm text-neutral-600">
          <Spinner />
          正在解析…
        </div>
      ) : null}

      {status === 'error' && error ? (
        <Card className="mt-6 border-red-200">
          <CardHeader className="border-red-100">
            <CardTitle className="text-red-800">没法读取这个文件</CardTitle>
          </CardHeader>
          <CardBody className="text-sm text-red-700">{error}</CardBody>
        </Card>
      ) : null}

      {status === 'ready' && parseResult ? (
        <section className="mt-8">
          {parseResult.meta.warnings.map((warning) => (
            <p key={warning} className="mb-3 rounded bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {warning}
            </p>
          ))}

          <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="text-sm font-semibold text-neutral-900">数据预览</h2>
            <span className="text-xs text-neutral-500">
              {parseResult.meta.fileName}
              {parseResult.meta.sheetName ? ` · 工作表「${parseResult.meta.sheetName}」` : ''}
              {parseResult.meta.encoding ? ` · 编码 ${parseResult.meta.encoding}` : ''}
            </span>
          </div>

          <DataTable dataset={parseResult.dataset} />

          <p className="mt-3 text-xs text-neutral-500">
            去 <a className="underline" href="/check">质量检查</a> 看这份数据的问题。
          </p>
        </section>
      ) : null}
    </div>
  );
}
```

> 说明：这里顺手补上了设计文档要求但此前没实现的「显示文件名/工作表名/编码」，它是 Plan 1b 审查记下的 deferred minor。

- [ ] **Step 2: 根路径改为重定向**

`src/app/page.tsx`：
```tsx
import { redirect } from 'next/navigation';

/** 根路径没有独立内容，直接进入数据导入 */
export default function HomePage() {
  redirect('/import');
}
```

- [ ] **Step 3: 浏览器验证**

上传 `tests/e2e/fixtures/messy-survey.csv`，确认 `/import` 渲染正常、文件名与编码可见、无控制台错误。

- [ ] **Step 4: 提交**

```powershell
pnpm typecheck
pnpm test
pnpm build
git add src/app/import src/app/page.tsx
git commit -m "feat(ui): 拆出数据导入视图，根路径重定向

顺带补上设计文档要求但此前缺失的文件名/工作表名/编码展示"
```

---

### Task 5: 拆分「质量检查」视图

**Files:**
- Create: `src/app/check/page.tsx`

**Interfaces:**
- Consumes: `useDatasetStore`、`ColumnProfilePanel`、`IssueList`、`EmptyState`
- Produces: `/check` 路由

- [ ] **Step 1: 实现 `src/app/check/page.tsx`，含未导入数据的引导**

```tsx
'use client';

import Link from 'next/link';
import { useDatasetStore } from '@/ui/stores/datasetStore';
import { ColumnProfilePanel } from '@/ui/components/ColumnProfilePanel';
import { IssueList } from '@/ui/components/IssueList';
import { Button } from '@/ui/components/base/Button';
import { Card, CardBody, CardHeader, CardTitle } from '@/ui/components/base/Card';
import { EmptyState } from '@/ui/components/base/EmptyState';

export default function CheckPage() {
  const status = useDatasetStore((state) => state.status);
  const parseResult = useDatasetStore((state) => state.parseResult);
  const profile = useDatasetStore((state) => state.profile);
  const issues = useDatasetStore((state) => state.issues);

  // 直接访问 /check 时 store 是空的，必须明确引导去导入，
  // 而不是渲染一屏空表格让用户以为坏了
  if (status !== 'ready' || !parseResult || !profile) {
    return (
      <div className="px-6 py-8 lg:px-10">
        <h1 className="text-lg font-semibold text-neutral-900">质量检查</h1>
        <Card className="mt-6">
          <CardBody>
            <EmptyState
              title="还没有导入数据"
              description="质量检查会读取已导入的数据集。先到「数据导入」上传一份 CSV 或 Excel。"
              action={
                <Link href="/import" className="mt-3">
                  <Button size="sm">去导入数据</Button>
                </Link>
              }
            />
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div className="px-6 py-8 lg:px-10">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-lg font-semibold text-neutral-900">质量检查</h1>
        <span className="text-xs text-neutral-500">{parseResult.meta.fileName}</span>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <h2 className="mb-3 text-sm font-semibold text-neutral-900">数据概况</h2>
          <ColumnProfilePanel profile={profile} />
        </div>
        <div className="min-w-0">
          {/* 这一层不再写标题：IssueList 自带「发现的问题」，两个标题叠在一起很怪 */}
          <IssueList issues={issues} />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 浏览器验证两条路径**

- 先访问 `/check`（未导入）→ 应看到引导与「去导入数据」按钮
- 点按钮 → 到 `/import` 上传 → 再回 `/check` → 应看到画像与问题清单

- [ ] **Step 3: 提交**

```powershell
pnpm typecheck
pnpm test
pnpm build
git add src/app/check
git commit -m "feat(ui): 拆出质量检查视图，未导入数据时给出引导"
```

---

### Task 6: 端到端测试与窄屏导航

**Files:**
- Modify: `tests/e2e/upload.spec.ts`（适配新路由）
- Modify: `src/ui/components/AppShell.tsx`（窄屏顶部导航）

**Interfaces:**
- Consumes: 全部前述
- Produces: 更新后的 `pnpm test:e2e`

- [ ] **Step 1: 更新既有端到端测试的路由**

原测试假定所有内容都在 `/`。改为：

```ts
import { test, expect } from '@playwright/test';

test.describe('导入与检查流程', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/import');
  });

  // ...原有断言基本不变，只是起点变成 /import
});
```

并把「展开问题条目」「重复行能被检出」这类断言改到 `/check` 上：

```ts
  test('从导入切到检查，数据不丢', async ({ page }) => {
    await page.goto('/import');
    await page.setInputFiles('input[type=file]', join(fixtures, 'messy-survey.csv'));
    await expect(page.getByText('共 7 行 × 5 列')).toBeVisible();

    await page.getByRole('link', { name: '质量检查' }).click();
    await expect(page.getByText('列画像')).toBeVisible();
    await expect(page.getByText('完全重复的记录')).toBeVisible();

    // 切回去数据仍在（store 在客户端路由间保持）
    await page.getByRole('link', { name: '数据导入' }).click();
    await expect(page.getByText('共 7 行 × 5 列')).toBeVisible();
  });
```

- [ ] **Step 2: 补三条导航相关的测试**

```ts
  test('直接访问质量检查时给出导入引导', async ({ page }) => {
    await page.goto('/check');
    await expect(page.getByText('还没有导入数据')).toBeVisible();
    await page.getByRole('link', { name: '去导入数据' }).click();
    await expect(page).toHaveURL(/\/import$/);
  });

  test('当前导航项被标记为 aria-current', async ({ page }) => {
    await page.goto('/check');
    await expect(page.getByRole('link', { name: '质量检查' })).toHaveAttribute('aria-current', 'page');
  });

  test('未实现的导航项是禁用态且带说明', async ({ page }) => {
    await page.goto('/import');
    const pending = page.locator('[aria-disabled="true"]').first();
    await expect(pending).toBeVisible();
    await expect(pending).toContainText('开发中');
  });
```

- [ ] **Step 3: 窄屏顶部导航**

在 `AppShell.tsx` 里，`< md` 时渲染一条横向的导航条（同样读 `NAV_GROUPS`，只显示 available 的项）：

```tsx
{/* 窄屏：横向导航条。这个产品在手机上主要是看结果，
    不需要完整侧边导航占掉半屏 */}
<nav aria-label="主导航" className="flex gap-1 overflow-x-auto border-b border-neutral-200 bg-white px-3 py-2 md:hidden">
  {NAV_GROUPS.flatMap((group) => group.items)
    .filter((item) => item.available !== false)
    .map((item) => (
      <Link
        key={item.href}
        href={item.href}
        className="shrink-0 rounded-md px-3 py-1.5 text-sm text-neutral-600"
      >
        {item.label}
      </Link>
    ))}
</nav>
```

- [ ] **Step 4: 运行全部测试**

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH='D:\ms-playwright'
pnpm test:e2e
```

Expected：全部通过。同时用 Playwright 在 390px 宽度截图，确认顶部导航条出现且不溢出。

- [ ] **Step 5: 提交**

```bash
git add tests/e2e src/ui/components/AppShell.tsx
git commit -m "test(e2e): 适配新路由并覆盖导航、引导与状态保持"
```

---

## 完成标准

| 项 | 验证方式 |
| --- | --- |
| 类型无错误 | `pnpm typecheck` 无输出 |
| 单元测试全绿 | `pnpm test` 全部通过 |
| 端到端全绿 | `pnpm test:e2e` 全部通过 |
| 生产构建成功 | `pnpm build` 退出码 0 |
| 导航选中态正确 | 端到端断言 `aria-current` |
| 未导入数据有引导 | 端到端断言 `/check` 的引导文案 |
| 切换视图不丢数据 | 端到端断言切回后仍显示行数 |
| 窄屏可用 | 390px 截图无横向溢出 |
| Review Focus 五条均有覆盖 | 见各任务与 Task 6 |

## 后续计划

| 计划 | 内容 |
| --- | --- |
| **Plan 2** | Agent 六阶段工作流、AI SDK 集成、Function Calling、流式对话 —— 对应侧边栏的「AI 分析」 |
| **Plan 3** | 端侧 embedding、RAG 领域规则库、清洗执行、脚本导出 —— 对应「领域规则库」与「报告与导出」 |
| **Plan 4** | 评测体系、质量报告看板 |
| **Plan 5** | MCP Server、多模态、正式部署 |
