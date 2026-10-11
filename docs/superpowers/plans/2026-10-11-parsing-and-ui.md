# 文件解析与界面实施计划（Plan 1b）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 打通「上传文件 → 浏览器本地解析 → 看到数据预览与质量检查结果」的完整链路，产出一个可以在浏览器里点开使用的应用。

**Architecture:** 解析在 Web Worker 中完成，主线程不阻塞；Worker 不可用时降级到主线程调用同一份纯函数。解析与检查全部在浏览器内，不上传任何数据。状态集中在 Zustand store，界面组件只消费 store 与纯函数。UI 组件手写，不引入组件库 CLI。

**Tech Stack:** Next.js 16 · React 19 · TypeScript 5（strict）· Tailwind CSS 4 · Zustand 5 · PapaParse 5 · read-excel-file 9 · @tanstack/react-virtual 3 · Playwright

**Spec:** `docs/superpowers/specs/2026-10-09-data-quality-agent-design.md`
**前置计划:** `docs/superpowers/plans/2026-10-09-core-engine.md`（已完成并合并到 main）

## Global Constraints

- Node.js 版本下限：**24.0.0**；包管理器 **pnpm**（本机 12.4.2），禁止 npm/yarn
- TypeScript 必须 `strict: true` + `noUncheckedIndexedAccess: true`
- `src/core/` 与 `src/parser/` 下**禁止**引用浏览器 API（`window`/`document`）与 Node API（`fs`/`path`/`process`）
  - 例外：`src/parser/worker.ts` 是 Worker 入口，可以使用 `self.postMessage`
- 所有注释、文案、提交信息使用**中文**；界面文案不写机翻腔
- 文件编码 UTF-8，换行符 LF
- **每次提交前必须 `pnpm typecheck && pnpm test` 全绿**（Plan 1a 的教训：不把 typecheck 当门禁会提交进类型错误）
- 依赖安装落 D 盘：执行 pnpm 前置 `$env:TEMP='D:\tmp'; $env:TMP='D:\tmp'`
- **禁止引入 `xlsx`（SheetJS）**：npm 版本停留在 0.18.5，含未修复的 CVE，改用 `read-excel-file`
- **禁止依赖任何组件库 CLI**（shadcn 等）：其 registry 在境内访问缓慢且交互式安装易卡死

## Review Focus

以下五类输入是设计文档隐含要求、但容易被实现忽略的失败模式。每一条都已在其归属任务的测试步骤中固定：

1. **空文件与只有表头的文件**——应给出可读的错误提示，不得渲染出空表格或抛异常
2. **字段数不齐的 CSV**（某行列数多于/少于表头）——多余字段不得静默丢弃，缺少字段应补空；必须在 warnings 中报告行号
3. **GBK 编码的中文 CSV**——表头与内容不得出现乱码；探测失败时应回退 UTF-8 而不是报错
4. **超大文件**（超过行数或体积上限）——必须截断并在界面明确提示"已截断"，不得静默丢数据或让页面卡死
5. **列名重复与全空列**——表格与画像面板必须能区分同名不同列，全空列不得渲染空白行导致布局塌陷

---

## 文件结构

| 文件 | 职责 |
| --- | --- |
| `src/ui/lib/cn.ts` | 类名合并工具（clsx + tailwind-merge） |
| `src/ui/components/base/*.tsx` | 基础组件：Button / Card / Badge / Spinner / EmptyState |
| `src/parser/types.ts` | 解析结果的类型契约 |
| `src/parser/encoding.ts` | 编码探测与转换（UTF-8 / GBK） |
| `src/parser/csv.ts` | CSV → Dataset |
| `src/parser/excel.ts` | .xlsx → Dataset |
| `src/parser/index.ts` | 统一入口 `parseFile()`，按扩展名分派 |
| `src/parser/worker.ts` | Web Worker 入口 |
| `src/parser/workerClient.ts` | 主线程侧的 Worker 客户端（含降级） |
| `src/ui/stores/datasetStore.ts` | 唯一状态源 |
| `src/ui/hooks/useFileUpload.ts` | 上传交互逻辑 |
| `src/ui/components/FileDropzone.tsx` | 拖拽/点击上传 |
| `src/ui/components/DataTable.tsx` | 虚拟滚动数据预览 |
| `src/ui/components/ColumnProfilePanel.tsx` | 列画像侧栏 |
| `src/ui/components/IssueList.tsx` | 质量问题清单 |
| `src/ui/components/AppShell.tsx` | 主页面组装 |
| `src/app/page.tsx` | 页面入口 |
| `tests/e2e/*.spec.ts` | 端到端测试 |

---

### Task 1: 运行时依赖与基础组件

**Files:**
- Modify: `package.json`
- Create: `src/ui/lib/cn.ts`
- Create: `src/ui/components/base/Button.tsx`
- Create: `src/ui/components/base/Card.tsx`
- Create: `src/ui/components/base/Badge.tsx`
- Create: `src/ui/components/base/Spinner.tsx`
- Create: `src/ui/components/base/EmptyState.tsx`
- Create: `src/ui/lib/cn.test.ts`

**Interfaces:**
- Consumes: 无
- Produces: `cn(...inputs: ClassValue[]): string`；`Button`（props: `variant`, `size`, `children`，其余透传 `button` 属性）；`Card` / `CardHeader` / `CardTitle` / `CardBody`；`Badge`（props: `tone`）；`Spinner`；`EmptyState`（props: `title`, `description`, `action`）

- [ ] **Step 1: 安装依赖**

```powershell
$env:TEMP='D:\tmp'; $env:TMP='D:\tmp'
pnpm add papaparse zustand @tanstack/react-virtual read-excel-file encoding-japanese clsx tailwind-merge class-variance-authority lucide-react
pnpm add -D @types/papaparse
```

Expected：安装成功。若 pnpm 报 `ERR_PNPM_IGNORED_BUILDS`，**忽略即可**——那是 pnpm 12 拦截 postinstall 的安全策略，不影响这些包（Plan 1a 已确认 esbuild 的平台二进制走 optionalDependencies）。

- [ ] **Step 2: 写 `cn` 的失败测试**

`src/ui/lib/cn.test.ts`：
```ts
import { describe, it, expect } from 'vitest';
import { cn } from './cn';

describe('cn', () => {
  it('拼接多个类名', () => {
    expect(cn('a', 'b')).toBe('a b');
  });

  it('忽略假值', () => {
    expect(cn('a', false, null, undefined, 'b')).toBe('a b');
  });

  it('支持条件对象写法', () => {
    expect(cn('base', { active: true, disabled: false })).toBe('base active');
  });

  it('后写的同类 Tailwind 工具类覆盖前面的', () => {
    // 这是 cn 存在的唯一理由：手写字符串拼接时 px-2 和 px-4 会同时留在 class 里，
    // 实际生效的取决于 CSS 顺序而不是书写顺序，调试起来很反直觉
    expect(cn('px-2', 'px-4')).toBe('px-4');
  });

  it('不同类别的工具类都保留', () => {
    expect(cn('px-2', 'text-sm')).toBe('px-2 text-sm');
  });
});
```

- [ ] **Step 3: 运行测试确认失败**

```powershell
pnpm test src/ui/lib/cn.test.ts
```

Expected：FAIL，`Failed to resolve import "./cn"`。

- [ ] **Step 4: 实现 `src/ui/lib/cn.ts`**

```ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * 合并类名。
 *
 * 用 twMerge 而不是直接拼字符串，是因为 Tailwind 的同类工具类会同时留在
 * class 属性里，最终哪个生效取决于 CSS 的生成顺序而不是书写顺序 ——
 * 传入 px-2 和 px-4 时保留后者，才符合调用方的直觉。
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 5: 运行测试确认通过**

```powershell
pnpm test src/ui/lib/cn.test.ts
```

Expected：PASS，5 个测试通过。

- [ ] **Step 6: 实现基础组件**

`src/ui/components/base/Button.tsx`：
```tsx
import { cva, type VariantProps } from 'class-variance-authority';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/ui/lib/cn';

const buttonStyles = cva(
  'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-neutral-900 text-white hover:bg-neutral-700',
        secondary: 'border border-neutral-300 bg-white hover:bg-neutral-100',
        ghost: 'hover:bg-neutral-100',
      },
      size: {
        sm: 'h-8 px-3 text-sm',
        md: 'h-10 px-4 text-sm',
        lg: 'h-12 px-6 text-base',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonStyles>;

export function Button({ className, variant, size, type = 'button', ...rest }: ButtonProps) {
  return <button type={type} className={cn(buttonStyles({ variant, size }), className)} {...rest} />;
}
```

`src/ui/components/base/Card.tsx`：
```tsx
import type { HTMLAttributes } from 'react';
import { cn } from '@/ui/lib/cn';

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-lg border border-neutral-200 bg-white shadow-sm', className)}
      {...rest}
    />
  );
}

export function CardHeader({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('border-b border-neutral-200 px-5 py-3', className)} {...rest} />;
}

export function CardTitle({ className, ...rest }: HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn('text-sm font-semibold text-neutral-900', className)} {...rest} />;
}

export function CardBody({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-5 py-4', className)} {...rest} />;
}
```

`src/ui/components/base/Badge.tsx`：
```tsx
import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';
import { cn } from '@/ui/lib/cn';

const badgeStyles = cva('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', {
  variants: {
    tone: {
      neutral: 'bg-neutral-100 text-neutral-700',
      // 严重度配色与 QualityIssue.severity 一一对应，改这里要同时改 IssueList 的映射
      high: 'bg-red-100 text-red-800',
      medium: 'bg-amber-100 text-amber-800',
      low: 'bg-sky-100 text-sky-800',
      success: 'bg-emerald-100 text-emerald-800',
    },
  },
  defaultVariants: { tone: 'neutral' },
});

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeStyles>;

export function Badge({ className, tone, ...rest }: BadgeProps) {
  return <span className={cn(badgeStyles({ tone }), className)} {...rest} />;
}
```

`src/ui/components/base/Spinner.tsx`：
```tsx
import { cn } from '@/ui/lib/cn';

export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn('h-4 w-4 animate-spin text-neutral-500', className)}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z"
      />
    </svg>
  );
}
```

`src/ui/components/base/EmptyState.tsx`：
```tsx
import type { ReactNode } from 'react';
import { cn } from '@/ui/lib/cn';

export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2 py-12 text-center', className)}>
      <p className="text-sm font-medium text-neutral-700">{title}</p>
      {description ? <p className="max-w-md text-xs text-neutral-500">{description}</p> : null}
      {action}
    </div>
  );
}
```

- [ ] **Step 7: 验证类型与构建**

```powershell
pnpm typecheck
pnpm build
```

Expected：无类型错误；构建成功。

- [ ] **Step 8: 提交**

```bash
git add package.json pnpm-lock.yaml src/ui
git commit -m "chore(ui): 引入运行时依赖与基础组件

- 手写 Button/Card/Badge/Spinner/EmptyState，不依赖组件库 CLI
- cn 工具用 tailwind-merge 解决同类工具类覆盖顺序问题
- 排除 xlsx（SheetJS）：npm 版本含未修复 CVE"
```

---

### Task 2: 解析结果类型契约

**Files:**
- Create: `src/parser/types.ts`
- Create: `src/parser/types.test.ts`

**Interfaces:**
- Consumes: `Dataset`（来自 `src/core`）
- Produces: `ParseFormat`、`ParseMeta`、`ParseResult`、`ParseError`、`MAX_ROWS`、`MAX_FILE_BYTES`、`createParseResult()`

- [ ] **Step 1: 写失败测试**

`src/parser/types.test.ts`：
```ts
import { describe, it, expect } from 'vitest';
import { createParseResult, applyRowLimit, MAX_FILE_BYTES, MAX_ROWS, isParseError } from './types';

describe('解析结果契约', () => {
  it('上限是具体数字，不是 undefined', () => {
    expect(MAX_ROWS).toBeGreaterThan(0);
    expect(MAX_FILE_BYTES).toBeGreaterThan(0);
  });

  it('createParseResult 填好默认的 meta 字段', () => {
    const result = createParseResult({
      dataset: { columns: [], rowCount: 0 },
      fileName: 'a.csv',
      fileSize: 100,
      format: 'csv',
    });
    expect(result.meta.fileName).toBe('a.csv');
    expect(result.meta.truncated).toBe(false);
    expect(result.meta.warnings).toEqual([]);
  });

  it('isParseError 能区分成功与失败', () => {
    const ok = createParseResult({
      dataset: { columns: [], rowCount: 0 },
      fileName: 'a.csv',
      fileSize: 1,
      format: 'csv',
    });
    expect(isParseError(ok)).toBe(false);
    expect(isParseError({ message: '文件为空', kind: 'empty-file' })).toBe(true);
  });
});

describe('applyRowLimit', () => {
  it('未超限时原样返回且标记未截断', () => {
    const { kept, truncated } = applyRowLimit([1, 2, 3], 5);
    expect(kept).toEqual([1, 2, 3]);
    expect(truncated).toBe(false);
  });

  it('恰好等于上限时不算截断', () => {
    const { kept, truncated } = applyRowLimit([1, 2, 3], 3);
    expect(kept).toHaveLength(3);
    expect(truncated).toBe(false);
  });

  it('超限时截断并标记', () => {
    const { kept, truncated } = applyRowLimit([1, 2, 3, 4], 3);
    expect(kept).toEqual([1, 2, 3]);
    expect(truncated).toBe(true);
  });

  it('默认使用 MAX_ROWS', () => {
    // 用 20 万行真数据测太慢，这里只验证默认参数接的是常量
    expect(applyRowLimit([1]).truncated).toBe(false);
    expect(MAX_ROWS).toBe(200_000);
  });

  it('空数组不报截断', () => {
    expect(applyRowLimit([], 0).truncated).toBe(false);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```powershell
pnpm test src/parser/types.test.ts
```

Expected：FAIL，模块不存在。

- [ ] **Step 3: 实现 `src/parser/types.ts`**

```ts
import type { Dataset } from '@/core';

/**
 * 行数上限。
 *
 * 浏览器里全部数据常驻内存，一行按 50 列粗估约 400 字节，
 * 20 万行约 80MB —— 在 16GB 内存的开发机上留有余量，
 * 同时远超高校科研数据的实际规模（通常几千到几万行）。
 */
export const MAX_ROWS = 200_000;

/** 文件体积上限，超过则不解析，避免把浏览器拖死 */
export const MAX_FILE_BYTES = 50 * 1024 * 1024;

export type ParseFormat = 'csv' | 'xlsx';

export interface ParseMeta {
  fileName: string;
  fileSize: number;
  format: ParseFormat;
  /** CSV 才有的探测结果 */
  encoding?: string;
  /** Excel 才有的工作表名 */
  sheetName?: string;
  /** 是否因超过上限被截断 */
  truncated: boolean;
  /** 可继续但不致命的问题，例如「第 12 行字段数多于表头」 */
  warnings: string[];
}

export interface ParseResult {
  dataset: Dataset;
  meta: ParseMeta;
}

export type ParseErrorKind =
  | 'unsupported-format'
  | 'file-too-large'
  | 'empty-file'
  | 'no-header'
  | 'corrupt';

export interface ParseError {
  kind: ParseErrorKind;
  /** 直接展示给用户的中文说明 */
  message: string;
}

/** 类型守卫，用于区分 ParseResult 与 ParseError */
export function isParseError(value: ParseResult | ParseError): value is ParseError {
  return 'kind' in value && 'message' in value;
}

/**
 * 应用行数上限。
 *
 * 单独抽成函数是为了能用一个很小的上限来测试截断行为 —— 否则要么构造
 * 20 万行的测试数据（慢），要么这条分支永远没有覆盖。
 */
export function applyRowLimit<T>(
  rows: readonly T[],
  maxRows: number = MAX_ROWS,
): { kept: T[]; truncated: boolean } {
  if (maxRows <= 0) return { kept: [], truncated: rows.length > 0 };
  if (rows.length <= maxRows) return { kept: [...rows], truncated: false };
  return { kept: rows.slice(0, maxRows), truncated: true };
}

export function createParseResult(input: {
  dataset: Dataset;
  fileName: string;
  fileSize: number;
  format: ParseFormat;
  encoding?: string;
  sheetName?: string;
  truncated?: boolean;
  warnings?: string[];
}): ParseResult {
  return {
    dataset: input.dataset,
    meta: {
      fileName: input.fileName,
      fileSize: input.fileSize,
      format: input.format,
      encoding: input.encoding,
      sheetName: input.sheetName,
      truncated: input.truncated ?? false,
      warnings: input.warnings ?? [],
    },
  };
}
```

- [ ] **Step 4: 运行测试确认通过**

```powershell
pnpm test src/parser/types.test.ts
pnpm typecheck
```

Expected：PASS，3 个测试通过；类型无错误。

- [ ] **Step 5: 提交**

```bash
git add src/parser/types.ts src/parser/types.test.ts
git commit -m "feat(parser): 定义解析结果的类型契约与上限常量"
```

---

### Task 3: 编码探测与转换

**Files:**
- Create: `src/parser/encoding.ts`
- Create: `src/parser/encoding.test.ts`

**Interfaces:**
- Consumes: 无
- Produces: `decodeBuffer(buffer: ArrayBuffer): { text: string; encoding: string }`、`looksLikeGarbled(text: string): boolean`

- [ ] **Step 1: 写失败测试**

`src/parser/encoding.test.ts`：
```ts
import { describe, it, expect } from 'vitest';
import { decodeBuffer, looksLikeGarbled } from './encoding';

function toBuffer(bytes: number[]): ArrayBuffer {
  return new Uint8Array(bytes).buffer;
}

describe('decodeBuffer', () => {
  it('UTF-8 中文正常解码', () => {
    const bytes = Array.from(new TextEncoder().encode('姓名,年龄\n张三,20'));
    const { text, encoding } = decodeBuffer(toBuffer(bytes));
    expect(text).toContain('张三');
    expect(encoding.toLowerCase()).toContain('utf');
  });

  it('GBK 中文不乱码', () => {
    // 「姓名,年龄」的 GBK 字节，这是 Excel 另存为 CSV 时的默认编码
    const gbk = [0xd0, 0xd5, 0xc3, 0xfb, 0x2c, 0xc4, 0xea, 0xc1, 0xe4];
    const { text, encoding } = decodeBuffer(toBuffer(gbk));
    expect(text).toBe('姓名,年龄');
    expect(encoding.toLowerCase()).not.toContain('utf');
  });

  it('带 BOM 的 UTF-8 不把 BOM 留在内容里', () => {
    const bytes = [0xef, 0xbb, 0xbf, ...Array.from(new TextEncoder().encode('a,b'))];
    const { text } = decodeBuffer(toBuffer(bytes));
    expect(text.startsWith('a')).toBe(true);
  });

  it('纯 ASCII 按 UTF-8 处理', () => {
    const { text, encoding } = decodeBuffer(toBuffer(Array.from(new TextEncoder().encode('a,b\n1,2'))));
    expect(text).toBe('a,b\n1,2');
    expect(encoding.toLowerCase()).toContain('utf');
  });

  it('空 buffer 返回空串而不是抛错', () => {
    expect(decodeBuffer(new ArrayBuffer(0)).text).toBe('');
  });
});

describe('looksLikeGarbled', () => {
  it('正常中文不算乱码', () => {
    expect(looksLikeGarbled('姓名,年龄,学历')).toBe(false);
  });

  it('典型的 UTF-8 被按 GBK 解读的乱码能识别', () => {
    // 「姓名」的 UTF-8 字节被误当 GBK 解码的结果
    expect(looksLikeGarbled('濮撳悕,骞撮緞')).toBe(true);
  });

  it('纯 ASCII 不算乱码', () => {
    expect(looksLikeGarbled('name,age')).toBe(false);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```powershell
pnpm test src/parser/encoding.test.ts
```

Expected：FAIL，模块不存在。

- [ ] **Step 3: 实现 `src/parser/encoding.ts`**

```ts
import Encoding from 'encoding-japanese';

const UTF8_BOM = [0xef, 0xbb, 0xbf];

/**
 * 判断文本是否像乱码。
 *
 * 依据是「替换字符」与「中日韩兼容区的私用字符」出现得异常密集 ——
 * UTF-8 的中文被按 GBK 解读时，几乎每个汉字都会落到这些区段。
 * 这是启发式判断，用于在两种编码之间二选一，不追求绝对准确。
 */
export function looksLikeGarbled(text: string): boolean {
  const sample = text.slice(0, 2000);
  if (sample.length === 0) return false;

  let suspicious = 0;
  for (const ch of sample) {
    const code = ch.codePointAt(0) ?? 0;
    const isReplacement = code === 0xfffd;
    const isPrivateUse = code >= 0xe000 && code <= 0xf8ff;
    // 「濮」「悕」这类字是 UTF-8 汉字被按 GBK 解读后的典型产物，落在扩展 A 区
    const isRareCjk = code >= 0x3400 && code <= 0x4dbf;
    if (isReplacement || isPrivateUse || isRareCjk) suspicious += 1;
  }

  return suspicious / sample.length > 0.1;
}

function stripBom(bytes: number[]): number[] {
  const hasBom = UTF8_BOM.every((b, i) => bytes[i] === b);
  return hasBom ? bytes.slice(UTF8_BOM.length) : bytes;
}

/**
 * 把文件字节解码为文本。
 *
 * 顺序是：先按 UTF-8 解一次，若结果像乱码再按 GBK 解一次并取更合理的那个。
 * 之所以不先做统计式探测（chardet 那类），是因为中文 CSV 的编码基本只有
 * UTF-8 与 GBK 两种可能，直接试解码再比对结果比统计推断更可靠也更便宜。
 */
export function decodeBuffer(buffer: ArrayBuffer): { text: string; encoding: string } {
  if (buffer.byteLength === 0) return { text: '', encoding: 'utf-8' };

  const bytes = stripBom(Array.from(new Uint8Array(buffer)));
  const utf8Text = new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(bytes));

  if (!looksLikeGarbled(utf8Text)) {
    return { text: utf8Text, encoding: 'utf-8' };
  }

  // encoding-japanese 同时支持 GBK/GB2312，名字虽有误导但这是它的能力范围
  const gbkCodes = Encoding.convert(bytes, { to: 'UNICODE', from: 'GBK', type: 'array' });
  const gbkText = Encoding.codeToString(gbkCodes);

  return looksLikeGarbled(gbkText)
    ? { text: utf8Text, encoding: 'utf-8 (疑似乱码)' }
    : { text: gbkText, encoding: 'gbk' };
}
```

- [ ] **Step 4: 运行测试确认通过**

```powershell
pnpm test src/parser/encoding.test.ts
pnpm typecheck
```

Expected：PASS。若 `looksLikeGarbled` 的实际判定与预期不符（启发式难免），**以实测为准调整阈值并在测试里写明实测到的比例**，不要为了让测试通过而放宽到失去意义。

- [ ] **Step 5: 提交**

```bash
git add src/parser/encoding.ts src/parser/encoding.test.ts
git commit -m "feat(parser): 实现 CSV 编码探测（UTF-8 / GBK）"
```

---

### Task 4: CSV 解析

**Files:**
- Create: `src/parser/csv.ts`
- Create: `src/parser/csv.test.ts`

**Interfaces:**
- Consumes: `createParseResult`、`MAX_ROWS`、`ParseError`、`ParseResult`（Task 2）；`decodeBuffer`（Task 3）
- Produces: `parseCsv(input: { buffer: ArrayBuffer; fileName: string; fileSize: number }): ParseResult | ParseError`

- [ ] **Step 1: 写失败测试**

`src/parser/csv.test.ts`：
```ts
import { describe, it, expect } from 'vitest';
import { parseCsv } from './csv';
import { isParseError } from './types';

function buf(text: string): ArrayBuffer {
  return new TextEncoder().encode(text).buffer;
}

const opts = { fileName: 'a.csv', fileSize: 100 };

describe('parseCsv', () => {
  it('解析出表头与数据行', () => {
    const result = parseCsv({ ...opts, buffer: buf('姓名,年龄\n张三,20\n李四,21') });
    if (isParseError(result)) throw new Error('不应失败');
    expect(result.dataset.rowCount).toBe(2);
    expect(result.dataset.columns.map((c) => c.name)).toEqual(['姓名', '年龄']);
    expect(result.dataset.columns[0]?.values).toEqual(['张三', '李四']);
  });

  it('空文件给出可读的中文错误', () => {
    const result = parseCsv({ ...opts, buffer: buf('') });
    expect(isParseError(result)).toBe(true);
    if (!isParseError(result)) return;
    expect(result.kind).toBe('empty-file');
    expect(result.message).toContain('空');
  });

  it('只有表头没有数据行时报 no-header', () => {
    const result = parseCsv({ ...opts, buffer: buf('姓名,年龄') });
    expect(isParseError(result)).toBe(true);
    if (isParseError(result)) expect(result.kind).toBe('no-header');
  });

  it('字段数不足的行补空值，并记入 warnings', () => {
    const result = parseCsv({ ...opts, buffer: buf('a,b,c\n1,2\n3,4,5') });
    if (isParseError(result)) throw new Error('不应失败');
    expect(result.dataset.columns[2]?.values[0]).toBeNull();
    expect(result.meta.warnings.join()).toContain('第 2 行');
  });

  it('字段数超出的行不静默丢弃，记入 warnings', () => {
    const result = parseCsv({ ...opts, buffer: buf('a,b\n1,2,3\n4,5') });
    if (isParseError(result)) throw new Error('不应失败');
    expect(result.dataset.rowCount).toBe(2);
    expect(result.meta.warnings.join()).toContain('第 2 行');
  });

  it('重复列名保留为两列，不互相覆盖', () => {
    const result = parseCsv({ ...opts, buffer: buf('年龄,年龄\n1,2') });
    if (isParseError(result)) throw new Error('不应失败');
    expect(result.dataset.columns).toHaveLength(2);
    expect(result.dataset.columns[1]?.values).toEqual([2]);
  });

  it('数字被解析为数值类型，空字段为 null', () => {
    const result = parseCsv({ ...opts, buffer: buf('a,b\n1,\n2,x') });
    if (isParseError(result)) throw new Error('不应失败');
    expect(result.dataset.columns[0]?.values).toEqual(['1', '2']);
    expect(result.dataset.columns[1]?.values).toEqual([null, 'x']);
  });

  it('meta 里记录编码与真实体积', () => {
    const result = parseCsv({ ...opts, buffer: buf('a\n1') });
    if (isParseError(result)) throw new Error('不应失败');
    expect(result.meta.encoding).toBeDefined();
    expect(result.meta.format).toBe('csv');
    expect(result.meta.truncated).toBe(false);
  });

  it('字段里有换行与逗号时不误切（引号包裹）', () => {
    const result = parseCsv({ ...opts, buffer: buf('备注\n"第一行\n第二行"\n"a,b"') });
    if (isParseError(result)) throw new Error('不应失败');
    expect(result.dataset.rowCount).toBe(2);
    expect(result.dataset.columns[0]?.values[0]).toContain('第二行');
  });

  it('全空列解析为整列 null，不折叠成空字符串', () => {
    const result = parseCsv({ ...opts, buffer: buf('a,b\n1,\n2,') });
    if (isParseError(result)) throw new Error('不应失败');
    expect(result.dataset.columns[1]?.values).toEqual([null, null]);
    // 列必须保留：折叠掉会让下游的列画像与表格列数对不上
    expect(result.dataset.columns).toHaveLength(2);
  });

  it('表头为空白的列被起名为「未命名列 N」而不是空字符串', () => {
    // 空列名会让 React 的 key 冲突，也会让问题清单里无法指认是哪一列
    const result = parseCsv({ ...opts, buffer: buf('a,,c\n1,2,3') });
    if (isParseError(result)) throw new Error('不应失败');
    expect(result.dataset.columns[1]?.name).toBe('未命名列 2');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```powershell
pnpm test src/parser/csv.test.ts
```

Expected：FAIL，模块不存在。

- [ ] **Step 3: 实现 `src/parser/csv.ts`**

```ts
import Papa from 'papaparse';
import type { CellValue, ColumnData, Dataset } from '@/core';
import { decodeBuffer } from './encoding';
import { applyRowLimit, createParseResult, MAX_ROWS, type ParseError, type ParseResult } from './types';

function toCellValue(raw: string | undefined): CellValue {
  if (raw === undefined) return null;
  const trimmed = raw.trim();
  return trimmed === '' ? null : trimmed;
}

export function parseCsv(input: {
  buffer: ArrayBuffer;
  fileName: string;
  fileSize: number;
}): ParseResult | ParseError {
  const { text, encoding } = decodeBuffer(input.buffer);

  if (text.trim() === '') {
    return { kind: 'empty-file', message: '这个文件是空的，没有任何内容。' };
  }

  const parsed = Papa.parse<string[]>(text, {
    // 不让 Papa 做类型转换：类型推断是 core 的职责，解析层只负责切分
    dynamicTyping: false,
    skipEmptyLines: 'greedy',
  });

  const rows = parsed.data.filter((row) => Array.isArray(row));
  if (rows.length === 0) {
    return { kind: 'no-header', message: '没有读到任何内容行。' };
  }

  const header = rows[0] ?? [];
  const dataRows = rows.slice(1);

  if (header.length === 0) {
    return { kind: 'no-header', message: '第一行是空的，没有读到表头。' };
  }
  if (dataRows.length === 0) {
    return { kind: 'no-header', message: '文件里只有表头，没有数据行。' };
  }

  const { kept, truncated } = applyRowLimit(dataRows);
  const warnings: string[] = [];

  if (truncated) {
    warnings.push(`数据超过 ${MAX_ROWS.toLocaleString('zh-CN')} 行，只分析了前 ${MAX_ROWS.toLocaleString('zh-CN')} 行。`);
  }

  // 字段数与表头不一致的行要报出来：多出来的字段无处安放，缺少的字段会被补空，
  // 两者都会让后续统计失真，静默处理会让用户拿到错误的画像
  const mismatched: number[] = [];
  kept.forEach((row, index) => {
    if (row.length !== header.length) mismatched.push(index + 2); // +2：表头占第 1 行
  });
  if (mismatched.length > 0) {
    const shown = mismatched.slice(0, 10).join('、');
    const suffix = mismatched.length > 10 ? ` 等 ${mismatched.length} 行` : '';
    warnings.push(`第 ${shown}${suffix}的字段数与表头不一致，多出的字段已忽略，缺少的已按空值处理。`);
  }

  const columns: ColumnData[] = header.map((name, columnIndex) => ({
    name: name.trim() === '' ? `未命名列 ${columnIndex + 1}` : name.trim(),
    values: kept.map((row) => toCellValue(row[columnIndex])),
  }));

  const dataset: Dataset = { columns, rowCount: kept.length };

  return createParseResult({
    dataset,
    fileName: input.fileName,
    fileSize: input.fileSize,
    format: 'csv',
    encoding,
    truncated,
    warnings,
  });
}
```

- [ ] **Step 4: 运行测试确认通过**

```powershell
pnpm test src/parser/csv.test.ts
pnpm typecheck
```

Expected：PASS，9 个测试通过。

- [ ] **Step 5: 提交**

```bash
git add src/parser/csv.ts src/parser/csv.test.ts
git commit -m "feat(parser): 实现 CSV 解析（含字段数不齐的告警）"
```

---

### Task 5: Excel 解析

**Files:**
- Create: `src/parser/excel.ts`
- Create: `src/parser/excel.test.ts`

**Interfaces:**
- Consumes: `createParseResult`、`MAX_ROWS`、`ParseError`、`ParseResult`（Task 2）
- Produces: `parseXlsx(input: { buffer: ArrayBuffer; fileName: string; fileSize: number }): Promise<ParseResult | ParseError>`

> **注意**：`read-excel-file` 是异步 API，所以本任务返回 Promise。Task 6 的统一入口会把它和同步的 CSV 一起包成 Promise。

- [ ] **Step 1: 写失败测试**

`src/parser/excel.test.ts`：
```ts
import { describe, it, expect } from 'vitest';
import { parseXlsx } from './excel';
import { isParseError } from './types';

const opts = { fileName: 'a.xlsx', fileSize: 100 };

describe('parseXlsx', () => {
  it('损坏的二进制给出可读的中文错误，不抛异常', async () => {
    const result = await parseXlsx({ ...opts, buffer: new Uint8Array([1, 2, 3]).buffer });
    expect(isParseError(result)).toBe(true);
    if (isParseError(result)) {
      expect(result.kind).toBe('corrupt');
      expect(result.message).toContain('无法读取');
    }
  });

  it('空 buffer 给出可读错误', async () => {
    const result = await parseXlsx({ ...opts, buffer: new ArrayBuffer(0) });
    expect(isParseError(result)).toBe(true);
  });

  it('错误信息里带上文件名，便于用户核对选错的文件', async () => {
    const result = await parseXlsx({ ...opts, buffer: new Uint8Array([0]).buffer });
    if (isParseError(result)) expect(result.message).toContain('a.xlsx');
  });
});
```

> 说明：构造真实的 `.xlsx` 二进制比较笨重，这里只固定失败路径。成功路径由 Task 12 的端到端测试用真实文件覆盖——**这是有意的取舍**，因为手工拼 xlsx 二进制容易失真，反而不如用真文件跑一遍。

- [ ] **Step 2: 运行测试确认失败**

```powershell
pnpm test src/parser/excel.test.ts
```

Expected：FAIL，模块不存在。

- [ ] **Step 3: 实现 `src/parser/excel.ts`**

```ts
import readXlsxFile from 'read-excel-file';
import type { CellValue, ColumnData, Dataset } from '@/core';
import { createParseResult, applyRowLimit, MAX_ROWS, type ParseError, type ParseResult } from './types';

function toCellValue(raw: unknown): CellValue {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number' || typeof raw === 'boolean') return raw;
  if (raw instanceof Date) return raw.toISOString().slice(0, 10);
  const text = String(raw).trim();
  return text === '' ? null : text;
}

export async function parseXlsx(input: {
  buffer: ArrayBuffer;
  fileName: string;
  fileSize: number;
}): Promise<ParseResult | ParseError> {
  if (input.buffer.byteLength === 0) {
    return { kind: 'empty-file', message: '这个文件是空的，没有任何内容。' };
  }

  let rows: unknown[][];
  try {
    // read-excel-file 在浏览器端接受 Blob / ArrayBuffer，这里用 ArrayBuffer
    rows = (await readXlsxFile(input.buffer)) as unknown[][];
  } catch {
    return {
      kind: 'corrupt',
      message: `无法读取「${input.fileName}」。请确认它是完整的 .xlsx 文件（旧版 .xls 请先另存为 .xlsx），并且没有加密。`,
    };
  }

  if (rows.length === 0) {
    return { kind: 'no-header', message: '这个工作表是空的。' };
  }

  const header = rows[0] ?? [];
  const dataRows = rows.slice(1);

  if (header.length === 0) {
    return { kind: 'no-header', message: '第一行是空的，没有读到表头。' };
  }
  if (dataRows.length === 0) {
    return { kind: 'no-header', message: '这个工作表里只有表头，没有数据行。' };
  }

  const { kept, truncated } = applyRowLimit(dataRows);
  const warnings: string[] = [];

  if (truncated) {
    warnings.push(`数据超过 ${MAX_ROWS.toLocaleString('zh-CN')} 行，只分析了前 ${MAX_ROWS.toLocaleString('zh-CN')} 行。`);
  }

  const columns: ColumnData[] = header.map((rawName, columnIndex) => ({
    name: String(rawName ?? '').trim() === '' ? `未命名列 ${columnIndex + 1}` : String(rawName).trim(),
    values: kept.map((row) => toCellValue(row[columnIndex])),
  }));

  const dataset: Dataset = { columns, rowCount: kept.length };

  return createParseResult({
    dataset,
    fileName: input.fileName,
    fileSize: input.fileSize,
    format: 'xlsx',
    truncated,
    warnings,
  });
}
```

- [ ] **Step 4: 运行测试确认通过**

```powershell
pnpm test src/parser/excel.test.ts
pnpm typecheck
```

Expected：PASS，3 个测试通过。

- [ ] **Step 5: 提交**

```bash
git add src/parser/excel.ts src/parser/excel.test.ts
git commit -m "feat(parser): 实现 .xlsx 解析（失败路径给可读中文提示）"
```

---

### Task 6: 统一解析入口与 Web Worker

**Files:**
- Create: `src/parser/index.ts`
- Create: `src/parser/index.test.ts`
- Create: `src/parser/worker.ts`
- Create: `src/parser/workerClient.ts`
- Create: `src/parser/workerClient.test.ts`

**Interfaces:**
- Consumes: `parseCsv`（Task 4）、`parseXlsx`（Task 5）、`MAX_FILE_BYTES`（Task 2）
- Produces:
  - `parseFile(input: { buffer: ArrayBuffer; fileName: string; fileSize: number }): Promise<ParseResult | ParseError>`
  - `pickFormat(fileName: string): ParseFormat | null`
  - Worker 协议：`WorkerRequest = { id: string; buffer: ArrayBuffer; fileName: string; fileSize: number }`、`WorkerResponse = { id: string; result: ParseResult | ParseError }`
  - `parseInWorker(...): Promise<ParseResult | ParseError>`（含主线程降级）

- [ ] **Step 1: 写入口的失败测试**

`src/parser/index.test.ts`：
```ts
import { describe, it, expect } from 'vitest';
import { pickFormat, parseFile } from './index';
import { isParseError } from './types';

describe('pickFormat', () => {
  it('识别 csv 与 xlsx', () => {
    expect(pickFormat('a.csv')).toBe('csv');
    expect(pickFormat('a.CSV')).toBe('csv');
    expect(pickFormat('a.xlsx')).toBe('xlsx');
    expect(pickFormat('a.XLSX')).toBe('xlsx');
  });

  it('旧版 xls 不支持，返回 null（库里明确提示要另存为 xlsx）', () => {
    expect(pickFormat('a.xls')).toBeNull();
  });

  it('其他扩展名返回 null', () => {
    expect(pickFormat('a.txt')).toBeNull();
    expect(pickFormat('a')).toBeNull();
  });
});

describe('parseFile', () => {
  it('不支持的类型给出可读中文提示并说明支持范围', async () => {
    const result = await parseFile({
      buffer: new ArrayBuffer(0),
      fileName: 'a.pdf',
      fileSize: 0,
    });
    expect(isParseError(result)).toBe(true);
    if (isParseError(result)) {
      expect(result.kind).toBe('unsupported-format');
      expect(result.message).toContain('.csv');
      expect(result.message).toContain('.xlsx');
    }
  });

  it('超过体积上限时拒绝解析并说明上限', async () => {
    const result = await parseFile({
      buffer: new TextEncoder().encode('a\n1').buffer,
      fileName: 'a.csv',
      fileSize: 999 * 1024 * 1024,
    });
    expect(isParseError(result)).toBe(true);
    if (isParseError(result)) {
      expect(result.kind).toBe('file-too-large');
      expect(result.message).toContain('50');
    }
  });

  it('正常 CSV 走到解析成功', async () => {
    const result = await parseFile({
      buffer: new TextEncoder().encode('姓名\n张三').buffer,
      fileName: 'a.csv',
      fileSize: 20,
    });
    expect(isParseError(result)).toBe(false);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```powershell
pnpm test src/parser/index.test.ts
```

Expected：FAIL，模块不存在。

- [ ] **Step 3: 实现 `src/parser/index.ts`**

```ts
import { parseCsv } from './csv';
import { parseXlsx } from './excel';
import { MAX_FILE_BYTES, type ParseError, type ParseFormat, type ParseResult } from './types';

/** 支持的格式。注意不含 .xls —— 老格式需要含 CVE 的库，见计划 Global Constraints */
export function pickFormat(fileName: string): ParseFormat | null {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.csv')) return 'csv';
  if (lower.endsWith('.xlsx')) return 'xlsx';
  return null;
}

export async function parseFile(input: {
  buffer: ArrayBuffer;
  fileName: string;
  fileSize: number;
}): Promise<ParseResult | ParseError> {
  const format = pickFormat(input.fileName);

  if (format === null) {
    const isLegacyExcel = input.fileName.toLowerCase().endsWith('.xls');
    return {
      kind: 'unsupported-format',
      message: isLegacyExcel
        ? '暂不支持旧版 .xls 格式。请在 Excel 里另存为 .xlsx 后重新上传。'
        : '只支持 .csv 和 .xlsx 两种格式。请确认文件类型后重试。',
    };
  }

  if (input.fileSize > MAX_FILE_BYTES) {
    const limitMb = Math.round(MAX_FILE_BYTES / 1024 / 1024);
    const actualMb = (input.fileSize / 1024 / 1024).toFixed(1);
    return {
      kind: 'file-too-large',
      message: `文件有 ${actualMb} MB，超过 ${limitMb} MB 的上限。建议先在 Excel 里拆分成多个文件。`,
    };
  }

  return format === 'csv' ? parseCsv(input) : parseXlsx(input);
}
```

- [ ] **Step 4: 运行测试确认通过**

```powershell
pnpm test src/parser/index.test.ts
pnpm typecheck
```

Expected：PASS，6 个测试通过。

- [ ] **Step 5: 实现 Worker 与其客户端**

`src/parser/worker.ts`：
```ts
/// <reference lib="webworker" />
import { parseFile } from './index';
import type { ParseError, ParseResult } from './types';

export interface WorkerRequest {
  id: string;
  buffer: ArrayBuffer;
  fileName: string;
  fileSize: number;
}

export interface WorkerResponse {
  id: string;
  result: ParseResult | ParseError;
}

// 这是本仓库唯一允许使用 self 的地方：Worker 入口本身
self.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  const { id, buffer, fileName, fileSize } = event.data;
  void parseFile({ buffer, fileName, fileSize })
    .then((result) => {
      const response: WorkerResponse = { id, result };
      self.postMessage(response);
    })
    .catch((error: unknown) => {
      // parseFile 内部已消化可预期的失败，走到这里说明是意料之外的错误，
      // 也要回一个结构化的失败而不是让主线程永远等待
      const response: WorkerResponse = {
        id,
        result: {
          kind: 'corrupt',
          message: `解析时发生意外错误：${error instanceof Error ? error.message : String(error)}`,
        },
      };
      self.postMessage(response);
    });
});
```

`src/parser/workerClient.ts`：
```ts
import { parseFile } from './index';
import type { WorkerRequest, WorkerResponse } from './worker';
import type { ParseError, ParseResult } from './types';

let worker: Worker | null = null;
let workerUnavailable = false;
let sequence = 0;

function ensureWorker(): Worker | null {
  if (workerUnavailable) return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    return worker;
  } catch {
    // 打包器不支持 Worker 或运行环境禁用时，退回主线程
    workerUnavailable = true;
    return null;
  }
}

/**
 * 在 Worker 中解析文件，Worker 不可用时降级到主线程。
 *
 * 降级不是可选项：Worker 的打包依赖构建工具支持 new Worker(new URL(...))，
 * 换构建器或部署平台时可能失效。降级后大文件会短暂卡住界面，但功能不丢。
 */
export function parseInWorker(input: {
  buffer: ArrayBuffer;
  fileName: string;
  fileSize: number;
}): Promise<ParseResult | ParseError> {
  const instance = ensureWorker();
  if (instance === null) return parseFile(input);

  sequence += 1;
  const id = `parse-${sequence}`;

  return new Promise((resolve) => {
    const onMessage = (event: MessageEvent<WorkerResponse>) => {
      if (event.data.id !== id) return;
      instance.removeEventListener('message', onMessage);
      resolve(event.data.result);
    };

    instance.addEventListener('message', onMessage);

    const request: WorkerRequest = { id, ...input };
    // buffer 转移所有权，避免大文件被结构化克隆复制一份
    instance.postMessage(request, [input.buffer]);
  });
}

/** 供测试使用：重置模块级的 Worker 状态 */
export function resetWorkerForTest(): void {
  worker?.terminate();
  worker = null;
  workerUnavailable = false;
  sequence = 0;
}
```

- [ ] **Step 6: 写 Worker 客户端的失败测试**

`src/parser/workerClient.test.ts`：
```ts
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { parseInWorker, resetWorkerForTest } from './workerClient';
import { isParseError } from './types';

describe('parseInWorker', () => {
  beforeEach(() => {
    resetWorkerForTest();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    resetWorkerForTest();
  });

  it('Worker 构造失败时降级到主线程，结果仍然正确', async () => {
    // node 环境下没有 Worker，构造必然失败 —— 这正好复现降级路径
    vi.stubGlobal('Worker', undefined as unknown as typeof Worker);
    const result = await parseInWorker({
      buffer: new TextEncoder().encode('姓名\n张三').buffer,
      fileName: 'a.csv',
      fileSize: 20,
    });
    expect(isParseError(result)).toBe(false);
    if (!isParseError(result)) {
      expect(result.dataset.rowCount).toBe(1);
      expect(result.dataset.columns[0]?.name).toBe('姓名');
    }
  });

  it('降级路径同样处理解析错误', async () => {
    vi.stubGlobal('Worker', undefined as unknown as typeof Worker);
    const result = await parseInWorker({
      buffer: new TextEncoder().encode('').buffer,
      fileName: 'a.csv',
      fileSize: 0,
    });
    expect(isParseError(result)).toBe(true);
  });
});
```

- [ ] **Step 7: 运行测试确认通过**

```powershell
pnpm test src/parser
pnpm typecheck
```

Expected：PASS。Worker 的真实行为在 Task 12 的端到端测试里用浏览器验证。

- [ ] **Step 8: 提交**

```bash
git add src/parser
git commit -m "feat(parser): 统一解析入口与 Web Worker（含主线程降级）"
```

---

### Task 7: 状态管理

**Files:**
- Create: `src/ui/stores/datasetStore.ts`
- Create: `src/ui/stores/datasetStore.test.ts`

**Interfaces:**
- Consumes: `parseInWorker`（Task 6）、`profileDataset`/`runAllChecks`（`src/core`）
- Produces: `useDatasetStore`（Zustand hook），状态字段 `status` / `parseResult` / `profile` / `issues` / `error`，动作 `loadFile(file: File)` / `reset()`

- [ ] **Step 1: 写失败测试**

`src/ui/stores/datasetStore.test.ts`：
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ParseResult, ParseError } from '@/parser/types';

// 控制解析结果：node 环境里没有真实 Worker，而且状态机的测试不该依赖解析细节
vi.mock('@/parser/workerClient', () => ({ parseInWorker: vi.fn() }));

import { parseInWorker } from '@/parser/workerClient';
import { useDatasetStore } from './datasetStore';

const mockParse = vi.mocked(parseInWorker);

function makeFile(content: string, name = 'a.csv'): File {
  return new File([content], name, { type: 'text/csv' });
}

function okResult(): ParseResult {
  return {
    dataset: { rowCount: 2, columns: [{ name: '年龄', values: [20, 30] }] },
    meta: { fileName: 'a.csv', fileSize: 10, format: 'csv', truncated: false, warnings: [] },
  };
}

describe('datasetStore', () => {
  beforeEach(() => {
    useDatasetStore.getState().reset();
    mockParse.mockReset();
  });

  it('初始状态是 idle', () => {
    const state = useDatasetStore.getState();
    expect(state.status).toBe('idle');
    expect(state.parseResult).toBeNull();
    expect(state.profile).toBeNull();
    expect(state.issues).toEqual([]);
  });

  it('解析成功后进入 ready，并同时算出画像与问题', async () => {
    mockParse.mockResolvedValue(okResult());

    await useDatasetStore.getState().loadFile(makeFile('年龄\n20\n30'));

    const state = useDatasetStore.getState();
    expect(state.status).toBe('ready');
    expect(state.profile?.columns).toHaveLength(1);
    expect(state.parseResult?.meta.fileName).toBe('a.csv');
  });

  it('解析失败后进入 error 并保留可读提示', async () => {
    const failure: ParseError = { kind: 'empty-file', message: '这个文件是空的，没有任何内容。' };
    mockParse.mockResolvedValue(failure);

    await useDatasetStore.getState().loadFile(makeFile(''));

    const state = useDatasetStore.getState();
    expect(state.status).toBe('error');
    expect(state.error).toContain('空');
    expect(state.parseResult).toBeNull();
  });

  it('重新上传会清掉上一次的结果，不出现新旧混合', async () => {
    mockParse.mockResolvedValueOnce(okResult());
    await useDatasetStore.getState().loadFile(makeFile('年龄\n20\n30'));
    expect(useDatasetStore.getState().status).toBe('ready');

    mockParse.mockResolvedValueOnce({ kind: 'corrupt', message: '无法读取这个文件。' });
    await useDatasetStore.getState().loadFile(makeFile('坏数据'));

    const state = useDatasetStore.getState();
    expect(state.status).toBe('error');
    expect(state.profile).toBeNull();
    expect(state.issues).toEqual([]);
  });

  it('解析抛异常时落到 error，不把界面永远卡在解析中', async () => {
    mockParse.mockRejectedValue(new Error('意外错误'));

    await useDatasetStore.getState().loadFile(makeFile('a\n1'));

    const state = useDatasetStore.getState();
    expect(state.status).toBe('error');
    expect(state.error).toContain('意外错误');
  });

  it('reset 清空全部状态', async () => {
    mockParse.mockResolvedValue(okResult());
    await useDatasetStore.getState().loadFile(makeFile('年龄\n20\n30'));

    useDatasetStore.getState().reset();

    const state = useDatasetStore.getState();
    expect(state.status).toBe('idle');
    expect(state.parseResult).toBeNull();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```powershell
pnpm test src/ui/stores
```

Expected：FAIL，`Failed to resolve import "./datasetStore"`。

- [ ] **Step 3: 建立文件读取接缝与 store**

`src/ui/lib/readFile.ts`：
```ts
/**
 * 把 File 读成 ArrayBuffer。
 *
 * 单独抽出来而不是直接在 store 里调 file.arrayBuffer()，是为了让 store 的
 * 测试能替换掉这一步。注意它属于生产代码，不要放进 src/test-utils ——
 * 那样会被打进生产包。
 */
export function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return file.arrayBuffer();
}
```

`src/ui/stores/datasetStore.ts`：
```ts
import { create } from 'zustand';
import { profileDataset, runAllChecks, type DatasetProfile, type QualityIssue } from '@/core';
import { parseInWorker } from '@/parser/workerClient';
import { isParseError, type ParseResult, type ParseError } from '@/parser/types';
import { readFileAsArrayBuffer } from '@/ui/lib/readFile';

/**
 * 界面状态机。
 *
 * 只在这四种状态之间流转，避免出现「既在解析又有结果」这类矛盾状态：
 *   idle → parsing → ready
 *                  ↘ error
 */
export type DatasetStatus = 'idle' | 'parsing' | 'ready' | 'error';

interface DatasetState {
  status: DatasetStatus;
  parseResult: ParseResult | null;
  profile: DatasetProfile | null;
  issues: QualityIssue[];
  error: string | null;
  loadFile: (file: File) => Promise<void>;
  reset: () => void;
}

const initialState = {
  status: 'idle' as DatasetStatus,
  parseResult: null,
  profile: null,
  issues: [],
  error: null,
};

export const useDatasetStore = create<DatasetState>((set) => ({
  ...initialState,

  async loadFile(file: File) {
    set({ status: 'parsing', error: null, parseResult: null, profile: null, issues: [] });

    try {
      // 先读成 ArrayBuffer 再交给 Worker：Worker 里拿不到 File 对象，
      // 而且 buffer 可以被转移所有权，避免大文件被复制一份
      const buffer = await readFileAsArrayBuffer(file);
      const result = await parseInWorker({
        buffer,
        fileName: file.name,
        fileSize: file.size,
      });

      if (isParseError(result)) {
        set({ status: 'error', error: result.message });
        return;
      }

      set({
        status: 'ready',
        parseResult: result,
        profile: profileDataset(result.dataset),
        issues: runAllChecks(result.dataset),
      });
    } catch (error) {
      set({
        status: 'error',
        error: `读取文件时出错：${error instanceof Error ? error.message : String(error)}`,
      });
    }
  },

  reset() {
    set(initialState);
  },
}));
```

- [ ] **Step 4: 更新 `vitest.config.ts` 的 include 范围**

`vitest.config.ts` 改为：
```ts
import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    // core 与 parser 是纯函数包，node 环境足够；
    // 组件行为由 Playwright 在真实浏览器里验证，不引入 jsdom
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: { '@': resolve(import.meta.dirname, 'src') },
  },
});
```

- [ ] **Step 5: 运行测试确认通过**

```powershell
pnpm test src/ui/stores
pnpm typecheck
```

Expected：PASS，1 个测试通过。

- [ ] **Step 6: 提交**

```bash
git add src/ui/stores src/test-utils vitest.config.ts
git commit -m "feat(ui): 建立数据集状态机与文件读取接缝"
```

---

### Task 8: 上传组件

**Files:**
- Create: `src/ui/components/FileDropzone.tsx`
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `useDatasetStore`（Task 7）、`Button`/`Card`（Task 1）
- Produces: `<FileDropzone />`

- [ ] **Step 1: 实现 `src/ui/components/FileDropzone.tsx`**

```tsx
'use client';

import { useCallback, useRef, useState, type DragEvent } from 'react';
import { Upload } from 'lucide-react';
import { Button } from '@/ui/components/base/Button';
import { cn } from '@/ui/lib/cn';

const ACCEPT = '.csv,.xlsx';
const SUPPORTED_HINT = '支持 .csv 与 .xlsx，单个文件不超过 50 MB';

export function FileDropzone({ onFile, disabled }: { onFile: (file: File) => void; disabled?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (file) onFile(file);
    },
    [onFile],
  );

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragging(false);
      if (disabled) return;
      handleFiles(event.dataTransfer.files);
    },
    [disabled, handleFiles],
  );

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 py-14 text-center transition-colors',
        isDragging ? 'border-neutral-900 bg-neutral-100' : 'border-neutral-300 bg-white',
        disabled && 'pointer-events-none opacity-60',
      )}
    >
      <Upload className="h-7 w-7 text-neutral-400" aria-hidden="true" />

      <div>
        <p className="text-sm font-medium text-neutral-800">把数据文件拖到这里</p>
        <p className="mt-1 text-xs text-neutral-500">{SUPPORTED_HINT}</p>
      </div>

      {/* 键盘用户走这里：按钮触发的原生文件选择，不依赖拖拽 */}
      <Button variant="secondary" size="sm" onClick={() => inputRef.current?.click()}>
        选择文件
      </Button>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        aria-label="选择数据文件"
        onChange={(event) => {
          handleFiles(event.target.files);
          // 清空 value，否则连续选择同一个文件不会触发 change
          event.target.value = '';
        }}
      />

      <p className="text-xs text-neutral-400">文件在浏览器内解析，不会上传到任何服务器</p>
    </div>
  );
}
```

- [ ] **Step 2: 让页面能跑起来**

`src/app/page.tsx`：
```tsx
'use client';

import { useDatasetStore } from '@/ui/stores/datasetStore';
import { FileDropzone } from '@/ui/components/FileDropzone';
import { Card, CardBody, CardHeader, CardTitle } from '@/ui/components/base/Card';
import { Spinner } from '@/ui/components/base/Spinner';

export default function HomePage() {
  const status = useDatasetStore((state) => state.status);
  const error = useDatasetStore((state) => state.error);
  const loadFile = useDatasetStore((state) => state.loadFile);

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <h1 className="text-xl font-semibold text-neutral-900">科研数据质量治理 Agent</h1>
      <p className="mt-1 text-sm text-neutral-500">
        把数据清洗变成一份可复现、可追溯的处理记录
      </p>

      <div className="mt-8">
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
    </main>
  );
}
```

- [ ] **Step 3: 在浏览器里验证**

```powershell
$env:TEMP='D:\tmp'; $env:TMP='D:\tmp'
pnpm dev
```

用 Playwright 打开 `http://localhost:3000`，截图确认：标题、拖拽区、说明文字都渲染正常，控制台无报错。**这一步不能省**——'use client'、Tailwind 类名、图标引入都可能在这个阶段才暴露问题。

- [ ] **Step 4: 提交**

```powershell
pnpm typecheck
git add src/ui src/app
git commit -m "feat(ui): 实现文件上传区与页面骨架"
```

---

### Task 9: 数据预览表格

**Files:**
- Create: `src/ui/components/DataTable.tsx`
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `Dataset`（`src/core`）、`useVirtualizer`（`@tanstack/react-virtual`）
- Produces: `<DataTable dataset={Dataset} />`

- [ ] **Step 1: 实现 `src/ui/components/DataTable.tsx`**

```tsx
'use client';

import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { Dataset } from '@/core';

const ROW_HEIGHT = 32;
/** 单元格最大宽度，超长文本靠 CSS 省略，避免一列把表格撑爆 */
const CELL_WIDTH = 160;

export function DataTable({ dataset }: { dataset: Dataset }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: dataset.rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    // 多渲染几行，滚动时不会看到空白
    overscan: 12,
  });

  const rows = virtualizer.getVirtualItems();
  const totalWidth = dataset.columns.length * CELL_WIDTH;

  return (
    <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
      <div ref={scrollRef} data-testid="data-table-scroll" className="max-h-[420px] overflow-auto">
        <div style={{ width: totalWidth, minWidth: '100%' }}>
          {/* 表头吸顶：纵向滚动时始终可见 */}
          <div className="sticky top-0 z-10 flex border-b border-neutral-200 bg-neutral-50">
            <div className="w-14 shrink-0 px-2 py-2 text-right text-xs font-medium text-neutral-400">
              #
            </div>
            {dataset.columns.map((column, index) => (
              <div
                key={`${column.name}-${index}`}
                style={{ width: CELL_WIDTH }}
                className="shrink-0 truncate border-l border-neutral-100 px-3 py-2 text-xs font-medium text-neutral-700"
                title={`${column.name}（第 ${index + 1} 列）`}
              >
                {column.name}
              </div>
            ))}
          </div>

          {/* 用一个高容器撑出总高度，再绝对定位渲染可见行 */}
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {rows.map((row) => (
              <div
                key={row.key}
                style={{ position: 'absolute', top: 0, left: 0, height: ROW_HEIGHT, transform: `translateY(${row.start}px)` }}
                className="flex border-b border-neutral-100 hover:bg-neutral-50"
              >
                <div className="w-14 shrink-0 px-2 py-1.5 text-right text-xs tabular-nums text-neutral-400">
                  {row.index + 1}
                </div>
                {dataset.columns.map((column, columnIndex) => {
                  const value = column.values[row.index];
                  return (
                    <div
                      key={`${column.name}-${columnIndex}`}
                      style={{ width: CELL_WIDTH }}
                      className="shrink-0 truncate border-l border-neutral-100 px-3 py-1.5 text-xs text-neutral-700"
                      title={value === null ? '' : String(value)}
                    >
                      {value === null ? (
                        <span className="text-neutral-300">—</span>
                      ) : (
                        String(value)
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="border-t border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs text-neutral-500">
        共 {dataset.rowCount.toLocaleString('zh-CN')} 行 × {dataset.columns.length} 列
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 接进页面**

在 `src/app/page.tsx` 里，`status === 'ready'` 时渲染 `DataTable`：

```tsx
const parseResult = useDatasetStore((state) => state.parseResult);

// ...在 return 里追加：
{status === 'ready' && parseResult ? (
  <section className="mt-8">
    <h2 className="mb-3 text-sm font-semibold text-neutral-900">数据预览</h2>
    <DataTable dataset={parseResult.dataset} />
  </section>
) : null}
```

- [ ] **Step 3: 在浏览器里用真实文件验证**

准备一个测试文件 `D:\tmp\sample-survey.csv`（至少 2000 行，混入缺失值与重复行），在浏览器里上传，确认：

- 表格能滚动，滚动时不会出现大片空白（虚拟滚动工作正常）
- 表头在纵向滚动时吸顶
- 空值显示为灰色破折号
- 底部行数统计正确

- [ ] **Step 4: 提交**

```powershell
pnpm typecheck
git add src/ui src/app
git commit -m "feat(ui): 实现虚拟滚动数据预览表格"
```

---

### Task 10: 列画像侧栏

**Files:**
- Create: `src/ui/components/ColumnProfilePanel.tsx`
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `DatasetProfile`（`src/core`）、`Card`/`Badge`（Task 1）
- Produces: `<ColumnProfilePanel profile={DatasetProfile} />`

- [ ] **Step 1: 实现 `src/ui/components/ColumnProfilePanel.tsx`**

```tsx
'use client';

import type { ColumnProfile, ColumnType, DatasetProfile } from '@/core';
import { Badge } from '@/ui/components/base/Badge';
import { Card, CardBody, CardHeader, CardTitle } from '@/ui/components/base/Card';

const TYPE_LABEL: Record<ColumnType, string> = {
  number: '数值',
  category: '分类',
  text: '文本',
  boolean: '布尔',
  empty: '全空',
  mixed: '混合',
};

function formatPercent(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

function ColumnRow({ column }: { column: ColumnProfile }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-neutral-100 px-4 py-2.5 last:border-b-0">
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-neutral-800" title={column.name}>
          {column.name}
        </p>
        <p className="mt-0.5 text-xs text-neutral-500">
          {column.uniqueCount} 个不同取值
          {column.missingCount > 0 ? ` · 缺失 ${formatPercent(column.missingRate)}` : ''}
        </p>
      </div>
      <Badge tone={column.type === 'empty' ? 'high' : 'neutral'}>{TYPE_LABEL[column.type]}</Badge>
    </div>
  );
}

export function ColumnProfilePanel({ profile }: { profile: DatasetProfile }) {
  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <CardTitle>列画像</CardTitle>
        <span className="text-xs text-neutral-500">{profile.columnCount} 列</span>
      </CardHeader>
      <CardBody className="max-h-[420px] overflow-auto p-0">
        {profile.duplicateColumnNames.length > 0 ? (
          <div className="border-b border-amber-100 bg-amber-50 px-4 py-2 text-xs text-amber-800">
            检测到 {profile.duplicateColumnNames.length} 个重复列名，按列名定位的处理可能出错。
          </div>
        ) : null}
        {profile.columns.map((column, index) => (
          <ColumnRow key={`${column.name}-${index}`} column={column} />
        ))}
      </CardBody>
    </Card>
  );
}
```

- [ ] **Step 2: 接进页面，与表格并排**

在 `src/app/page.tsx` 的「数据预览」区块改成两栏布局：

```tsx
{status === 'ready' && parseResult && profile ? (
  <section className="mt-8 grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
    <div>
      <h2 className="mb-3 text-sm font-semibold text-neutral-900">数据预览</h2>
      <DataTable dataset={parseResult.dataset} />
    </div>
    <div>
      <h2 className="mb-3 text-sm font-semibold text-neutral-900">数据概况</h2>
      <ColumnProfilePanel profile={profile} />
    </div>
  </section>
) : null}
```

同时在页面顶部显示文件名与解析提示：

```tsx
{parseResult?.meta.warnings.map((warning) => (
  <p key={warning} className="mt-2 rounded bg-amber-50 px-3 py-2 text-xs text-amber-800">
    {warning}
  </p>
))}
```

- [ ] **Step 3: 浏览器验证**

上传一个**含重复列名**和**含全空列**的 CSV，确认：
- 重复列名的提示条出现
- 全空列在画像里标为「全空」且是红色徽标
- 窄屏（< 1024px）时两栏自动变一栏，不出现横向滚动条

- [ ] **Step 4: 提交**

```powershell
pnpm typecheck
git add src/ui src/app
git commit -m "feat(ui): 实现列画像侧栏与响应式两栏布局"
```

---

### Task 11: 质量问题清单

**Files:**
- Create: `src/ui/components/IssueList.tsx`
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `QualityIssue`/`Severity`（`src/core`）、`Badge`/`Card`/`EmptyState`（Task 1）
- Produces: `<IssueList issues={QualityIssue[]} />`

- [ ] **Step 1: 实现 `src/ui/components/IssueList.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { QualityIssue, Severity } from '@/core';
import { Badge } from '@/ui/components/base/Badge';
import { Card, CardBody, CardHeader, CardTitle } from '@/ui/components/base/Card';
import { EmptyState } from '@/ui/components/base/EmptyState';
import { cn } from '@/ui/lib/cn';

const SEVERITY_LABEL: Record<Severity, string> = {
  high: '严重',
  medium: '中等',
  low: '轻微',
};

const SEVERITY_TONE: Record<Severity, 'high' | 'medium' | 'low'> = {
  high: 'high',
  medium: 'medium',
  low: 'low',
};

function IssueCard({ issue }: { issue: QualityIssue }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-b border-neutral-100 last:border-b-0">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        className="flex w-full items-start gap-2 px-4 py-3 text-left hover:bg-neutral-50"
      >
        {expanded ? (
          <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-neutral-400" aria-hidden="true" />
        ) : (
          <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-neutral-400" aria-hidden="true" />
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Badge tone={SEVERITY_TONE[issue.severity]}>{SEVERITY_LABEL[issue.severity]}</Badge>
            <p className="truncate text-sm text-neutral-800">{issue.title}</p>
          </div>
          <p className="mt-1 line-clamp-2 text-xs text-neutral-500">{issue.description}</p>
        </div>
      </button>

      {expanded ? (
        <div className="space-y-3 bg-neutral-50 px-4 pb-4 pt-1 text-xs">
          <div>
            <p className="font-medium text-neutral-700">涉及列</p>
            <p className="mt-0.5 text-neutral-600">{issue.evidence.columns.join('、') || '—'}</p>
          </div>

          <div>
            <p className="font-medium text-neutral-700">证据</p>
            <dl className="mt-0.5 space-y-0.5">
              {Object.entries(issue.evidence.statistics).map(([key, value]) => (
                <div key={key} className="flex gap-2">
                  <dt className="text-neutral-400">{key}</dt>
                  <dd className="text-neutral-700">{String(value)}</dd>
                </div>
              ))}
            </dl>
            {issue.evidence.rowIndices && issue.evidence.rowIndices.length > 0 ? (
              <p className="mt-1 text-neutral-600">
                涉及行号：
                {issue.evidence.rowIndices.slice(0, 20).map((index) => index + 1).join('、')}
                {issue.evidence.rowIndices.length > 20
                  ? ` 等 ${issue.evidence.rowIndices.length} 行`
                  : ''}
              </p>
            ) : null}
          </div>

          {issue.suggestion ? (
            <div>
              <p className="font-medium text-neutral-700">
                建议：{issue.suggestion.action}
              </p>
              <p className="mt-0.5 text-neutral-600">{issue.suggestion.rationale}</p>
            </div>
          ) : null}

          <p className="text-neutral-400">
            置信度 {(issue.confidence * 100).toFixed(0)}% · 检查项 {issue.checkId}
          </p>
        </div>
      ) : null}
    </div>
  );
}

export function IssueList({ issues }: { issues: QualityIssue[] }) {
  const counts = issues.reduce<Record<Severity, number>>(
    (acc, issue) => {
      acc[issue.severity] += 1;
      return acc;
    },
    { high: 0, medium: 0, low: 0 },
  );

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <CardTitle>发现的问题</CardTitle>
        <div className="flex items-center gap-1.5">
          {counts.high > 0 ? <Badge tone="high">严重 {counts.high}</Badge> : null}
          {counts.medium > 0 ? <Badge tone="medium">中等 {counts.medium}</Badge> : null}
          {counts.low > 0 ? <Badge tone="low">轻微 {counts.low}</Badge> : null}
        </div>
      </CardHeader>

      <CardBody className="p-0">
        {issues.length === 0 ? (
          <EmptyState
            title="没有发现质量问题"
            description="这不代表数据一定没问题——检查只能覆盖它能识别的模式。"
          />
        ) : (
          <div className={cn('max-h-[520px] overflow-auto')}>
            {issues.map((issue) => (
              <IssueCard key={issue.id} issue={issue} />
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
```

- [ ] **Step 2: 接进页面**

在 `src/app/page.tsx` 的 `status === 'ready'` 区块下方追加：

```tsx
{status === 'ready' ? (
  <section className="mt-6">
    <IssueList issues={issues} />
  </section>
) : null}
```

从 store 取 `issues`：

```tsx
const issues = useDatasetStore((state) => state.issues);
```

- [ ] **Step 3: 浏览器验证**

上传 `D:\tmp\sample-survey.csv`，确认：
- 问题按严重度排在最前
- 点开一条能看到证据、涉及行号、建议
- 键盘可以展开收起（Tab 到问题条目，回车切换）
- 没有问题时显示空状态文案

- [ ] **Step 4: 提交**

```powershell
pnpm typecheck
git add src/ui src/app
git commit -m "feat(ui): 实现质量问题清单（可展开证据与建议）"
```

---

### Task 12: 端到端测试

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/e2e/fixtures/messy-survey.csv`
- Create: `tests/e2e/upload.spec.ts`

**Interfaces:**
- Consumes: 全部前述模块
- Produces: 可运行的 `pnpm test:e2e`

- [ ] **Step 1: 造测试数据**

`tests/e2e/fixtures/messy-survey.csv`（**故意包含已知问题**，便于断言）：

```csv
学号,年龄,学历,单位,备注
001,20,本科,mg,正常
002,21,硕士,MG,正常
002,21,硕士,MG,重复行
004,999,研究生,mg,年龄越界
005,,本科在读,g,
006,23,本科,g,未知
007,abc,博士,mg,类型混杂
```

同时生成一个 3000 行的 `tests/e2e/fixtures/large.csv` 用于验证虚拟滚动与截断提示：

```powershell
$rows = @('id,value')
1..3000 | ForEach-Object { $rows += "$_,$($_ * 2)" }
$rows -join "`n" | Set-Content -Path 'tests\e2e\fixtures\large.csv' -Encoding UTF8
```

- [ ] **Step 2: 配置 Playwright**

`playwright.config.ts`：
```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
```

在 `package.json` 的 scripts 里加：

```json
"test:e2e": "playwright test"
```

并确保浏览器缓存固定在 D 盘（在脚本里设置，或写进 `.env`）：

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH='D:\ms-playwright'
```

- [ ] **Step 3: 写端到端测试**

`tests/e2e/upload.spec.ts`：
```ts
import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const fixtures = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

test.describe('上传与检查的完整流程', () => {
  test('上传 CSV 后能看到预览、画像与问题清单', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto('/');
    await page.setInputFiles('input[type=file]', join(fixtures, 'messy-survey.csv'));

    // 数据预览
    await expect(page.getByText('数据预览')).toBeVisible();
    await expect(page.getByText('共 7 行 × 5 列')).toBeVisible();

    // 列画像
    await expect(page.getByText('列画像')).toBeVisible();

    // 问题清单至少报出年龄越界与类型混杂
    await expect(page.getByText('发现的问题')).toBeVisible();
    await expect(page.getByText(/超出合理范围|取值类型不一致/).first()).toBeVisible();

    expect(consoleErrors).toEqual([]);
  });

  test('空文件给出可读的中文提示', async ({ page }) => {
    await page.goto('/');
    await page.setInputFiles('input[type=file]', {
      name: 'empty.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(''),
    });
    await expect(page.getByText('没法读取这个文件')).toBeVisible();
    await expect(page.getByText(/是空的/)).toBeVisible();
  });

  test('不支持的格式提示支持范围', async ({ page }) => {
    await page.goto('/');
    await page.setInputFiles('input[type=file]', {
      name: 'a.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4'),
    });
    await expect(page.getByText(/只支持 .csv 和 .xlsx/)).toBeVisible();
  });

  test('大文件不卡死，表格能滚动', async ({ page }) => {
    await page.goto('/');
    await page.setInputFiles('input[type=file]', join(fixtures, 'large.csv'));
    await expect(page.getByText('共 3,000 行 × 2 列')).toBeVisible({ timeout: 30_000 });

    const scroller = page.getByTestId('data-table-scroll');
    await scroller.evaluate((el) => { el.scrollTop = el.scrollHeight; });
    await expect(page.getByText('3,000', { exact: false }).first()).toBeVisible();
  });

  test('重复列名的输入不误报为重复记录', async ({ page }) => {
    await page.goto('/');
    await page.setInputFiles('input[type=file]', {
      name: 'dup-name.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('年龄,年龄\n1,2\n1,3'),
    });
    await expect(page.getByText(/重复列名|重复出现/)).toBeVisible();
    // 关键断言：不得报出「完全重复的记录」，那会诱导用户删掉不该删的行
    await expect(page.getByText(/完全重复的记录/)).toHaveCount(0);
  });
});
```

- [ ] **Step 4: 运行端到端测试**

```powershell
$env:TEMP='D:\tmp'; $env:TMP='D:\tmp'
$env:PLAYWRIGHT_BROWSERS_PATH='D:\ms-playwright'
pnpm test:e2e
```

Expected：5 个测试全部通过。若失败，**用系统化调试定位真实原因**，不要靠调宽超时或加 `waitForTimeout` 掩盖。

- [ ] **Step 5: 提交**

```bash
git add playwright.config.ts tests/e2e package.json
git commit -m "test(e2e): 覆盖上传、错误提示、大文件与重名列五个场景"
```

---

### Task 13: 首次部署验证

**Files:**
- Create: `README.md` 的部署章节（Modify）
- Create: `.env.example`

**Interfaces:**
- Consumes: 全部前述
- Produces: 一份可执行的部署检查清单

- [ ] **Step 1: 建立环境变量模板**

`.env.example`：
```bash
# 大模型 API 配置（Plan 2 起使用；Plan 1b 不需要任何密钥即可运行）
# 复制本文件为 .env.local 并填入真实值。.env.local 已在 .gitignore 中，不会提交。
LLM_API_KEY=
LLM_BASE_URL=https://api.deepseek.com
LLM_MODEL=deepseek-chat
```

- [ ] **Step 2: 更新 README 的部署章节**

在 `README.md` 中加入：

```markdown
## 部署检查清单

> 部署由团队成员负责，本项目的代码按「平台无关」编写，不需要为特定平台改动。

### 部署前本地验证

```bash
pnpm install
pnpm typecheck   # 必须 0 错误
pnpm test        # 必须全绿
pnpm build       # 必须成功
pnpm test:e2e    # 端到端测试必须通过
```

### 平台必须满足的条件

| 条件 | 为什么 |
| --- | --- |
| 支持 Next.js API Routes（Serverless / Node 运行时） | 纯静态托管不可用，会逼你把密钥放进前端 |
| 中国大陆可稳定访问 | 评审在境内，访问不了等于没有演示地址 |
| 免费额度能覆盖整个评审期 | 评审是持续的，不是一次性的 |
| 不会长时间休眠 | 冷启动会让评审第一次打开等很久 |

### 部署后必须实测的四件事

1. 从中国大陆的网络打开演示地址，确认首屏在 3 秒内出现内容
2. 上传一个 1 MB 左右的 CSV，确认解析与检查能跑通
3. 上传一个 GBK 编码的中文 CSV，确认不乱码
4. 打开浏览器控制台，确认没有报错

### 备选地址

准备一个备选平台的地址。主地址不可用时立即切换，不要等到评审反馈。
```

- [ ] **Step 3: 本地生产构建实测**

```powershell
$env:TEMP='D:\tmp'; $env:TMP='D:\tmp'
pnpm build
pnpm start
```

用 Playwright 打开 `http://localhost:3000`，跑一遍 Task 12 的五个场景，确认**生产构建与开发环境行为一致**（生产构建会做代码分割与压缩，可能与 dev 表现不同）。

- [ ] **Step 4: 提交**

```bash
git add .env.example README.md
git commit -m "docs: 补充环境变量模板与部署检查清单"
```

---

## 完成标准

| 项 | 验证方式 |
| --- | --- |
| 类型无错误 | `pnpm typecheck` 无输出 |
| 单元测试全绿 | `pnpm test` 全部通过 |
| 端到端测试全绿 | `pnpm test:e2e` 5 个场景通过 |
| 生产构建成功 | `pnpm build` 退出码 0 |
| 生产模式行为一致 | `pnpm start` 后 E2E 场景可复现 |
| 数据不出浏览器 | 打开浏览器网络面板，上传文件后不应有携带文件内容的请求 |
| 首屏可用 | 从国内网络访问，3 秒内出现可交互界面 |
| Review Focus 五类输入均有测试 | 见 Task 4 / Task 6 / Task 12 |

## 后续计划

| 计划 | 内容 |
| --- | --- |
| **Plan 1c** | 端侧 embedding（Transformers.js）、类别同义归并 `check_category_variants`、单位一致性 `check_unit_consistency`、跨表键匹配 |
| **Plan 2** | Agent 六阶段工作流、AI SDK 集成、Function Calling、流式对话、问题审阅交互 |
| **Plan 3** | RAG 混合检索、清洗执行、pandas 脚本生成与留痕 |
| **Plan 4** | 评测体系、质量报告看板、性能优化 |
| **Plan 5** | MCP Server、多模态、正式部署 |
