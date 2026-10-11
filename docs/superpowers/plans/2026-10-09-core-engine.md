# 核心检查引擎实施计划（Plan 1a）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立 Next.js 工程骨架，并实现平台无关的数据质量检查引擎 `core/`（值规范化、统计原语、列画像、5 个基础检查项），全部带单元测试。

**Architecture:** `core/` 是一个不依赖任何运行时 API 的纯 TypeScript 包，浏览器与未来的 MCP Server 共用同一份实现。所有检查以纯函数形式暴露，输入数据、输出结构化问题列表，便于单独测试与复用。工程骨架采用 Next.js 16 App Router + TypeScript strict，测试用 Vitest。

**Tech Stack:** Next.js 16 · React 19 · TypeScript 5（strict）· Tailwind CSS 4 · Vitest · pnpm

**Spec:** `docs/superpowers/specs/2026-10-09-data-quality-agent-design.md`

## Global Constraints

- Node.js 版本下限：**24.0.0**（本机实测 v24.18.0）
- 包管理器：**pnpm**（本机实测 12.4.2），禁止使用 npm/yarn 安装依赖
- TypeScript 必须开启 `strict: true`，且开启 `noUncheckedIndexedAccess: true`
- `src/core/` 下**禁止**引用任何浏览器 API（`window`/`document`/`File`/`Blob`）与 Node API（`fs`/`path`/`process`）
- 所有注释与提交信息使用**中文**
- 所有源码文件使用 UTF-8 编码，换行符 LF
- 每次提交前必须 `pnpm test` 全绿
- 依赖安装一律落 D 盘；执行 pnpm 前置 `$env:TEMP='D:\tmp'`（本机 C 盘空间紧张）

## Review Focus

以下五类输入是设计文档隐含要求、但容易被实现忽略的失败模式。每一条都已在其归属任务的测试步骤中固定：

1. **空数据集**（0 行，或仅有表头）——应返回空画像与空问题列表，不得抛异常或产生 `NaN`
2. **全列缺失**（某一列 100% 为空）——类型应推断为 `empty`，不应被误判为 `category` 或 `number`
3. **单行数据集**——分位数、标准差、IQR 边界在 n=1 时不得返回 `NaN` 或 `Infinity`
4. **重复列名**（CSV 中两个同名列）——画像与检查不得互相覆盖，必须报为问题
5. **超出安全整数范围的数值**（如 20 位数字 ID）——不得被当作数值参与统计，应推断为文本或标识列

---

## 文件结构

| 文件 | 职责 |
| --- | --- |
| `package.json` | 依赖与脚本 |
| `tsconfig.json` | TypeScript strict 配置 |
| `next.config.ts` | Next.js 配置 |
| `postcss.config.mjs` | Tailwind 4 的 PostCSS 接入 |
| `vitest.config.ts` | 测试配置 |
| `src/app/layout.tsx` | 根布局 |
| `src/app/page.tsx` | 首页（本计划只放占位内容，UI 在 Plan 1b） |
| `src/app/globals.css` | Tailwind 入口 |
| `src/core/types.ts` | 全部公共类型契约 |
| `src/core/normalize/index.ts` | 值规范化 |
| `src/core/stats/index.ts` | 统计原语 |
| `src/core/profile/index.ts` | 列画像与数据集画像 |
| `src/core/checks/missing.ts` | 缺失检查 |
| `src/core/checks/duplicates.ts` | 重复检查 |
| `src/core/checks/typeConsistency.ts` | 类型一致性检查 |
| `src/core/checks/outliers.ts` | 异常值检查 |
| `src/core/checks/rangeRules.ts` | 值域规则检查 |
| `src/core/checks/index.ts` | 检查调度器与注册表 |
| `src/core/index.ts` | 包出口 |
| `tests/` 下同名 `.test.ts` | 每个模块的单元测试 |

---

### Task 1: 工程骨架

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.ts`
- Create: `postcss.config.mjs`
- Create: `vitest.config.ts`
- Create: `src/app/layout.tsx`
- Create: `src/app/page.tsx`
- Create: `src/app/globals.css`
- Create: `eslint.config.mjs`
- Create: `prettier.config.mjs`

**Interfaces:**
- Consumes: 无
- Produces: 可运行的 `pnpm dev`、可执行的 `pnpm test`

- [ ] **Step 1: 创建 `package.json`**

```json
{
  "name": "research-data-quality-agent",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=24.0.0" },
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "format": "prettier --write .",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "next": "^16.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@eslint/eslintrc": "^3.0.0",
    "@tailwindcss/postcss": "^4.0.0",
    "@types/node": "^24.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "eslint": "^9.0.0",
    "eslint-config-next": "^16.0.0",
    "postcss": "^8.4.0",
    "prettier": "^3.0.0",
    "tailwindcss": "^4.0.0",
    "typescript": "^5.6.0",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 2: 创建 `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "ES2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: 创建 `next.config.ts`、`postcss.config.mjs`、`vitest.config.ts`**

`next.config.ts`：
```ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
```

`postcss.config.mjs`：
```js
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};
```

`vitest.config.ts`：
```ts
import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    // core 是纯函数包，用 node 环境即可；UI 测试在 Plan 1b 单独配置
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: { '@': resolve(import.meta.dirname, 'src') },
  },
});
```

- [ ] **Step 3b: 创建 `eslint.config.mjs` 与 `prettier.config.mjs`**

`eslint.config.mjs`：
```js
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat({
  baseDirectory: dirname(fileURLToPath(import.meta.url)),
});

export default [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    ignores: ['.next/**', 'node_modules/**', 'coverage/**'],
  },
  {
    rules: {
      // core 包的纯净性由人工与测试保证，这里额外提示可能的误用
      'no-restricted-imports': [
        'warn',
        {
          paths: [
            { name: 'fs', message: 'core 包不得依赖 Node API' },
            { name: 'path', message: 'core 包不得依赖 Node API' },
          ],
        },
      ],
    },
  },
];
```

> 该配置依赖 `@eslint/eslintrc`，需在 Step 5 安装依赖时一并加入 devDependencies。

`prettier.config.mjs`：
```js
/** @type {import('prettier').Config} */
export default {
  semi: true,
  singleQuote: true,
  trailingComma: 'all',
  printWidth: 100,
  tabWidth: 2,
  endOfLine: 'lf',
  overrides: [
    {
      files: '*.md',
      options: { proseWrap: 'preserve' },
    },
  ],
};
```

- [ ] **Step 4: 创建 App Router 最小页面**

`src/app/globals.css`：
```css
@import 'tailwindcss';
```

`src/app/layout.tsx`：
```tsx
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '科研数据质量治理 Agent',
  description: '把数据清洗变成一份可复现、可追溯的处理记录',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-neutral-50 text-neutral-900 antialiased">
        {children}
      </body>
    </html>
  );
}
```

`src/app/page.tsx`：
```tsx
export default function HomePage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-2xl font-semibold">科研数据质量治理 Agent</h1>
      <p className="mt-3 text-neutral-600">
        工程骨架已就绪。界面将在下一阶段实现。
      </p>
    </main>
  );
}
```

- [ ] **Step 5: 安装依赖并验证**

```powershell
$env:TEMP='D:\tmp'; $env:TMP='D:\tmp'
pnpm install
pnpm typecheck
pnpm build
```

Expected：`pnpm install` 成功；`pnpm typecheck` 无错误；`pnpm build` 输出 `✓ Compiled successfully`。

- [ ] **Step 6: 验证测试框架可用**

创建临时冒烟测试 `src/core/smoke.test.ts`：
```ts
import { describe, it, expect } from 'vitest';

describe('工具链冒烟测试', () => {
  it('Vitest 可运行', () => {
    expect(1 + 1).toBe(2);
  });
});
```

```powershell
pnpm test
```

Expected：`1 passed`。

验证通过后**删除**该文件（Task 2 会建立真正的测试）。

- [ ] **Step 7: 提交**

```bash
git add package.json pnpm-lock.yaml tsconfig.json next.config.ts postcss.config.mjs vitest.config.ts eslint.config.mjs prettier.config.mjs src/app
git commit -m "chore: 初始化 Next.js 工程骨架与测试工具链"
```

---

### Task 2: 公共类型契约

**Files:**
- Create: `src/core/types.ts`
- Create: `src/core/types.test.ts`

**Interfaces:**
- Consumes: 无
- Produces: 后续所有任务依赖的类型 —— `CellValue`、`ColumnData`、`Dataset`、`ColumnType`、`NumericStats`、`ColumnProfile`、`DatasetProfile`、`Severity`、`QualityIssue`、`IssueEvidence`、`IssueSuggestion`、`CheckFn`

- [ ] **Step 1: 写失败测试**

`src/core/types.test.ts`：
```ts
import { describe, it, expect } from 'vitest';
import { createEmptyDataset, isMissingValue } from './types';

describe('类型契约辅助函数', () => {
  it('空数据集的行列数均为 0', () => {
    const ds = createEmptyDataset();
    expect(ds.rowCount).toBe(0);
    expect(ds.columns).toEqual([]);
  });

  it('null、undefined、空串、纯空白串都算缺失', () => {
    expect(isMissingValue(null)).toBe(true);
    expect(isMissingValue(undefined)).toBe(true);
    expect(isMissingValue('')).toBe(true);
    expect(isMissingValue('   ')).toBe(true);
  });

  it('0 和 false 不算缺失', () => {
    // 这是关键边界：0 和 false 是有效取值，不能当缺失处理
    expect(isMissingValue(0)).toBe(false);
    expect(isMissingValue(false)).toBe(false);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```powershell
pnpm test src/core/types.test.ts
```

Expected：FAIL，报错 `Failed to resolve import "./types"`。

- [ ] **Step 3: 实现 `src/core/types.ts`**

```ts
/**
 * core 包的公共类型契约。
 * 本文件不得引用任何浏览器或 Node 专有 API。
 */

/** 规范化后的单元格取值。null 表示缺失。 */
export type CellValue = string | number | boolean | null;

/** 推断出的列类型 */
export type ColumnType =
  | 'number'
  | 'category'
  | 'text'
  | 'boolean'
  | 'empty'
  | 'mixed';

/** 一列的数据 */
export interface ColumnData {
  /** 列名 */
  name: string;
  /** 与 Dataset.rowCount 等长，缺失位置为 null */
  values: CellValue[];
}

/** 一个数据集 */
export interface Dataset {
  columns: ColumnData[];
  rowCount: number;
}

/** 数值列的统计量 */
export interface NumericStats {
  min: number;
  max: number;
  mean: number;
  q1: number;
  median: number;
  q3: number;
  stdDev: number;
}

/** 单列画像 */
export interface ColumnProfile {
  name: string;
  type: ColumnType;
  missingCount: number;
  missingRate: number;
  uniqueCount: number;
  /** 仅分类/布尔列填充 */
  valueDistribution?: Record<string, number>;
  /** 仅数值列填充 */
  numeric?: NumericStats;
  /** 供人阅读的样例值，最多 5 个 */
  samples: string[];
}

/** 数据集画像 */
export interface DatasetProfile {
  rowCount: number;
  columnCount: number;
  columns: ColumnProfile[];
  /** 出现多次的列名（CSV 表头重复时常见），无重复时为空数组 */
  duplicateColumnNames: string[];
}

/** 问题严重度 */
export type Severity = 'high' | 'medium' | 'low';

/** 问题证据 */
export interface IssueEvidence {
  columns: string[];
  /** 涉及的行下标（从 0 开始），可能为空 */
  rowIndices?: number[];
  /** 支撑该问题的量化指标 */
  statistics: Record<string, number | string>;
}

/** 建议的处理方式 */
export interface IssueSuggestion {
  /** 动作标识，如 fill_missing / merge_categories */
  action: string;
  params: Record<string, unknown>;
  /** 为什么建议这么做 */
  rationale: string;
}

/** 一个数据质量问题 */
export interface QualityIssue {
  /** 全局唯一，由 checkId + 随机后缀生成 */
  id: string;
  checkId: string;
  severity: Severity;
  title: string;
  description: string;
  evidence: IssueEvidence;
  suggestion?: IssueSuggestion;
  /** 0–1，检查的置信度 */
  confidence: number;
}

/** 检查函数的统一签名 */
export type CheckFn = (dataset: Dataset) => QualityIssue[];

/** 创建一个空数据集 */
export function createEmptyDataset(): Dataset {
  return { columns: [], rowCount: 0 };
}

/**
 * 判断一个取值是否应视为缺失。
 * 注意：0 与 false 是有效取值，不算缺失。
 */
export function isMissingValue(value: CellValue | undefined): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  return false;
}
```

- [ ] **Step 4: 运行测试确认通过**

```powershell
pnpm test src/core/types.test.ts
```

Expected：PASS，3 个测试通过。

- [ ] **Step 5: 提交**

```bash
git add src/core/types.ts src/core/types.test.ts
git commit -m "feat(core): 定义公共类型契约与缺失值判定"
```

---

### Task 3: 值规范化

**Files:**
- Create: `src/core/normalize/index.ts`
- Create: `src/core/normalize/index.test.ts`

**Interfaces:**
- Consumes: `CellValue`（来自 Task 2）
- Produces: `toHalfWidth(s: string): string`、`normalizeText(s: string): string`、`normalizeKey(value: CellValue): string`

- [ ] **Step 1: 写失败测试**

`src/core/normalize/index.test.ts`：
```ts
import { describe, it, expect } from 'vitest';
import { toHalfWidth, normalizeText, normalizeKey } from './index';

describe('toHalfWidth', () => {
  it('全角字母数字转半角', () => {
    expect(toHalfWidth('ＭＧ１２３')).toBe('MG123');
  });

  it('全角空格转半角空格', () => {
    expect(toHalfWidth('a\u3000b')).toBe('a b');
  });

  it('中文汉字不受影响', () => {
    expect(toHalfWidth('本科')).toBe('本科');
  });
});

describe('normalizeText', () => {
  it('去首尾空白并压缩内部连续空白', () => {
    expect(normalizeText('  本  科  ')).toBe('本 科');
  });

  it('全角转半角后归一', () => {
    expect(normalizeText('ＭＧ')).toBe('MG');
  });

  it('不改变大小写（大小写是否等价由调用方决定）', () => {
    expect(normalizeText('Mg')).toBe('Mg');
  });

  it('去除零宽字符与不可见字符', () => {
    // 中文数据从网页复制时经常混入零宽空格 U+200B
    expect(normalizeText('本科\u200B')).toBe('本科');
  });
});

describe('normalizeKey', () => {
  it('用于分组比较时忽略大小写', () => {
    expect(normalizeKey('MG')).toBe(normalizeKey('mg'));
  });

  it('null 归一为空串', () => {
    expect(normalizeKey(null)).toBe('');
  });

  it('数字与等值字符串归一结果一致', () => {
    expect(normalizeKey(42)).toBe(normalizeKey('42'));
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```powershell
pnpm test src/core/normalize
```

Expected：FAIL，`Failed to resolve import "./index"`。

- [ ] **Step 3: 实现 `src/core/normalize/index.ts`**

```ts
import type { CellValue } from '../types';
import { isMissingValue } from '../types';

/** 零宽与方向控制字符，中文数据从网页复制时常见 */
const INVISIBLE_CHARS = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g;

/**
 * 全角转半角。
 * 覆盖全角空格（U+3000）与全角 ASCII 区（U+FF01–U+FF5E）。
 */
export function toHalfWidth(input: string): string {
  let out = '';
  for (const ch of input) {
    const code = ch.codePointAt(0);
    if (code === undefined) continue;
    if (code === 0x3000) {
      out += ' ';
    } else if (code >= 0xff01 && code <= 0xff5e) {
      out += String.fromCodePoint(code - 0xfee0);
    } else {
      out += ch;
    }
  }
  return out;
}

/**
 * 通用文本归一：去不可见字符 → 全角转半角 → 去首尾空白 → 压缩内部连续空白。
 * 不改变大小写——大小写是否等价取决于具体场景，交由调用方决定。
 */
export function normalizeText(input: string): string {
  return toHalfWidth(input.replace(INVISIBLE_CHARS, ''))
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * 用于分组与比较的归一化键：在 normalizeText 基础上再统一小写。
 * 缺失值统一映射为空串。
 */
export function normalizeKey(value: CellValue | undefined): string {
  if (isMissingValue(value)) return '';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return normalizeText(value).toLowerCase();
}
```

- [ ] **Step 4: 运行测试确认通过**

```powershell
pnpm test src/core/normalize
```

Expected：PASS，9 个测试通过。

- [ ] **Step 5: 提交**

```bash
git add src/core/normalize
git commit -m "feat(core): 实现值规范化（全角、空白、不可见字符）"
```

---

### Task 4: 统计原语

**Files:**
- Create: `src/core/stats/index.ts`
- Create: `src/core/stats/index.test.ts`

**Interfaces:**
- Consumes: 无
- Produces: `quantile(sorted: number[], p: number): number`、`medianOf(values: number[]): number`、`meanOf(values: number[]): number`、`stdDevOf(values: number[]): number`、`iqrBounds(values: number[], k?: number): { lower: number; upper: number }`、`zScoresOf(values: number[]): number[]`、`modifiedZScoresOf(values: number[]): number[]`

**关键约束**：所有函数在 `n === 0` 或 `n === 1` 时**不得返回 `NaN` 或 `Infinity`**（见 Review Focus 第 3 条）。

- [ ] **Step 1: 写失败测试**

`src/core/stats/index.test.ts`：
```ts
import { describe, it, expect } from 'vitest';
import {
  quantile,
  medianOf,
  meanOf,
  stdDevOf,
  iqrBounds,
  zScoresOf,
  modifiedZScoresOf,
} from './index';

describe('quantile', () => {
  it('中位数取中间值', () => {
    expect(quantile([1, 2, 3, 4, 5], 0.5)).toBe(3);
  });

  it('偶数个元素时线性插值', () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
  });

  it('边界 p=0 与 p=1', () => {
    expect(quantile([5, 1, 3], 0)).toBe(1);
    expect(quantile([5, 1, 3], 1)).toBe(5);
  });

  it('空数组返回 0，不返回 NaN', () => {
    expect(quantile([], 0.5)).toBe(0);
  });

  it('单元素数组任何分位数都是该元素', () => {
    expect(quantile([7], 0.25)).toBe(7);
    expect(quantile([7], 0.75)).toBe(7);
  });

  it('输入无需预排序', () => {
    expect(quantile([3, 1, 2], 0.5)).toBe(2);
  });
});

describe('meanOf / medianOf / stdDevOf', () => {
  it('均值正确', () => {
    expect(meanOf([1, 2, 3, 4])).toBe(2.5);
  });

  it('空数组均值为 0', () => {
    expect(meanOf([])).toBe(0);
  });

  it('单元素标准差为 0，不是 NaN', () => {
    expect(stdDevOf([5])).toBe(0);
  });

  it('空数组标准差为 0', () => {
    expect(stdDevOf([])).toBe(0);
  });

  it('标准差为总体标准差', () => {
    // [2,4,4,4,5,5,7,9] 的总体标准差为 2
    expect(stdDevOf([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2, 10);
  });
});

describe('iqrBounds', () => {
  it('按 1.5 倍 IQR 计算上下界', () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 100];
    const { lower, upper } = iqrBounds(values);
    expect(lower).toBeLessThan(1);
    expect(upper).toBeGreaterThan(9);
    expect(upper).toBeLessThan(100);
  });

  it('全部相同值时上下界等于该值，不为 NaN', () => {
    const { lower, upper } = iqrBounds([5, 5, 5, 5]);
    expect(lower).toBe(5);
    expect(upper).toBe(5);
  });

  it('单元素时上下界等于该值', () => {
    const { lower, upper } = iqrBounds([3]);
    expect(lower).toBe(3);
    expect(upper).toBe(3);
  });
});

describe('zScoresOf', () => {
  it('标准分数之和约为 0', () => {
    const z = zScoresOf([1, 2, 3, 4, 5]);
    expect(z.reduce((a, b) => a + b, 0)).toBeCloseTo(0, 10);
  });

  it('标准差为 0 时全部返回 0，不返回 NaN', () => {
    expect(zScoresOf([5, 5, 5])).toEqual([0, 0, 0]);
  });

  it('空数组返回空数组', () => {
    expect(zScoresOf([])).toEqual([]);
  });
});

describe('modifiedZScoresOf', () => {
  it('以中位数与 MAD 为基准，个别极端值不会掩盖其他异常', () => {
    // 注意：MAD 必须大于 0 才有意义。若超过半数取值相同，MAD 会退化为 0。
    const values = [10, 11, 12, 13, 14, 15, 16, 1000];
    const mz = modifiedZScoresOf(values);
    const lastIndex = values.length - 1;
    expect(Math.abs(mz[lastIndex] ?? 0)).toBeGreaterThan(3.5);
  });

  it('多数取值相同时不把中间值误判为异常', () => {
    const values = [10, 11, 12, 13, 14, 15, 16, 1000];
    const mz = modifiedZScoresOf(values);
    // 前 7 个正常值都不应超过阈值
    for (let i = 0; i < values.length - 1; i += 1) {
      expect(Math.abs(mz[i] ?? 0)).toBeLessThan(3.5);
    }
  });

  it('MAD 为 0 时全部返回 0，不返回 NaN', () => {
    expect(modifiedZScoresOf([5, 5, 5, 5])).toEqual([0, 0, 0, 0]);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```powershell
pnpm test src/core/stats
```

Expected：FAIL，`Failed to resolve import "./index"`。

- [ ] **Step 3: 实现 `src/core/stats/index.ts`**

```ts
/**
 * 统计原语。
 * 设计约定：任何函数在空输入或退化输入（全部相同、单元素）下
 * 都返回有限数值 0 或等价边界，绝不返回 NaN / Infinity。
 */

/** 升序排序的副本，不修改入参 */
function sortedCopy(values: readonly number[]): number[] {
  return [...values].sort((a, b) => a - b);
}

/**
 * 线性插值分位数。
 * @param values 任意顺序的数值数组
 * @param p 0–1 之间的分位点
 */
export function quantile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = sortedCopy(values);
  const clamped = Math.min(1, Math.max(0, p));
  const pos = (sorted.length - 1) * clamped;
  const lowerIndex = Math.floor(pos);
  const upperIndex = Math.ceil(pos);
  const lower = sorted[lowerIndex] ?? 0;
  const upper = sorted[upperIndex] ?? lower;
  if (lowerIndex === upperIndex) return lower;
  return lower + (upper - lower) * (pos - lowerIndex);
}

/** 算术平均；空数组返回 0 */
export function meanOf(values: readonly number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

/** 中位数；空数组返回 0 */
export function medianOf(values: readonly number[]): number {
  return quantile(values, 0.5);
}

/** 总体标准差；空数组与单元素均返回 0 */
export function stdDevOf(values: readonly number[]): number {
  if (values.length <= 1) return 0;
  const mean = meanOf(values);
  let acc = 0;
  for (const v of values) {
    const d = v - mean;
    acc += d * d;
  }
  const variance = acc / values.length;
  return Math.sqrt(variance);
}

/**
 * 四分位距上下界：Q1 - k*IQR 与 Q3 + k*IQR。
 * @param k 倍数，默认 1.5（Tukey 惯例）
 */
export function iqrBounds(
  values: readonly number[],
  k = 1.5,
): { lower: number; upper: number } {
  if (values.length === 0) return { lower: 0, upper: 0 };
  const q1 = quantile(values, 0.25);
  const q3 = quantile(values, 0.75);
  const iqr = q3 - q1;
  return { lower: q1 - k * iqr, upper: q3 + k * iqr };
}

/** 标准分数；标准差为 0 时全部返回 0 */
export function zScoresOf(values: readonly number[]): number[] {
  const sd = stdDevOf(values);
  if (sd === 0) return values.map(() => 0);
  const mean = meanOf(values);
  return values.map((v) => (v - mean) / sd);
}

/**
 * 修正 Z 分数（Iglewicz–Hoaglin）：以中位数为中心、MAD 为尺度。
 * 相比标准 Z 分数，个别极端值不会抬高标准差从而掩盖其他异常。
 */
export function modifiedZScoresOf(values: readonly number[]): number[] {
  if (values.length === 0) return [];
  const median = medianOf(values);
  const deviations = values.map((v) => Math.abs(v - median));
  const mad = medianOf(deviations);
  if (mad === 0) return values.map(() => 0);
  // 0.6745 是正态分布下 MAD 与标准差的换算常数
  return values.map((v) => (0.6745 * (v - median)) / mad);
}
```

- [ ] **Step 4: 运行测试确认通过**

```powershell
pnpm test src/core/stats
```

Expected：PASS，全部通过。

- [ ] **Step 5: 提交**

```bash
git add src/core/stats
git commit -m "feat(core): 实现统计原语（分位数、标准差、IQR、Z 分数）"
```

---

### Task 5: 列画像与数据集画像

**Files:**
- Create: `src/core/profile/index.ts`
- Create: `src/core/profile/index.test.ts`

**Interfaces:**
- Consumes: `Dataset`、`ColumnData`、`ColumnType`、`ColumnProfile`、`DatasetProfile`、`NumericStats`（Task 2）；`normalizeKey`（Task 3）；`quantile`/`meanOf`/`medianOf`/`stdDevOf`（Task 4）
- Produces: `inferColumnType(column: ColumnData): ColumnType`、`profileColumn(column: ColumnData): ColumnProfile`、`profileDataset(dataset: Dataset): DatasetProfile`

- [ ] **Step 1: 写失败测试**

`src/core/profile/index.test.ts`：
```ts
import { describe, it, expect } from 'vitest';
import type { ColumnData, Dataset } from '../types';
import { inferColumnType, profileColumn, profileDataset } from './index';

function col(name: string, values: ColumnData['values']): ColumnData {
  return { name, values };
}

describe('inferColumnType', () => {
  it('全部数值推断为 number', () => {
    expect(inferColumnType(col('年龄', [1, 2, 3]))).toBe('number');
  });

  it('数值字符串也推断为 number', () => {
    expect(inferColumnType(col('年龄', ['1', '2', '3']))).toBe('number');
  });

  it('布尔值推断为 boolean', () => {
    expect(inferColumnType(col('是否', [true, false, true]))).toBe('boolean');
  });

  it('重复取值少的文本推断为 category', () => {
    expect(inferColumnType(col('学历', ['本科', '硕士', '本科', '硕士']))).toBe('category');
  });

  it('取值几乎全不同的文本推断为 text', () => {
    const values = Array.from({ length: 20 }, (_, i) => `备注内容${i}`);
    expect(inferColumnType(col('备注', values))).toBe('text');
  });

  it('全部缺失推断为 empty（关键边界）', () => {
    expect(inferColumnType(col('空列', [null, null, null]))).toBe('empty');
  });

  it('数值与文本混杂推断为 mixed', () => {
    expect(inferColumnType(col('混合', [1, '未知', 3]))).toBe('mixed');
  });

  it('超长数字（超出安全整数范围）不推断为 number（关键边界）', () => {
    // 20 位学号/身份证号若被当作数值参与统计会丢失精度
    expect(inferColumnType(col('学号', ['12345678901234567890', '12345678901234567891']))).toBe(
      'text',
    );
  });
});

describe('profileColumn', () => {
  it('统计缺失数与缺失率', () => {
    const p = profileColumn(col('年龄', [1, null, 3, '']));
    expect(p.missingCount).toBe(2);
    expect(p.missingRate).toBe(0.5);
  });

  it('数值列给出统计量', () => {
    const p = profileColumn(col('年龄', [1, 2, 3, 4, 5]));
    expect(p.numeric?.min).toBe(1);
    expect(p.numeric?.max).toBe(5);
    expect(p.numeric?.median).toBe(3);
  });

  it('分类列给出取值分布，且大小写与空白差异被归并', () => {
    const p = profileColumn(col('单位', ['mg', 'MG', ' mg ', 'g']));
    expect(p.valueDistribution).toEqual({ mg: 3, g: 1 });
  });

  it('空列不崩溃，类型为 empty 且统计量为 0', () => {
    const p = profileColumn(col('空列', []));
    expect(p.type).toBe('empty');
    expect(p.missingRate).toBe(0);
    expect(p.uniqueCount).toBe(0);
  });

  it('单行数据集不产生 NaN', () => {
    const p = profileColumn(col('年龄', [25]));
    expect(p.numeric?.stdDev).toBe(0);
    expect(Number.isNaN(p.numeric?.stdDev ?? Number.NaN)).toBe(false);
  });
});

describe('profileDataset', () => {
  it('报出重复列名问题（关键边界）', () => {
    const ds: Dataset = {
      rowCount: 2,
      columns: [col('年龄', [1, 2]), col('年龄', [3, 4])],
    };
    const profile = profileDataset(ds);
    expect(profile.columns).toHaveLength(2);
    expect(profile.duplicateColumnNames).toEqual(['年龄']);
  });

  it('空数据集返回空画像', () => {
    const profile = profileDataset({ rowCount: 0, columns: [] });
    expect(profile.rowCount).toBe(0);
    expect(profile.columns).toEqual([]);
    expect(profile.duplicateColumnNames).toEqual([]);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```powershell
pnpm test src/core/profile
```

Expected：FAIL，模块不存在。

- [ ] **Step 3: 实现 `src/core/profile/index.ts`**

```ts
import type {
  CellValue,
  ColumnData,
  ColumnProfile,
  ColumnType,
  Dataset,
  DatasetProfile,
  NumericStats,
} from '../types';
import { isMissingValue } from '../types';
import { normalizeKey } from '../normalize';
import { meanOf, medianOf, quantile, stdDevOf } from '../stats';

/**
 * 超出此位数的数字串不视为数值。
 * 学号、身份证号、订单号这类标识列若被当作数值参与统计，会丢失精度并产生无意义的结果。
 */
const MAX_NUMERIC_DIGITS = 15;

/** 唯一值占比不高于该阈值、且唯一值数量不超过 MAX_CATEGORY_UNIQUE 时，判定为 category */
const CATEGORY_UNIQUE_RATIO = 0.5;
/** 分类列唯一值数量的绝对上限，避免小样本下把自由文本误判为分类 */
const MAX_CATEGORY_UNIQUE = 20;

function toNumber(value: CellValue): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return null;
    // 数字串长度超过安全范围时不作为数值，避免精度丢失
    const digits = trimmed.replace(/^[+-]/, '').replace(/\./g, '');
    if (digits.length > MAX_NUMERIC_DIGITS || !/^\d+$/.test(digits)) return null;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function isBooleanLike(value: CellValue): boolean {
  return typeof value === 'boolean';
}

/** 推断列类型 */
export function inferColumnType(column: ColumnData): ColumnType {
  const present = column.values.filter((v) => !isMissingValue(v));
  if (present.length === 0) return 'empty';

  const numericCount = present.filter((v) => toNumber(v) !== null).length;
  const booleanCount = present.filter(isBooleanLike).length;

  if (booleanCount === present.length) return 'boolean';
  if (numericCount === present.length) return 'number';
  if (numericCount > 0 || booleanCount > 0) return 'mixed';

  const uniqueKeys = new Set(present.map((v) => normalizeKey(v)));
  const ratio = uniqueKeys.size / present.length;
  const looksCategorical =
    uniqueKeys.size <= MAX_CATEGORY_UNIQUE && ratio <= CATEGORY_UNIQUE_RATIO;
  return looksCategorical ? 'category' : 'text';
}

function buildNumericStats(values: number[]): NumericStats {
  return {
    min: values.length ? Math.min(...values) : 0,
    max: values.length ? Math.max(...values) : 0,
    mean: meanOf(values),
    q1: quantile(values, 0.25),
    median: medianOf(values),
    q3: quantile(values, 0.75),
    stdDev: stdDevOf(values),
  };
}

/** 生成单列画像 */
export function profileColumn(column: ColumnData): ColumnProfile {
  const total = column.values.length;
  const present = column.values.filter((v) => !isMissingValue(v));
  const missingCount = total - present.length;
  const type = inferColumnType(column);

  const distributionKeys = present.map((v) => normalizeKey(v));
  const uniqueCount = new Set(distributionKeys).size;

  const profile: ColumnProfile = {
    name: column.name,
    type,
    missingCount,
    missingRate: total === 0 ? 0 : missingCount / total,
    uniqueCount,
    samples: present.slice(0, 5).map((v) => String(v)),
  };

  if (type === 'number') {
    profile.numeric = buildNumericStats(
      present.map((v) => toNumber(v)).filter((n): n is number => n !== null),
    );
  } else if (type === 'category' || type === 'boolean') {
    const dist: Record<string, number> = {};
    for (let i = 0; i < present.length; i += 1) {
      const key = distributionKeys[i] ?? '';
      dist[key] = (dist[key] ?? 0) + 1;
    }
    profile.valueDistribution = dist;
  }

  return profile;
}

/** 生成数据集画像 */
export function profileDataset(dataset: Dataset): DatasetProfile {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const c of dataset.columns) {
    if (seen.has(c.name)) duplicates.add(c.name);
    seen.add(c.name);
  }

  return {
    rowCount: dataset.rowCount,
    columnCount: dataset.columns.length,
    columns: dataset.columns.map(profileColumn),
    duplicateColumnNames: [...duplicates],
  };
}
```

- [ ] **Step 4: 运行测试确认通过**

```powershell
pnpm test src/core/profile
```

Expected：PASS，全部通过。

- [ ] **Step 5: 提交**

```bash
git add src/core/profile
git commit -m "feat(core): 实现列画像与数据集画像（含重复列名检测）"
```

---

### Task 6: 缺失检查

**Files:**
- Create: `src/core/checks/missing.ts`
- Create: `src/core/checks/missing.test.ts`

**Interfaces:**
- Consumes: `Dataset`、`QualityIssue`（Task 2）；`profileColumn`（Task 5）
- Produces: `checkMissing(dataset: Dataset, options?: MissingOptions): QualityIssue[]`，其中 `MissingOptions = { highThreshold?: number; lowThreshold?: number }`

- [ ] **Step 1: 写失败测试**

`src/core/checks/missing.test.ts`：
```ts
import { describe, it, expect } from 'vitest';
import type { ColumnData, Dataset } from '../types';
import { checkMissing } from './missing';

function ds(columns: ColumnData[], rowCount?: number): Dataset {
  return { columns, rowCount: rowCount ?? (columns[0]?.values.length ?? 0) };
}

describe('checkMissing', () => {
  it('完全没有缺失时不报问题', () => {
    const issues = checkMissing(ds([{ name: '年龄', values: [1, 2, 3] }]));
    expect(issues).toEqual([]);
  });

  it('缺失率超过高阈值报 high', () => {
    const issues = checkMissing(
      ds([{ name: '备注', values: [null, null, null, null, 'a'] }]),
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]?.severity).toBe('high');
    expect(issues[0]?.checkId).toBe('missing');
  });

  it('证据中包含缺失率与列名', () => {
    const issues = checkMissing(ds([{ name: '备注', values: [null, null, null, null, 'a'] }]));
    expect(issues[0]?.evidence.columns).toEqual(['备注']);
    expect(issues[0]?.evidence.statistics.missingRate).toBe(0.8);
  });

  it('全列缺失也报 high，且缺失率为 1', () => {
    const issues = checkMissing(ds([{ name: '空列', values: [null, null] }]));
    expect(issues[0]?.severity).toBe('high');
    expect(issues[0]?.evidence.statistics.missingRate).toBe(1);
  });

  it('空数据集不报问题也不崩溃', () => {
    expect(checkMissing({ columns: [], rowCount: 0 })).toEqual([]);
  });

  it('建议动作为 fill_or_drop', () => {
    const issues = checkMissing(ds([{ name: '备注', values: [null, null, null, null, 'a'] }]));
    expect(issues[0]?.suggestion?.action).toBe('fill_or_drop');
  });

  it('每个问题 id 唯一', () => {
    const issues = checkMissing(
      ds([
        { name: 'a', values: [null, null, null, null, 'x'] },
        { name: 'b', values: [null, null, null, null, 'y'] },
      ]),
    );
    expect(issues).toHaveLength(2);
    expect(issues[0]?.id).not.toBe(issues[1]?.id);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```powershell
pnpm test src/core/checks/missing
```

Expected：FAIL，模块不存在。

- [ ] **Step 3: 实现 `src/core/checks/missing.ts`**

```ts
import type { Dataset, QualityIssue } from '../types';
import { profileColumn } from '../profile';
import { createIssueId } from './id';

export interface MissingOptions {
  /** 缺失率超过该值判为 high，默认 0.5 */
  highThreshold?: number;
  /** 缺失率超过该值判为 medium，默认 0.2 */
  lowThreshold?: number;
}

/** 缺失值检查：按列统计缺失率并分级 */
export function checkMissing(dataset: Dataset, options: MissingOptions = {}): QualityIssue[] {
  const high = options.highThreshold ?? 0.5;
  const low = options.lowThreshold ?? 0.2;
  const issues: QualityIssue[] = [];

  for (const column of dataset.columns) {
    const profile = profileColumn(column);
    if (profile.missingCount === 0) continue;

    const rate = profile.missingRate;
    if (rate < low) continue;

    const severity = rate >= high ? 'high' : 'medium';
    issues.push({
      id: createIssueId('missing', column.name),
      checkId: 'missing',
      severity,
      title: `「${column.name}」存在缺失值`,
      description:
        rate === 1
          ? `该列全部 ${profile.missingCount} 个取值均为空，不携带任何信息。`
          : `该列有 ${profile.missingCount} 个缺失值，占 ${(rate * 100).toFixed(1)}%。`,
      evidence: {
        columns: [column.name],
        statistics: {
          missingCount: profile.missingCount,
          missingRate: Number(rate.toFixed(4)),
          totalRows: column.values.length,
        },
      },
      suggestion: {
        action: 'fill_or_drop',
        params: { column: column.name },
        rationale:
          rate === 1
            ? '全空列无法用于分析，建议删除或补充数据来源。'
            : '建议先判断缺失机制（完全随机 / 随机 / 非随机）再决定插补或剔除。',
      },
      confidence: 1,
    });
  }

  return issues;
}
```

- [ ] **Step 4: 创建 `src/core/checks/id.ts`**

```ts
let counter = 0;

/**
 * 生成问题 ID。
 * 采用「检查项 + 目标 + 自增序号」的形式，保证同一次运行内唯一，
 * 同时不依赖浏览器或 Node 的随机数实现，便于测试断言。
 */
export function createIssueId(checkId: string, target: string): string {
  counter += 1;
  return `${checkId}:${target}:${counter}`;
}

/** 仅供测试使用：重置自增序号 */
export function resetIssueIdCounter(): void {
  counter = 0;
}
```

- [ ] **Step 5: 运行测试确认通过**

```powershell
pnpm test src/core/checks/missing
```

Expected：PASS，7 个测试通过。

- [ ] **Step 6: 提交**

```bash
git add src/core/checks/id.ts src/core/checks/missing.ts src/core/checks/missing.test.ts
git commit -m "feat(core): 实现缺失值检查"
```

---

### Task 7: 重复检查

**Files:**
- Create: `src/core/checks/duplicates.ts`
- Create: `src/core/checks/duplicates.test.ts`

**Interfaces:**
- Consumes: `Dataset`、`QualityIssue`（Task 2）；`normalizeKey`（Task 3）；`createIssueId`（Task 6）
- Produces: `checkDuplicates(dataset: Dataset, options?: DuplicateOptions): QualityIssue[]`，其中 `DuplicateOptions = { keyColumns?: string[] }`

- [ ] **Step 1: 写失败测试**

`src/core/checks/duplicates.test.ts`：
```ts
import { describe, it, expect } from 'vitest';
import type { Dataset } from '../types';
import { checkDuplicates } from './duplicates';

function makeDataset(rows: string[][]): Dataset {
  const headers = ['姓名', '年龄'];
  return {
    rowCount: rows.length,
    columns: headers.map((name, colIndex) => ({
      name,
      values: rows.map((r) => r[colIndex] ?? null),
    })),
  };
}

describe('checkDuplicates', () => {
  it('没有重复时不报问题', () => {
    const issues = checkDuplicates(makeDataset([['张三', '20'], ['李四', '21']]));
    expect(issues).toEqual([]);
  });

  it('报出完全重复的行组', () => {
    const issues = checkDuplicates(
      makeDataset([['张三', '20'], ['李四', '21'], ['张三', '20']]),
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]?.checkId).toBe('duplicates');
  });

  it('证据中给出重复行下标', () => {
    const issues = checkDuplicates(
      makeDataset([['张三', '20'], ['李四', '21'], ['张三', '20']]),
    );
    expect(issues[0]?.evidence.rowIndices).toEqual([0, 2]);
  });

  it('忽略空白与大小写差异后仍判为重复', () => {
    const issues = checkDuplicates(makeDataset([['张三 ', '20'], [' 张三', '20']]));
    expect(issues).toHaveLength(1);
  });

  it('指定键列时只按键列判重', () => {
    const ds = makeDataset([['张三', '20'], ['张三', '21']]);
    expect(checkDuplicates(ds)).toEqual([]);
    const byKey = checkDuplicates(ds, { keyColumns: ['姓名'] });
    expect(byKey).toHaveLength(1);
  });

  it('空数据集不报问题', () => {
    expect(checkDuplicates({ columns: [], rowCount: 0 })).toEqual([]);
  });

  it('全部行相同只报一组，不报 N 组', () => {
    const issues = checkDuplicates(makeDataset([['张三', '20'], ['张三', '20'], ['张三', '20']]));
    expect(issues).toHaveLength(1);
    expect(issues[0]?.evidence.rowIndices).toEqual([0, 1, 2]);
  });

  it('可疑主键列的重复率单独成条', () => {
    const ds: Dataset = {
      rowCount: 4,
      columns: [
        { name: '学号', values: ['001', '002', '001', '003'] },
        { name: '成绩', values: ['90', '80', '70', '60'] },
      ],
    };
    const issues = checkDuplicates(ds, { keyColumns: ['学号'] });
    expect(issues[0]?.severity).toBe('high');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```powershell
pnpm test src/core/checks/duplicates
```

Expected：FAIL，模块不存在。

- [ ] **Step 3: 实现 `src/core/checks/duplicates.ts`**

```ts
import type { Dataset, QualityIssue } from '../types';
import { isMissingValue } from '../types';
import { normalizeKey } from '../normalize';
import { createIssueId } from './id';

export interface DuplicateOptions {
  /** 仅按这些列判重；缺省时使用全部列 */
  keyColumns?: string[];
}

function rowSignature(dataset: Dataset, rowIndex: number, columnNames: string[]): string {
  return columnNames
    .map((name) => {
      const column = dataset.columns.find((c) => c.name === name);
      if (!column) return '';
      return normalizeKey(column.values[rowIndex]);
    })
    .join('\u0001');
}

/** 重复记录检查 */
export function checkDuplicates(
  dataset: Dataset,
  options: DuplicateOptions = {},
): QualityIssue[] {
  if (dataset.columns.length === 0 || dataset.rowCount === 0) return [];

  const usingKey = options.keyColumns !== undefined && options.keyColumns.length > 0;
  const columnNames = usingKey
    ? (options.keyColumns ?? [])
    : dataset.columns.map((c) => c.name);

  const buckets = new Map<string, number[]>();
  for (let row = 0; row < dataset.rowCount; row += 1) {
    const signature = rowSignature(dataset, row, columnNames);
    // 全空行不参与判重，避免把大量空行报成重复
    if (signature.replace(/\u0001/g, '') === '') continue;
    const list = buckets.get(signature);
    if (list) list.push(row);
    else buckets.set(signature, [row]);
  }

  const issues: QualityIssue[] = [];
  for (const rows of buckets.values()) {
    if (rows.length < 2) continue;
    issues.push({
      id: createIssueId('duplicates', rows.join('-')),
      checkId: 'duplicates',
      severity: usingKey ? 'high' : 'medium',
      title: usingKey
        ? `主键列存在重复取值`
        : `发现 ${rows.length} 条完全重复的记录`,
      description: usingKey
        ? `按列 ${columnNames.join('、')} 判重时，有 ${rows.length} 行取值相同。若该列本应唯一，说明数据存在重复录入。`
        : `有 ${rows.length} 行在所有列上取值完全相同，通常由重复导入或合并失误造成。`,
      evidence: {
        columns: columnNames,
        rowIndices: rows,
        statistics: {
          duplicateRows: rows.length,
          totalRows: dataset.rowCount,
        },
      },
      suggestion: {
        action: 'remove_duplicates',
        params: { rowIndices: rows, keyColumns: columnNames },
        rationale: usingKey
          ? '请先确认该列是否应唯一；若应唯一，建议保留首次出现并核实其余记录来源。'
          : '建议删除重复行，保留首次出现。',
      },
      confidence: 1,
    });
  }

  return issues;
}
```

- [ ] **Step 4: 运行测试确认通过**

```powershell
pnpm test src/core/checks/duplicates
```

Expected：PASS，8 个测试通过。

- [ ] **Step 5: 提交**

```bash
git add src/core/checks/duplicates.ts src/core/checks/duplicates.test.ts
git commit -m "feat(core): 实现重复记录与主键重复检查"
```

---

### Task 8: 类型一致性检查

**Files:**
- Create: `src/core/checks/typeConsistency.ts`
- Create: `src/core/checks/typeConsistency.test.ts`

**Interfaces:**
- Consumes: `Dataset`、`QualityIssue`（Task 2）；`profileColumn`（Task 5）；`createIssueId`（Task 6）
- Produces: `checkTypeConsistency(dataset: Dataset): QualityIssue[]`

- [ ] **Step 1: 写失败测试**

`src/core/checks/typeConsistency.test.ts`：
```ts
import { describe, it, expect } from 'vitest';
import type { Dataset } from '../types';
import { checkTypeConsistency } from './typeConsistency';

function ds(name: string, values: Dataset['columns'][number]['values']): Dataset {
  return { rowCount: values.length, columns: [{ name, values }] };
}

describe('checkTypeConsistency', () => {
  it('类型统一的列不报问题', () => {
    expect(checkTypeConsistency(ds('年龄', [1, 2, 3]))).toEqual([]);
  });

  it('数值列混入文本时报问题', () => {
    const issues = checkTypeConsistency(ds('年龄', [1, 2, '未知', 4]));
    expect(issues).toHaveLength(1);
    expect(issues[0]?.checkId).toBe('type-consistency');
  });

  it('证据中列出异常取值所在行', () => {
    const issues = checkTypeConsistency(ds('年龄', [1, 2, '未知', 4]));
    expect(issues[0]?.evidence.rowIndices).toEqual([2]);
  });

  it('证据中给出异常取值本身', () => {
    const issues = checkTypeConsistency(ds('年龄', [1, 2, '未知', 4]));
    expect(issues[0]?.evidence.statistics.offendingValues).toBe('未知');
  });

  it('缺失值不算类型冲突', () => {
    expect(checkTypeConsistency(ds('年龄', [1, null, 3]))).toEqual([]);
  });

  it('全空列不报问题', () => {
    expect(checkTypeConsistency(ds('空列', [null, null]))).toEqual([]);
  });

  it('多列各自报问题', () => {
    const dataset: Dataset = {
      rowCount: 3,
      columns: [
        { name: '年龄', values: [1, 'x', 3] },
        { name: '身高', values: [170, 175, '未知'] },
      ],
    };
    expect(checkTypeConsistency(dataset)).toHaveLength(2);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```powershell
pnpm test src/core/checks/typeConsistency
```

Expected：FAIL，模块不存在。

- [ ] **Step 3: 实现 `src/core/checks/typeConsistency.ts`**

```ts
import type { CellValue, Dataset, QualityIssue } from '../types';
import { isMissingValue } from '../types';
import { inferColumnType } from '../profile';
import { createIssueId } from './id';

const MAX_NUMERIC_DIGITS = 15;

function looksNumeric(value: CellValue): boolean {
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed === '') return false;
  const digits = trimmed.replace(/^[+-]/, '').replace(/\./g, '');
  return digits.length <= MAX_NUMERIC_DIGITS && /^\d+$/.test(digits);
}

/** 类型一致性检查：识别「本应是数值的列里混入了文本」这类冲突 */
export function checkTypeConsistency(dataset: Dataset): QualityIssue[] {
  const issues: QualityIssue[] = [];

  for (const column of dataset.columns) {
    const type = inferColumnType(column);
    if (type !== 'mixed') continue;

    const present = column.values
      .map((value, index) => ({ value, index }))
      .filter((item) => !isMissingValue(item.value));

    const numeric = present.filter((item) => looksNumeric(item.value));
    const nonNumeric = present.filter((item) => !looksNumeric(item.value));

    // 少数派视为冲突方：数值占多数时，冲突的是文本
    const majorityIsNumeric = numeric.length >= nonNumeric.length;
    const offenders = majorityIsNumeric ? nonNumeric : numeric;
    if (offenders.length === 0) continue;

    const offendingValues = [...new Set(offenders.map((o) => String(o.value)))].slice(0, 5);

    issues.push({
      id: createIssueId('type-consistency', column.name),
      checkId: 'type-consistency',
      severity: 'medium',
      title: `「${column.name}」列中取值类型不一致`,
      description: majorityIsNumeric
        ? `该列以数值为主（${numeric.length} 个），但混入了 ${offenders.length} 个非数值取值，可能导致统计时被整体当作文本处理。`
        : `该列以文本为主（${nonNumeric.length} 个），但混入了 ${offenders.length} 个纯数值取值，需确认是否为编码值。`,
      evidence: {
        columns: [column.name],
        rowIndices: offenders.slice(0, 50).map((o) => o.index),
        statistics: {
          offendingCount: offenders.length,
          offendingValues: offendingValues.join('、'),
          numericCount: numeric.length,
          nonNumericCount: nonNumeric.length,
        },
      },
      suggestion: {
        action: 'normalize_type',
        params: { column: column.name, offendingValues },
        rationale: majorityIsNumeric
          ? '建议先核实这些取值的含义（常见为「未知」「缺失」「拒答」等编码），再决定转为缺失还是保留为分类。'
          : '建议确认这些数值是否为特殊编码（如 999 表示缺失）。',
      },
      confidence: 0.9,
    });
  }

  return issues;
}
```

- [ ] **Step 4: 运行测试确认通过**

```powershell
pnpm test src/core/checks/typeConsistency
```

Expected：PASS，7 个测试通过。

- [ ] **Step 5: 提交**

```bash
git add src/core/checks/typeConsistency.ts src/core/checks/typeConsistency.test.ts
git commit -m "feat(core): 实现类型一致性检查"
```

---

### Task 9: 异常值检查

**Files:**
- Create: `src/core/checks/outliers.ts`
- Create: `src/core/checks/outliers.test.ts`

**Interfaces:**
- Consumes: `Dataset`、`QualityIssue`（Task 2）；`inferColumnType`（Task 5）；`iqrBounds`/`modifiedZScoresOf`/`zScoresOf`（Task 4）；`createIssueId`（Task 6）
- Produces: `checkOutliers(dataset: Dataset, options?: OutlierOptions): QualityIssue[]`，其中 `OutlierOptions = { method?: 'iqr' | 'z' | 'modified-z' }`

- [ ] **Step 1: 写失败测试**

`src/core/checks/outliers.test.ts`：
```ts
import { describe, it, expect } from 'vitest';
import type { Dataset } from '../types';
import { checkOutliers } from './outliers';

function numCol(name: string, values: number[]): Dataset {
  return { rowCount: values.length, columns: [{ name, values }] };
}

describe('checkOutliers', () => {
  it('没有异常值时不报问题', () => {
    expect(checkOutliers(numCol('年龄', [20, 21, 22, 23, 24]))).toEqual([]);
  });

  it('IQR 方法能识别明显的离群值', () => {
    const issues = checkOutliers(numCol('年龄', [20, 21, 22, 23, 24, 25, 26, 999]));
    expect(issues).toHaveLength(1);
    expect(issues[0]?.checkId).toBe('outliers');
  });

  it('证据中给出异常值所在行与取值', () => {
    const issues = checkOutliers(numCol('年龄', [20, 21, 22, 23, 24, 25, 26, 999]));
    expect(issues[0]?.evidence.rowIndices).toContain(7);
    expect(issues[0]?.evidence.statistics.outlierCount).toBe(1);
  });

  it('非数值列跳过，不报问题', () => {
    const dataset: Dataset = {
      rowCount: 4,
      columns: [{ name: '学历', values: ['本科', '硕士', '本科', '博士'] }],
    };
    expect(checkOutliers(dataset)).toEqual([]);
  });

  it('全部相同数值不产生异常值也不崩溃', () => {
    expect(checkOutliers(numCol('年龄', [30, 30, 30, 30]))).toEqual([]);
  });

  it('单行数据不报问题', () => {
    expect(checkOutliers(numCol('年龄', [30]))).toEqual([]);
  });

  it('可切换检查方法', () => {
    const values = [10, 10, 11, 10, 12, 10, 11, 10, 1000];
    expect(checkOutliers(numCol('值', values), { method: 'modified-z' })).toHaveLength(1);
  });

  it('空数据集不报问题', () => {
    expect(checkOutliers({ columns: [], rowCount: 0 })).toEqual([]);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```powershell
pnpm test src/core/checks/outliers
```

Expected：FAIL，模块不存在。

- [ ] **Step 3: 实现 `src/core/checks/outliers.ts`**

```ts
import type { CellValue, Dataset, QualityIssue } from '../types';
import { isMissingValue } from '../types';
import { inferColumnType } from '../profile';
import { iqrBounds, modifiedZScoresOf, zScoresOf } from '../stats';
import { createIssueId } from './id';

export type OutlierMethod = 'iqr' | 'z' | 'modified-z';

export interface OutlierOptions {
  /** 检测方法，默认 iqr */
  method?: OutlierMethod;
}

/** 修正 Z 分数的经验阈值（Iglewicz–Hoaglin 建议 3.5） */
const MODIFIED_Z_THRESHOLD = 3.5;
/** 标准 Z 分数阈值 */
const Z_THRESHOLD = 3;

function toNumber(value: CellValue): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return null;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** 异常值检查 */
export function checkOutliers(
  dataset: Dataset,
  options: OutlierOptions = {},
): QualityIssue[] {
  const method = options.method ?? 'iqr';
  const issues: QualityIssue[] = [];

  for (const column of dataset.columns) {
    if (inferColumnType(column) !== 'number') continue;

    const indexed = column.values
      .map((value, index) => ({ value: toNumber(value), index }))
      .filter((item): item is { value: number; index: number } => item.value !== null);

    // 少于 4 个观测值时四分位数不稳定，跳过
    if (indexed.length < 4) continue;

    const numbers = indexed.map((item) => item.value);
    const flags: boolean[] = [];

    if (method === 'iqr') {
      const { lower, upper } = iqrBounds(numbers);
      for (const n of numbers) flags.push(n < lower || n > upper);
    } else if (method === 'z') {
      for (const z of zScoresOf(numbers)) flags.push(Math.abs(z) > Z_THRESHOLD);
    } else {
      for (const z of modifiedZScoresOf(numbers)) {
        flags.push(Math.abs(z) > MODIFIED_Z_THRESHOLD);
      }
    }

    const outlierRows = indexed.filter((_, i) => flags[i]).map((item) => item.index);
    if (outlierRows.length === 0) continue;

    const outlierValues = indexed
      .filter((_, i) => flags[i])
      .map((item) => item.value);

    issues.push({
      id: createIssueId('outliers', column.name),
      checkId: 'outliers',
      severity: 'medium',
      title: `「${column.name}」列检出 ${outlierRows.length} 个异常值`,
      description:
        '这些取值明显偏离该列的其余观测。可能是录入错误，也可能是真实的极端情况，需结合实际语境判断。',
      evidence: {
        columns: [column.name],
        rowIndices: outlierRows,
        statistics: {
          outlierCount: outlierRows.length,
          method,
          min: Math.min(...outlierValues),
          max: Math.max(...outlierValues),
          observedCount: indexed.length,
        },
      },
      suggestion: {
        action: 'review_outliers',
        params: { column: column.name, rowIndices: outlierRows, method },
        rationale:
          '不建议直接删除。请先核对原始记录：若为录入错误应更正，若为真实极端值应保留并在分析中说明。',
      },
      confidence: 0.8,
    });
  }

  return issues;
}
```

- [ ] **Step 4: 运行测试确认通过**

```powershell
pnpm test src/core/checks/outliers
```

Expected：PASS，8 个测试通过。

- [ ] **Step 5: 提交**

```bash
git add src/core/checks/outliers.ts src/core/checks/outliers.test.ts
git commit -m "feat(core): 实现异常值检查（IQR / Z / 修正 Z 三法）"
```

---

### Task 10: 值域规则检查

**Files:**
- Create: `src/core/checks/rangeRules.ts`
- Create: `src/core/checks/rangeRules.test.ts`

**Interfaces:**
- Consumes: `Dataset`、`QualityIssue`（Task 2）；`createIssueId`（Task 6）
- Produces: `RangeRule` 类型、`checkRangeRules(dataset: Dataset, rules: RangeRule[]): QualityIssue[]`

- [ ] **Step 1: 写失败测试**

`src/core/checks/rangeRules.test.ts`：
```ts
import { describe, it, expect } from 'vitest';
import type { Dataset } from '../types';
import { checkRangeRules, type RangeRule } from './rangeRules';

function ds(name: string, values: Dataset['columns'][number]['values']): Dataset {
  return { rowCount: values.length, columns: [{ name, values }] };
}

const ageRule: RangeRule = {
  id: 'age-0-120',
  column: '年龄',
  min: 0,
  max: 120,
  rationale: '人类年龄的合理范围',
};

describe('checkRangeRules', () => {
  it('全部在范围内时不报问题', () => {
    expect(checkRangeRules(ds('年龄', [20, 30, 40]), [ageRule])).toEqual([]);
  });

  it('超出上界时报问题', () => {
    const issues = checkRangeRules(ds('年龄', [20, 999]), [ageRule]);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.evidence.rowIndices).toEqual([1]);
  });

  it('超出下界时报问题', () => {
    const issues = checkRangeRules(ds('年龄', [-5, 20]), [ageRule]);
    expect(issues[0]?.evidence.rowIndices).toEqual([0]);
  });

  it('边界值本身不算越界（闭区间）', () => {
    expect(checkRangeRules(ds('年龄', [0, 120]), [ageRule])).toEqual([]);
  });

  it('列不存在时跳过该规则，不报错', () => {
    expect(checkRangeRules(ds('身高', [170]), [ageRule])).toEqual([]);
  });

  it('缺失值不参与值域检查', () => {
    expect(checkRangeRules(ds('年龄', [20, null, 30]), [ageRule])).toEqual([]);
  });

  it('规则的理由被带入建议中', () => {
    const issues = checkRangeRules(ds('年龄', [999]), [ageRule]);
    expect(issues[0]?.suggestion?.rationale).toContain('人类年龄的合理范围');
  });

  it('多条规则可同时生效', () => {
    const heightRule: RangeRule = { id: 'h', column: '身高', min: 50, max: 250 };
    const dataset: Dataset = {
      rowCount: 1,
      columns: [
        { name: '年龄', values: [999] },
        { name: '身高', values: [300] },
      ],
    };
    expect(checkRangeRules(dataset, [ageRule, heightRule])).toHaveLength(2);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```powershell
pnpm test src/core/checks/rangeRules
```

Expected：FAIL，模块不存在。

- [ ] **Step 3: 实现 `src/core/checks/rangeRules.ts`**

```ts
import type { CellValue, Dataset, QualityIssue } from '../types';
import { isMissingValue } from '../types';
import { createIssueId } from './id';

/** 值域规则：声明某列取值的合理区间（闭区间） */
export interface RangeRule {
  id: string;
  column: string;
  min?: number;
  max?: number;
  /** 规则依据，例如「人类年龄的合理范围」或国标出处 */
  rationale?: string;
}

function toNumber(value: CellValue): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return null;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** 值域规则检查：按预定义规则识别越界取值 */
export function checkRangeRules(dataset: Dataset, rules: RangeRule[]): QualityIssue[] {
  const issues: QualityIssue[] = [];

  for (const rule of rules) {
    const column = dataset.columns.find((c) => c.name === rule.column);
    if (!column) continue;

    const violations: { index: number; value: number }[] = [];
    for (let i = 0; i < column.values.length; i += 1) {
      const raw = column.values[i];
      if (isMissingValue(raw)) continue;
      const n = toNumber(raw);
      if (n === null) continue;
      if (rule.min !== undefined && n < rule.min) violations.push({ index: i, value: n });
      else if (rule.max !== undefined && n > rule.max) violations.push({ index: i, value: n });
    }

    if (violations.length === 0) continue;

    const bounds = [
      rule.min !== undefined ? `下界 ${rule.min}` : null,
      rule.max !== undefined ? `上界 ${rule.max}` : null,
    ]
      .filter(Boolean)
      .join('，');

    issues.push({
      id: createIssueId('range-rules', `${rule.id}-${rule.column}`),
      checkId: 'range-rules',
      severity: 'high',
      title: `「${rule.column}」有 ${violations.length} 个取值超出合理范围`,
      description: `按规则「${rule.id}」的界定（${bounds}），下列取值不合理，通常意味着录入错误或缺失编码未被识别。`,
      evidence: {
        columns: [rule.column],
        rowIndices: violations.map((v) => v.index),
        statistics: {
          violationCount: violations.length,
          ruleId: rule.id,
          values: [...new Set(violations.map((v) => v.value))].slice(0, 5).join('、'),
        },
      },
      suggestion: {
        action: 'review_range_violations',
        params: { column: rule.column, ruleId: rule.id },
        rationale: rule.rationale
          ? rule.rationale
          : '请核对原始记录，确认是录入错误还是缺失编码。',
      },
      confidence: 0.95,
    });
  }

  return issues;
}
```

- [ ] **Step 4: 运行测试确认通过**

```powershell
pnpm test src/core/checks/rangeRules
```

Expected：PASS，8 个测试通过。

- [ ] **Step 5: 提交**

```bash
git add src/core/checks/rangeRules.ts src/core/checks/rangeRules.test.ts
git commit -m "feat(core): 实现值域规则检查"
```

---

### Task 11: 检查调度器与包出口

**Files:**
- Create: `src/core/checks/index.ts`
- Create: `src/core/checks/index.test.ts`
- Create: `src/core/index.ts`
- Create: `src/core/index.test.ts`

**Interfaces:**
- Consumes: 前述全部检查函数
- Produces: `runAllChecks(dataset: Dataset, options?: RunChecksOptions): QualityIssue[]`；`core` 包统一出口

- [ ] **Step 1: 写失败测试**

`src/core/checks/index.test.ts`：
```ts
import { describe, it, expect } from 'vitest';
import type { Dataset } from '../types';
import { runAllChecks } from './index';

const messy: Dataset = {
  rowCount: 5,
  columns: [
    { name: '年龄', values: [20, 21, 999, 23, null] },
    { name: '学历', values: ['本科', '硕士', '本科', '硕士', '博士'] },
  ],
};

describe('runAllChecks', () => {
  it('同时执行多个检查并合并结果', () => {
    const issues = runAllChecks(messy, {
      rangeRules: [{ id: 'age', column: '年龄', min: 0, max: 120 }],
    });
    const checkIds = new Set(issues.map((i) => i.checkId));
    expect(checkIds.has('missing')).toBe(true);
    expect(checkIds.has('range-rules')).toBe(true);
  });

  it('空数据集返回空数组', () => {
    expect(runAllChecks({ columns: [], rowCount: 0 })).toEqual([]);
  });

  it('结果按严重度排序：high 在前', () => {
    const issues = runAllChecks(messy, {
      rangeRules: [{ id: 'age', column: '年龄', min: 0, max: 120 }],
    });
    const severities = issues.map((i) => i.severity);
    const firstMedium = severities.indexOf('medium');
    const lastHigh = severities.lastIndexOf('high');
    if (firstMedium !== -1 && lastHigh !== -1) {
      expect(lastHigh).toBeLessThan(firstMedium);
    }
  });

  it('单个检查抛异常不影响其余检查（降级机制）', () => {
    const broken: Dataset = {
      rowCount: 1,
      columns: [{ name: 'x', values: [1] }],
    };
    expect(() => runAllChecks(broken)).not.toThrow();
  });

  it('可通过 enabled 参数只跑指定检查', () => {
    const issues = runAllChecks(messy, { enabled: ['missing'] });
    expect(issues.every((i) => i.checkId === 'missing')).toBe(true);
  });
});
```

`src/core/index.test.ts`：
```ts
import { describe, it, expect } from 'vitest';
import { profileDataset, checkMissing, runAllChecks, normalizeKey } from './index';

describe('core 包出口', () => {
  it('导出画像、检查与规范化能力', () => {
    expect(typeof profileDataset).toBe('function');
    expect(typeof checkMissing).toBe('function');
    expect(typeof runAllChecks).toBe('function');
    expect(typeof normalizeKey).toBe('function');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```powershell
pnpm test src/core
```

Expected：FAIL，`runAllChecks` 未定义。

- [ ] **Step 3: 实现 `src/core/checks/index.ts`**

```ts
import type { Dataset, QualityIssue, Severity } from '../types';
import { checkMissing, type MissingOptions } from './missing';
import { checkDuplicates, type DuplicateOptions } from './duplicates';
import { checkTypeConsistency } from './typeConsistency';
import { checkOutliers, type OutlierOptions } from './outliers';
import { checkRangeRules, type RangeRule } from './rangeRules';

export interface RunChecksOptions {
  /** 只运行这些检查项；缺省时运行全部 */
  enabled?: string[];
  missing?: MissingOptions;
  duplicates?: DuplicateOptions;
  outliers?: OutlierOptions;
  rangeRules?: RangeRule[];
}

const SEVERITY_ORDER: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

/**
 * 执行全部已启用的检查并合并结果。
 * 单个检查抛异常时被捕获并跳过，不影响其余检查——这是设计文档要求的降级机制。
 */
export function runAllChecks(
  dataset: Dataset,
  options: RunChecksOptions = {},
): QualityIssue[] {
  const enabled = options.enabled;
  const isOn = (id: string) => enabled === undefined || enabled.includes(id);

  const tasks: { id: string; run: () => QualityIssue[] }[] = [
    { id: 'missing', run: () => checkMissing(dataset, options.missing) },
    { id: 'duplicates', run: () => checkDuplicates(dataset, options.duplicates) },
    { id: 'type-consistency', run: () => checkTypeConsistency(dataset) },
    { id: 'outliers', run: () => checkOutliers(dataset, options.outliers) },
    {
      id: 'range-rules',
      run: () => checkRangeRules(dataset, options.rangeRules ?? []),
    },
  ];

  const issues: QualityIssue[] = [];
  for (const task of tasks) {
    if (!isOn(task.id)) continue;
    try {
      issues.push(...task.run());
    } catch (error) {
      // 单个检查失败不应中断整体流程
      console.error(`[core] 检查项 ${task.id} 执行失败：`, error);
    }
  }

  return issues.sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  );
}

export { checkMissing, checkDuplicates, checkTypeConsistency, checkOutliers, checkRangeRules };
export type { MissingOptions, DuplicateOptions, OutlierOptions, RangeRule };
export type { OutlierMethod } from './outliers';
```

- [ ] **Step 4: 实现 `src/core/index.ts`**

```ts
/**
 * core —— 平台无关的数据质量检查引擎。
 *
 * 本包不引用任何浏览器 API 与 Node API，因此可以同时运行在：
 *   - 浏览器 Web Worker 中（产品的默认执行位置）
 *   - Node 进程中（MCP Server 复用同一份实现）
 *
 * 这条约束是设计文档 §3.4 的架构决策，修改前请先确认其影响。
 */

export * from './types';
export * from './normalize';
export * from './stats';
export * from './profile';
export * from './checks';
```

- [ ] **Step 5: 运行全部测试确认通过**

```powershell
pnpm test
```

Expected：PASS，全部测试通过（约 60+ 个断言）。

- [ ] **Step 6: 类型检查**

```powershell
pnpm typecheck
```

Expected：无错误输出。

- [ ] **Step 7: 提交**

```bash
git add src/core
git commit -m "feat(core): 实现检查调度器与包出口

- runAllChecks 合并全部检查结果并按严重度排序
- 单个检查异常被捕获，不影响其余检查
- core 包统一出口，供浏览器与 MCP Server 共用"
```

---

## 完成标准

本计划完成后应满足：

| 项 | 验证方式 |
| --- | --- |
| 工程可构建 | `pnpm build` 成功 |
| 工程可运行 | `pnpm dev` 后访问 `http://localhost:3000` 显示首页 |
| 类型无错误 | `pnpm typecheck` 无输出 |
| 测试全绿 | `pnpm test` 全部通过 |
| `core` 无运行时依赖 | 检查 `src/core/` 下无 `window`/`document`/`fs`/`process` 引用 |
| Review Focus 五类边界均有测试覆盖 | 见各任务测试用例 |

## 后续计划

| 计划 | 内容 |
| --- | --- |
| **Plan 1b** | 文件解析（CSV/Excel + Web Worker）、状态管理、上传界面、数据预览表格、问题清单界面、E2E 测试、首次部署验证 |
| **Plan 2** | Agent 六阶段工作流、AI SDK 集成、Function Calling、流式对话、问题审阅交互 |
| **Plan 3** | 端侧 embedding、RAG 混合检索、清洗执行、pandas 脚本生成与留痕 |
| **Plan 4** | 评测体系、质量报告看板、性能优化 |
| **Plan 5** | MCP Server、（可选）多模态、正式部署 |
