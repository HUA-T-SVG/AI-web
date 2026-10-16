import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * 把评测结果写成**结构化 JSON**，供 `/export` 的指标看板读取。
 *
 * 为什么评测除了 Markdown 报告还要产出 JSON：报告是**给人读的**，而看板要给
 * 客户端读 —— 客户端读不到 `knowledge/`（不在 `public/` 下），更没法解析 markdown。
 *
 * 为什么不让 `scripts/sync-eval.mjs` 去**解析**那几份 Markdown：那会让看板依赖
 * 文档的排版 —— 有人调一下表格列宽，指标就静默消失或串行。**指标的真源必须是
 * 结构化的**，Markdown 只是它的一种呈现。
 *
 * 每个指标都带 `rule`（判据与达标线）。这是刻意的：看板最容易退化成一排漂亮的
 * 数字，而**没有判据的数字读不出好坏**。
 *
 * **为什么这个文件在 `scripts/` 而不是 `src/core/evaluate/`**：它用 `node:fs`，
 * 而 `src/core` 受平台无关约束（`src/core/platform.test.ts` 守着）—— 放那边门禁
 * 会立刻红。测试文件 import 它没问题（测试本身就跑在 Node 里）。
 */

export interface EvalMetric {
  /** 面向读的人的名字，中文 */
  name: string;
  /** 数值。非数值型指标（如「不可达」）用 `text` 代替 */
  value?: number;
  text?: string;
  unit?: string;
  /** 判据与达标线的说明，看板必须显示它 */
  rule: string;
  /** 是否达标。`undefined` 表示这项没有达标线 */
  passed?: boolean;
}

export interface EvalSection {
  title: string;
  description: string;
  metrics: EvalMetric[];
  /** 可选的分组明细，看板用来画图 */
  groups?: { name: string; metrics: EvalMetric[] }[];
  /** 脚本跑出来的时间（ISO）。看板要显示它 —— 过期的数字比没有数字更误导 */
  measuredAt: string;
  /** 这项评测怎么复跑 */
  command: string;
  /** 如实写明没测到的部分 */
  notCovered?: string[];
}

/** 写进 `knowledge/reports/eval-<key>.json`（`scripts/sync-eval.mjs` 再同步到 public/）。 */
export function writeEvalSection(key: string, section: EvalSection): void {
  const path = `knowledge/reports/eval-${key}.json`;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(section, null, 2)}\n`, 'utf8');
}
