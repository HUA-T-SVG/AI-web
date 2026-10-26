# 研究场景入口（MVP）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `/import` 首屏顶部给出「问卷 / 实验 / 教育」三类研究场景卡片（关注点、推荐检查、场景示例数据），让用户在导入前知道「这类数据该重点看什么」；场景选择跟到检查页做「只看本次重点」筛选，并在全局文件上下文条显示场景徽章。**8 项检查照跑，覆盖地图与「8 项检查」口径不动，场景不进 Prompt、不与知识库学科绑定。**

**Architecture:** 场景是**界面层配置**（`src/ui/lib/scenarios.ts` 纯数据 + 纯函数），不是检查引擎的一部分。选择状态用 zustand + sessionStorage，且**按文件归属**（换文件清空、同名保留、刷新恢复），照 `rangeRuleStore` 的持久化写法。示例走**既有上传/解析/检查路径**（`datasetStore.loadSample(scenarioId)`），不另造解析分支；三份示例 CSV 由一条单测从真实 `parseCsv` 入口读入，断言预期 `checkId` 真的被检出。

**Tech Stack:** Next.js 16（App Router）+ React 19 + TypeScript strict · Zustand（已有）· Tailwind v4 · Vitest（node 环境）· Playwright · 既有 `src/core` 检查引擎与 `src/parser`。

**Spec:** `docs/superpowers/specs/2026-10-09-data-quality-agent-design.md` §2.1「场景真实性」、§2.2 功能表（本计划新增 F14）；需求条目由所有者 2026-10-26 下达，记录在 Goal 与 Global Constraints，不另建 spec。

**前置状态（2026-10-26 核对）**：`main` = `origin/main`；门禁绿（tsc 0 / 单测 **798 passed / 8 skipped / 68 文件** / E2E **86 passed / 1 skipped** / build 成功）；技术文档 **30/30 页**、`check:doc` 30 项全过——新增内容必须先等量删减。工作区只有未跟踪的 `docs/部署指南.docx`（另一会话产物，**绝对不要提交**）。基线数字不符时以 `pnpm test` / `pnpm test:e2e` 输出为准，并在 Task 6 同步。本计划是 2026-10-26 三份计划中的第 1 份（建议执行顺序：研究场景入口 → 数据处理方法草稿 → AI 主动追问）；三份都要改同一批文档与测试数字，必须顺序执行、逐个合并，**不要并行跑 E2E**（共用 3000 端口与 `.next`）。若在前序计划之后执行，基线以实测为准。

## Global Constraints
- **隐私不出浏览器**：示例数据也只走浏览器内解析与检查；场景配置不得进 Prompt、不得扩展 `src/agent/shared/outbound.ts` 白名单。
- **8 项检查是硬口径**：`recommendedCheckIds` 只用于「本次重点」提示与问题列表筛选；`runAllChecks`、`datasetStore` 的 `SYNC_CHECK_IDS`、`coverageMap`、页面上「8 项规则检查」文案一律不改；根路由 `/` → `/import` 的 redirect 与 `tests/e2e/upload.spec.ts`「根路径进入数据导入」断言都不动。
- **MVP 砍掉**：不做知识库学科映射、不写进系统提示词、不改 AI 工作流、不做场景专属检查项——避免「场景＝学科」被编造。
- **示例数据标注「合成示例」**：界面提示与文档都写清三份示例是合成的，不是真实调查/实验/教务数据。
- **全中文**：界面文案、代码注释、提交信息；命名不用 `data1`/`temp`/`res`；注释只写「为什么」。
- **TDD + 提交粒度**：每任务先写失败测试 → 跑红 → 实现 → 跑绿 → 四道门禁 → 一个提交只做一件事。
- **四道门禁**（PowerShell，先设环境变量，任一红不提交）：
  ```powershell
  $env:TEMP='D:\tmp'; $env:TMP='D:\tmp'; $env:PLAYWRIGHT_BROWSERS_PATH='D:\ms-playwright'
  node_modules/.bin/tsc.cmd --noEmit
  pnpm test
  pnpm test:e2e
  pnpm build
  ```
- **分支**：`git checkout -b feat/scenario-entry`；合并用 `--no-ff`；**不要 force push**。
- **文档上限**：技术文档 30 页顶满，`pnpm doc:build` 超页 exit 1；必须「先删后加」，页数不过不许提交。
- **不要提交**：`docs/部署指南.docx`、`next-env.d.ts`（`git checkout -- next-env.d.ts`）、`knowledge/reports/*.json` 的测试噪声。

## Review Focus
1. **推荐检查被误做成真实减项** —— 若 `runAllChecks` 的 `enabled` 被改成子集，或覆盖地图/「8 项规则检查」文案跟着变，产品就从「关注点」变成「少查几项」。Task 5 E2E 断言筛选前后统计不变、页面仍有「8 项规则检查」；收尾 `git diff --stat` 确认 `src/core/`、`src/worker/`、`coverageMap.ts` 零改动。
2. **示例数据埋的问题没被检出** —— 卡片说「重点看单位混用」，检查页却一条没有。Task 2 从真实 `parseCsv` 入口读三份 CSV，断言预期 `checkId` 全部命中。
3. **刷新后场景丢失 / 串到另一份文件** —— 刷新回来数据在、场景没了；或换文件后上一份「本次重点」还挂着。Task 3 store 单测（同文件保留、换文件清空、坏 storage 不崩）+ Task 5 E2E（刷新后徽章在、换文件后徽章消失）。
4. **场景与学科混淆** —— 做成知识库学科或写进 Prompt 会让模型对没有依据的学科下判断。Task 1 断言 `Scenario` 不含学科字段；收尾确认 `src/agent/`、`src/knowledge/` 零改动。
5. **旧 E2E 断言被忽略** —— `/`→`/import`、首屏「体验示例数据」、7 行 × 5 列示例、覆盖地图配置流程都可能被碰坏。Task 4/5 列出必须保持绿的旧用例（`upload.spec.ts`「根路径进入数据导入」「首屏体验示例数据」「检查覆盖地图」、`persistence.spec.ts`「刷新后示例数据仍然标记为示例」），收尾跑全量 E2E。

## File Structure
**新建**：`src/ui/lib/scenarios.ts`（三场景唯一真源，纯数据）· `src/ui/lib/scenarios.test.ts`（定义校验 + 示例埋点回归）· `src/ui/stores/scenarioStore.ts`（按文件归属的选择状态 + sessionStorage）· `src/ui/stores/scenarioStore.test.ts` · `src/ui/components/ScenarioCards.tsx`（首屏三张卡片）· `public/sample/experiment-data.csv`（13 行 × 6 列）· `public/sample/education-data.csv`（13 行 × 6 列）· `tests/e2e/scenario-entry.spec.ts`。

**修改**：`src/app/import/page.tsx`（首屏卡片 + `openSample(scenarioId)`）· `src/ui/components/FileDropzone.tsx`（可选 `sampleLabel`，默认「体验示例数据」保住旧 E2E；加 `data-testid="sample-entry"`）· `src/ui/stores/datasetStore.ts`（`loadSample(scenarioId?)`、接入 `beginFile/reset`）· `src/ui/stores/datasetStore.test.ts`（补两条用例）· `src/app/check/page.tsx`（场景 → `IssueList` 与提示）· `src/ui/components/IssueList.tsx`（`focusCheckIds` / `focusLabel` + chip）· `src/ui/components/DataContextBar.tsx`（场景徽章 `data-testid="scenario-badge"`）· `scripts/check-doc-facts.mjs` · 技术文档与 6 份交接 md、README、代码导读、设计文档（Task 6）。

**估时（人·小时，合计约 21）**：Task 1 2.5 · Task 2 3 · Task 3 2.5 · Task 4 4.5 · Task 5 4 · Task 6 3 · 收尾 1.5。

### Task 1: 场景唯一真源 `scenarios.ts`
**Files:** Create `src/ui/lib/scenarios.ts` · Create `src/ui/lib/scenarios.test.ts` · Test 后者。

**Interfaces:** Consumes `CHECK_LABEL`（`checkLabels.ts`，检查 id 的界面单一真源）。Produces：
```ts
export const SCENARIO_IDS = ['survey', 'experiment', 'education'] as const;
export type ScenarioId = (typeof SCENARIO_IDS)[number];
export interface Scenario { id: ScenarioId; title: string; summary: string;
  focusPoints: readonly [string, string, string]; recommendedCheckIds: readonly string[];
  sample: { url: string; fileName: string } }
export const SCENARIOS: readonly Scenario[];
export const ALL_CHECK_IDS: readonly string[];          // Object.keys(CHECK_LABEL)
export function scenarioById(id: string | null): Scenario | null;
export function isScenarioId(value: unknown): value is ScenarioId;
```

- [ ] **Step 1: 写失败测试**
```ts
// src/ui/lib/scenarios.test.ts
import { describe, expect, it } from 'vitest';
import { ALL_CHECK_IDS, SCENARIOS, SCENARIO_IDS, isScenarioId, scenarioById } from './scenarios';
describe('研究场景定义', () => {
  it('恰好三个场景，id 与标题固定', () => {
    expect(SCENARIOS.map((s) => s.id)).toEqual(['survey', 'experiment', 'education']);
    expect(SCENARIOS.map((s) => s.title)).toEqual(['问卷数据', '实验数据', '教育数据']);
  });
  it('每个场景有说明、恰好三条关注点、示例入口；推荐检查是 8 项子集', () => {
    expect(ALL_CHECK_IDS).toHaveLength(8);
    for (const s of SCENARIOS) {
      expect(s.summary.length).toBeGreaterThan(10);
      expect(s.focusPoints).toHaveLength(3);
      expect(s.sample.url).toMatch(/^\/sample\/.+\.csv$/);
      expect(s.sample.fileName).toMatch(/^示例-.+\.csv$/);
      expect(s.recommendedCheckIds.length).toBeGreaterThan(0);
      expect(s.recommendedCheckIds.length).toBeLessThan(8);
      for (const id of s.recommendedCheckIds) expect(ALL_CHECK_IDS).toContain(id);
    }
  });
  it('场景不是学科；scenarioById / isScenarioId 只认已注册场景', () => {
    for (const s of SCENARIOS) expect(s).not.toHaveProperty('subject');
    expect(scenarioById('survey')?.title).toBe('问卷数据');
    expect(scenarioById('chemistry')).toBeNull();
    expect(isScenarioId('experiment')).toBe(true);
    expect(isScenarioId('nope')).toBe(false);
    expect(SCENARIO_IDS).toHaveLength(3);
  });
});
```
- [ ] **Step 2: 跑测试确认失败**：`node_modules/.bin/vitest.cmd run src/ui/lib/scenarios.test.ts` → FAIL（无法解析 `./scenarios`）。
- [ ] **Step 3: 实现**：`SCENARIO_IDS` 手写常量，`SCENARIO_LIST` 用 `as const satisfies readonly Scenario[]`，`SCENARIOS = SCENARIO_LIST`，`ALL_CHECK_IDS = Object.keys(CHECK_LABEL)`。三条数据全文：
```ts
{ id: 'survey', title: '问卷数据', summary: '李克特量表、人口学变量与多选题为主，先把编码与作答口径对齐。', focusPoints: ['编码：学号/题号的位数与前后缀是否一致', '缺失：空白、拒答与「不适用」是否被混为一谈', '类别写法：学历/专业等自由填写项的同义写法'], recommendedCheckIds: ['missing', 'type-consistency', 'category-synonyms'], sample: { url: '/sample/messy-survey.csv', fileName: '示例-科研问卷.csv' } },
{ id: 'experiment', title: '实验数据', summary: '重复测量与仪器读数为主，单位与量程最容易在合并时失真。', focusPoints: ['单位：mg 与 g、mL 与 L 混写', '重复测量：同一被试/样本被重复录入', '数值异常：超出仪器量程的读数'], recommendedCheckIds: ['unit-consistency', 'duplicates', 'outliers'], sample: { url: '/sample/experiment-data.csv', fileName: '示例-实验数据.csv' } },
{ id: 'education', title: '教育数据', summary: '成绩、班级与人数口径为主，缺考标记与合计列最容易出错。', focusPoints: ['成绩：分数列里混入「缺考」等文字', '人数口径：班级人数与名单行数不一致', '字段关联：学号与班级的对应关系'], recommendedCheckIds: ['type-consistency', 'missing', 'outliers'], sample: { url: '/sample/education-data.csv', fileName: '示例-教育数据.csv' } }
```
- [ ] **Step 4: 跑绿 + 类型**：该测试 3 passed（场景数量 / 字段与推荐检查 / 学科字段与查找函数）；`node_modules/.bin/tsc.cmd --noEmit` → 0。
- [ ] **Step 5: 提交**：`git add src/ui/lib/scenarios.ts src/ui/lib/scenarios.test.ts && git commit -m "feat(scenario): 研究场景唯一真源与定义测试"`。

### Task 2: 两份新示例数据 + 「埋的问题会被检出」回归
**Files:** Create `public/sample/experiment-data.csv` · Create `public/sample/education-data.csv` · Modify `public/sample/messy-survey.csv`（补一个真实可检出的空值，见 Step 3）· Modify `src/ui/lib/scenarios.test.ts`。**Interfaces:** Consumes `parseCsv`（`@/parser/csv`，与 Worker 同一条解析路径）、`runAllChecks`（`@/core`）、`SCENARIOS`；无新导出。

- [ ] **Step 1: 写失败测试**（追加到 `scenarios.test.ts`）
```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runAllChecks, type Dataset } from '@/core';
import { parseCsv } from '@/parser/csv';
/** 只要求「至少这些」：将来检查项增强不该让这条假红 */
const EXPECTED: Record<string, string[]> = {
  survey: ['duplicates', 'type-consistency', 'missing'],
  experiment: ['unit-consistency', 'duplicates', 'outliers'],
  education: ['type-consistency', 'missing', 'outliers', 'duplicates'],
};
function readSample(url: string): string {
  return readFileSync(resolve(process.cwd(), 'public', url.replace(/^\//, '')), 'utf8');
}
function loadSampleDataset(url: string): Dataset {
  const text = readSample(url);
  const buffer = new TextEncoder().encode(text).buffer as ArrayBuffer;
  const result = parseCsv({ buffer, fileName: url, fileSize: buffer.byteLength });
  if ('kind' in result) throw new Error(`示例 ${url} 解析失败：${result.message}`);
  return result.dataset;
}
describe('示例数据：埋进去的问题必须真的能被检出（合成数据 7–15 行）', () => {
  for (const s of SCENARIOS) {
    it(`${s.title}示例会报出：${EXPECTED[s.id].join('、')}`, () => {
      const checkIds = new Set(runAllChecks(loadSampleDataset(s.sample.url)).map((i) => i.checkId));
      for (const expected of EXPECTED[s.id]) expect([...checkIds]).toContain(expected);
      const rows = readSample(s.sample.url).trimEnd().split('\n').length - 1;
      expect(rows).toBeGreaterThanOrEqual(7);
      expect(rows).toBeLessThanOrEqual(15);
    });
  }
});
```
- [ ] **Step 2: 跑红**：同命令 → FAIL，`ENOENT`（新 CSV 不存在）。
- [ ] **Step 3: 造 CSV**（全量照抄，不要凭感觉改）：
```csv
样本编号,剂量,吸光度,重复次数,仪器,备注
S01,5mg,0.812,3,紫外分光光度计,正常
S02,10mg,0.796,3,紫外分光光度计,正常
S03,15mg,0.805,3,紫外分光光度计,正常
S04,20mg,0.799,3,紫外分光光度计,正常
S05,500mg,0.808,3,紫外分光光度计,正常
S06,5mg,0.814,3,紫外分光光度计,正常
S07,0.5g,0.801,3,紫外分光光度计,正常
S08,0.5g,0.807,3,紫外分光光度计,正常
S09,5mg,0.802,3,紫外分光光度计,正常
S10,5mg,0.803,3,紫外分光光度计,正常
S11,5mg,999,3,紫外分光光度计,读数异常
S12,5mg,0.800,3,紫外分光光度计,正常
S12,5mg,0.800,3,紫外分光光度计,正常
```
```csv
学号,班级,语文成绩,数学成绩,班级人数,备注
E001,一班,88,91,45,正常
E002,一班,76,83,45,正常
E003,一班,缺考,72,45,缺考
E004,二班,92,95,45,正常
E005,二班,81,79,45,
E006,二班,68,74,45,正常
E007,二班,73,77,45,
E008,三班,85,88,45,正常
E009,三班,90,92,45,正常
E010,三班,79,81,999,人数填错
E011,三班,,85,45,
E012,三班,87,89,45,正常
E008,三班,85,88,45,正常
```
埋点与预期检出（**没检出就改数据，不改断言**）：**survey 要微调既有示例**——把第 6 行（学号 006）的「年龄」`23` 改成空：`missing` 默认报告阈值是缺失率 ≥20%，7 行里只有 1 个空（14.3%）会被静默放过，补成 2 个空（28.6%）才可检出。改后 002 行重复 / 年龄混入 `abc` / 年龄 2 个缺失 → duplicates·type-consistency·missing。**不要给 survey 断言 `unit-consistency`**：单位检查只认「数字+单位」（如 `5mg`），「单位」列里的纯单位词 `mg/MG/g` 不触发。experiment `0.5g` 与 `mg` 混写 / S12 重复 / 吸光度 999 → unit-consistency·duplicates·outliers；education 成绩混入「缺考」/ 备注 3/13 缺失 / 班级人数 999 / E008 重复 → type-consistency·missing·outliers·duplicates。改数据前先核对画像：列被判成 `mixed` 时 `outliers` 会跳过、缺失率 <20% 时 `missing` 不报——这两处最常见「以为埋了其实没埋」。
- [ ] **Step 4: 跑绿**：同命令 → 6 passed（3 条定义 + 3 条示例：每份示例一条）。
- [ ] **Step 5: 提交**：`git add public/sample/experiment-data.csv public/sample/education-data.csv src/ui/lib/scenarios.test.ts && git commit -m "test(scenario): 三份示例数据与埋点检出回归"`。

### Task 3: `scenarioStore`（按文件归属 + sessionStorage）
**Files:** Create `src/ui/stores/scenarioStore.ts` · Create `src/ui/stores/scenarioStore.test.ts`。**Interfaces:** Consumes `Scenario` / `ScenarioId` / `isScenarioId` / `scenarioById`。Produces：
```ts
export interface PersistedScenario { fileName: string | null; scenarioId: ScenarioId | null }
export function serializeScenario(fileName: string | null, scenarioId: ScenarioId | null): string;
export function parseScenario(raw: string | null): PersistedScenario | null;
export const useScenarioStore;      // { fileName, scenarioId, beginFile, select, clear, reset }
export function activeScenario(): Scenario | null;   // getState + scenarioById，勿写进 selector
```
- [ ] **Step 1: 写失败测试**（`scenarioStore.test.ts`；`beforeEach` 里 `useScenarioStore.getState().reset()`）
```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { activeScenario, parseScenario, serializeScenario, useScenarioStore } from './scenarioStore';
beforeEach(() => useScenarioStore.getState().reset());
describe('场景选择的生命周期跟着文件走', () => {
  it('同名文件保留、换文件清空', () => {
    const s = useScenarioStore.getState();
    s.beginFile(null); s.select('experiment');
    s.beginFile('a.csv');            // 首次绑定：保留预选
    s.beginFile('a.csv');            // 重试/重跑：同名保留
    expect(useScenarioStore.getState().scenarioId).toBe('experiment');
    s.beginFile('b.csv');            // 换文件：清空
    expect(useScenarioStore.getState().scenarioId).toBeNull();
  });
  it('clear 只清场景，reset 两者都清；activeScenario 可读', () => {
    const s = useScenarioStore.getState();
    s.beginFile('a.csv'); s.select('survey'); s.clear();
    expect(useScenarioStore.getState().fileName).toBe('a.csv');
    expect(activeScenario()).toBeNull();
    s.select('education');
    expect(activeScenario()?.title).toBe('教育数据');
    s.reset();
    expect(useScenarioStore.getState().fileName).toBeNull();
  });
  it('持久化往返；坏 JSON / 未知 id / 类型不对一律当没有', () => {
    expect(parseScenario(serializeScenario('示例-实验数据.csv', 'experiment')))
      .toEqual({ fileName: '示例-实验数据.csv', scenarioId: 'experiment' });
    for (const raw of [null, '', '{', '[]', '{"fileName":"a.csv","scenarioId":"chemistry"}',
      '{"fileName":42,"scenarioId":"survey"}']) expect(parseScenario(raw)).toBeNull();
  });
});
```
- [ ] **Step 2: 跑红**：`node_modules/.bin/vitest.cmd run src/ui/stores/scenarioStore.test.ts` → FAIL（模块不存在）。
- [ ] **Step 3: 实现**：结构照 `rangeRuleStore`（`serialize/parse` 导出、`readStorage/writeStorage` try/catch、模块初始化 `const restored = readStorage()`、`STORAGE_KEY = 'rdq:scenario:v1'`）。`beginFile` 关键逻辑：
```ts
beginFile: (fileName) => set((state) => {
  if (state.fileName === fileName) return {};
  // 第一次绑定文件时保留用户先点过的场景（选场景 → 再上传自己的数据是常见顺序）；
  // 已属于另一份文件时必须清空，否则上一份数据的「本次重点」会套到新数据上
  const scenarioId = state.fileName === null ? state.scenarioId : null;
  const next = { fileName, scenarioId }; writeStorage(next); return next;
}),
```
`select` 只改场景不清文件；`clear` 只清场景；`reset` 两者都清并删 storage 键；`activeScenario()` = `scenarioById(getState().scenarioId)`。
- [ ] **Step 4: 跑绿 + 类型**：3 passed；tsc 0。
- [ ] **Step 5: 提交**：`git add src/ui/stores/scenarioStore.ts src/ui/stores/scenarioStore.test.ts && git commit -m "feat(scenario): 按文件归属的场景选择状态与会话内持久化"`。

### Task 4: 首屏场景卡片 + 按场景加载示例数据
**Files:** Create `src/ui/components/ScenarioCards.tsx` · Modify `src/app/import/page.tsx`、`src/ui/components/FileDropzone.tsx`、`src/ui/stores/datasetStore.ts`、`src/ui/stores/datasetStore.test.ts` · Create `tests/e2e/scenario-entry.spec.ts`（本任务放第一条用例）。**Interfaces:** Consumes `SCENARIOS` / `activeScenario` / `useScenarioStore` / `useDatasetStore.loadSample`。Produces：`loadSample: (scenarioId?: ScenarioId) => Promise<void>`（缺省 survey，旧调用兼容）；`FileDropzone.sampleLabel?: string`（默认「体验示例数据」）；`ScenarioCards({ onLoadSample, busy })`。
- [ ] **Step 1: 写失败测试**：`datasetStore.test.ts` 的示例 describe 补两条，`resetStoreMocks()` 末尾加 `useScenarioStore.getState().reset()`，头部 import：
```ts
it('按场景加载示例：请求对应 URL，文件名与场景一起记录', async () => {
  mockParse.mockResolvedValue(okResult());
  const fetchMock = vi.fn().mockResolvedValue(new Response('学号,年龄\n001,20', { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  await useDatasetStore.getState().loadSample('experiment');
  expect(fetchMock).toHaveBeenCalledWith('/sample/experiment-data.csv');
  expect(mockParse).toHaveBeenCalledWith(expect.objectContaining({ fileName: '示例-实验数据.csv' }));
  expect(useScenarioStore.getState().scenarioId).toBe('experiment');
});
it('换文件时场景被清空，避免上一份数据的重点套到新数据上', async () => {
  mockParse.mockResolvedValue(okResult());
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('学号,年龄\n001,20', { status: 200 })));
  await useDatasetStore.getState().loadSample('education');
  await useDatasetStore.getState().loadFile(makeFile('年龄\n20\n30'));
  expect(useScenarioStore.getState().scenarioId).toBeNull();
});
```
- [ ] **Step 2: 跑红**：`node_modules/.bin/vitest.cmd run src/ui/stores/datasetStore.test.ts -t "按场景加载示例"` → FAIL（仍请求 `messy-survey.csv`）。
- [ ] **Step 3: 实现**：① `datasetStore.loadSample(scenarioId: ScenarioId = 'survey')` 用 `scenarioById(scenarioId)` 取 `sample.url/fileName`，成功后 `select(scenario.id)`；`adoptDataset` 里 `useRangeRuleStore...beginFile(...)` 旁加 `useScenarioStore.getState().beginFile(result.meta.fileName)`；`reset()` 里加 `useScenarioStore.getState().reset()`。② `FileDropzone` 加 `sampleLabel?: string`（按钮文案 `{sampleLabel ?? '体验示例数据'}`、`data-testid="sample-entry"`）。③ `ScenarioCards.tsx`：`<section aria-labelledby="scenario-title">`，标题「这份数据属于哪类研究？（可选）」，副文案「只决定下面标出的关注点与检查页的「本次重点」，**8 项检查仍然全部执行**」；`grid gap-3 sm:grid-cols-3`；每张 `<article data-testid="scenario-card" data-scenario={id} data-selected={selected}>`：标题、summary、三条关注点 `<ul>`、推荐检查用 `checkLabel(id)` 渲染 chip、「选为本次场景 / 已选为本次场景」（`aria-pressed`、`max-md:min-h-11`）、`data-testid={\`scenario-sample-${id}\`}` 的「用这份示例试试」，已选时给「清除场景选择」（调 `clear()`）。④ `import/page.tsx`：`const scenarioId = useScenarioStore((s) => s.scenarioId); const scenario = scenarioById(scenarioId);`；`openSample = async (id: ScenarioId = scenario?.id ?? 'survey')`；`!isReady` 时在 `<FileDropzone>` 前渲染 `<ScenarioCards busy={isBusy} onLoadSample={(id) => void openSample(id)} />`；`sampleLabel={scenario ? \`${scenario.title}示例\` : undefined}`；「当前是示例数据」提示保留标题（旧 E2E 断言它），正文改成「这份「{fileName}」是合成示例数据，不是你的真实数据」并改用 `parseResult.meta.fileName`。⑤ E2E 第一条：
```ts
import { test, expect } from '@playwright/test';
import { blockSemanticModelDownload, gotoHydrated } from './helpers';
test.beforeEach(async ({ page }) => { await blockSemanticModelDownload(page); });
test('首屏三张场景卡片，问卷示例走完整流程', async ({ page }) => {
  await gotoHydrated(page, '/import');
  await expect(page.getByTestId('scenario-card')).toHaveCount(3);
  await expect(page.getByTestId('scenario-card').filter({ hasText: '问卷数据' })).toContainText('编码');
  await expect(page.getByText(/8 项检查仍然全部执行/)).toBeVisible();
  await page.getByTestId('scenario-sample-survey').click();
  await expect(page.getByText('数据预览')).toBeVisible();
  await expect(page.getByText('共 7 行 × 5 列')).toBeVisible();
  await expect(page.getByText('当前是示例数据')).toBeVisible(); await expect(page.getByText(/合成示例/)).toBeVisible();
});
```
- [ ] **Step 4: 跑绿 + 旧用例**：`node_modules/.bin/vitest.cmd run src/ui/stores/datasetStore.test.ts` 全过；`node_modules/.bin/playwright.cmd test tests/e2e/scenario-entry.spec.ts tests/e2e/upload.spec.ts -g "场景卡片|体验示例数据"` → 2 passed（旧断言必须仍绿）。
- [ ] **Step 5: 提交**：`git add src/ui/components/ScenarioCards.tsx src/app/import/page.tsx src/ui/components/FileDropzone.tsx src/ui/stores/datasetStore.ts src/ui/stores/datasetStore.test.ts tests/e2e/scenario-entry.spec.ts && git commit -m "feat(scenario): 导入首屏场景卡片与按场景加载示例数据"`。

### Task 5: 检查页「本次重点」筛选 + 场景徽章 + 其余 E2E
**Files:** Modify `src/ui/components/IssueList.tsx`、`src/app/check/page.tsx`、`src/ui/components/DataContextBar.tsx`、`tests/e2e/scenario-entry.spec.ts`。**Interfaces:** Consumes `scenarioById` / `useScenarioStore` / `checkLabel`。Produces：`IssueList` 新 props `focusCheckIds?: readonly string[]`、`focusLabel?: string`；其余对外接口不变。
- [ ] **Step 1: 写失败 E2E**（追加三条，文件头补 `import { join } from 'node:path'; import { fixturesDir } from './helpers';`）
```ts
test('检查页「本次重点」只筛显示，不改变 8 项检查', async ({ page }) => {
  await gotoHydrated(page, '/import');
  await page.getByTestId('scenario-sample-survey').click();
  await expect(page.getByText('数据预览')).toBeVisible();
  await page.getByTestId('sidebar').getByRole('link', { name: '质量检查' }).click();
  await expect(page.getByText('8 项规则检查')).toBeVisible();
  await expect(page.getByTestId('scenario-focus-hint')).toContainText('8 项检查仍然全部执行');
  // 示例数据实际可检出：缺失（年龄 2 个空）、类型一致性（年龄混入 abc）、重复记录（002）——共 3 条
  const before = await page.getByTestId('issue-card').count(); expect(before).toBeGreaterThanOrEqual(3);
  await page.getByRole('button', { name: /本次重点/ }).click();
  const after = await page.getByTestId('issue-card').count(); expect(after).toBeGreaterThan(0); expect(after).toBeLessThan(before);
  // 「重复记录」不在问卷场景的重点（缺失/类型/类别同义）里，筛掉后不应再出现
  await expect(page.getByTestId('issue-card').filter({ hasText: '重复' })).toHaveCount(0);
});
test('刷新后场景跟数据一起恢复；换文件后场景清空', async ({ page }) => {
  await gotoHydrated(page, '/import');
  await page.getByTestId('scenario-sample-experiment').click();
  await expect(page.getByText('数据预览')).toBeVisible();
  await page.getByTestId('sidebar').getByRole('link', { name: '质量检查' }).click();
  await expect(page.getByTestId('scenario-badge')).toContainText('实验数据');
  await page.reload();
  await expect(page.getByTestId('scenario-badge')).toContainText('实验数据');
  await page.getByTestId('sidebar').getByRole('link', { name: '数据导入' }).click();
  await page.setInputFiles('input[type=file]', join(fixturesDir, 'messy-survey.csv'));
  await expect(page.getByText('数据预览')).toBeVisible();
  await page.getByTestId('sidebar').getByRole('link', { name: '质量检查' }).click();
  await expect(page.getByTestId('scenario-badge')).toHaveCount(0);
});
test('窄屏场景卡片按钮不小于 44px，且不横向溢出', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoHydrated(page, '/import');
  for (const id of ['survey', 'experiment', 'education']) {
    const box = await page.getByTestId(`scenario-sample-${id}`).boundingBox();
    expect(box?.height ?? 0, `${id} 示例按钮不足 44px`).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
});
```
- [ ] **Step 2: 跑红**：`node_modules/.bin/playwright.cmd test tests/e2e/scenario-entry.spec.ts` → 三条 FAIL（找不到 `scenario-badge` / 「本次重点」/ `scenario-focus-hint`）。
- [ ] **Step 3: 实现**：① `IssueList.tsx` 加 props 与 `const [focusOnly, setFocusOnly] = useState(false)`；`focusCount` 只数 `focusCheckIds` 内的 issue；在 severity chips 前（仅 `focusCount > 0`）渲染 `<FilterChip active={focusOnly} onClick={() => setFocusOnly((v) => !v)} count={focusCount}>本次重点</FilterChip>`；`filtered` 增加 `if (focusOnly && focusCheckIds && !focusCheckIds.includes(issue.checkId)) return false;`；`hasFilter` 含 `focusOnly`，「清除筛选」一并复位；换文件导致 `focusCheckIds` 变化时用 `useEffect(() => setFocusOnly(false), [focusCheckIds])` 复位，否则上一份数据的筛选会把新数据的清单藏空；`focusOnly` 下空清单的 EmptyState 文案提示换回「全部」。**不改**标题「共 N 条」与严重度统计（仍按全部问题算）。② `check/page.tsx`：读 `scenarioId`/`scenario`，左列 `<IssueList>` 上方渲染 `scenario ? <p data-testid="scenario-focus-hint" className="text-xs text-ink-muted">本次场景：{scenario.title} · 重点看 {scenario.recommendedCheckIds.map(checkLabel).join('、')}（8 项检查仍然全部执行）</p> : null`；传 `focusCheckIds` / `focusLabel`。**不动** PageHeader 的「8 项规则检查」与 `<CoverageMap />`。③ `DataContextBar.tsx`：读场景，在「示例数据」徽章后渲染 `scenario ? <Badge tone="neutral" data-testid="scenario-badge">场景：{scenario.title}</Badge> : null`（无场景不渲染）。
- [ ] **Step 4: 跑绿 + 旧用例**：`node_modules/.bin/playwright.cmd test tests/e2e/scenario-entry.spec.ts` → 4 passed；`node_modules/.bin/playwright.cmd test tests/e2e/upload.spec.ts tests/e2e/persistence.spec.ts tests/e2e/mobile-a11y.spec.ts` 全过；tsc 0。
- [ ] **Step 5: 提交**：`git add src/ui/components/IssueList.tsx src/app/check/page.tsx src/ui/components/DataContextBar.tsx tests/e2e/scenario-entry.spec.ts && git commit -m "feat(scenario): 检查页本次重点筛选与全局场景徽章"`。

### Task 6: 文档与数字同步（技术文档先删后加）
**Files:** Modify `docs/技术文档.md`（+ `pnpm doc:build` 产出的 `.docx/.pdf`）· `docs/开发交接说明.md` · `docs/交接-2026-10-21.md` · `docs/交接-2026-10-23-界面方案第一/二/三轮.md` · `docs/交接-2026-10-25-上下文交接.md` · `scripts/check-doc-facts.mjs` · `README.md` · `docs/代码导读与TS学习.md` · 设计文档 spec。**Interfaces:** Consumes 前五个任务产出的实现与测试数字；Produces 文档与代码一致、`doc:build` ≤30 页、`check:doc` 全过。

- [ ] **Step 1: 技术文档四处改动（先删后加）**：① §4.1 末尾加一条「**研究场景入口（2026-10-26，MVP）**：首屏可选「问卷数据 / 实验数据 / 教育数据」三个场景，每个场景给出三条关注点与推荐检查，并提供合成示例数据一键体验。场景只影响提示与检查页的「本次重点」筛选，**8 项检查始终全部执行**；不写入系统提示词、不做学科映射。」并把 §4.1 第三弹压缩为「**失败文案写「怎么办」而不是「解析错误」**：例如 PDF 会提示另存为 CSV 后重试。」抵消行数。② §7.1 表格单元测试/端到端改实测数字，E2E「覆盖什么」末尾追加「、研究场景入口与三份示例数据」。③ §1.4「工程质量」与 §8.1「798 个单元测试…」同步实测数字；§8.1 加一条「研究场景入口：三个场景卡片、合成示例与检查页「本次重点」筛选（8 项检查不减少，场景不进 Prompt）」。④ §2.2 功能表在 F13 后加一行 `| F14 | 研究场景入口（问卷 / 实验 / 教育场景化引导与合成示例） | P1 |`（与第 1 条的压缩抵消）；⑤ 图 1 仍是旧版导入页截图，**本次不重拍**；在 10-25 交接待办写明「部署后按原尺寸重拍 `docs/images/01-import.png`，页数不变」。改完跑：
```powershell
$env:TEMP='D:\tmp'; $env:TMP='D:\tmp'
$env:PYTHON='C:\Users\lt\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\python\python.exe'
$env:LO_KIT_NODE='D:\dsh-harness\resources\runtime\primary-runtime\dependencies\node\bin\node.exe'
$env:LO_KIT_CLI='D:\dsh-harness\resources\app.asar.unpacked\dsh\node_modules\@deepseek-ai\libreoffice-kit\lib\cli.js'
pnpm doc:build   # 期望页数 ≤30；超页先删，别硬提交
pnpm check:doc   # 数字没同步会在这里红
```
- [ ] **Step 2: 6 份 md + `check-doc-facts.mjs`**：用实测数字替换旧数字（`798`/`68`/`86` 与「8 跳过 / 1 跳过」），位置：`docs/开发交接说明.md` §一 测试行、`docs/交接-2026-10-21.md` §0 与 §2、`docs/交接-2026-10-23-界面方案第一/二/三轮.md` 各自测试段落、`docs/交接-2026-10-25-上下文交接.md` §1 门禁表。同时：`docs/开发交接说明.md` 追加 **§8.19 本轮会话（2026-10-26）：研究场景入口 MVP**（三个场景与三份合成示例、推荐检查只做提示/筛选、场景按文件归属 + sessionStorage、示例数据回归单测、门禁数字、已知局限含「示例是合成的 / 不接知识库学科 / 图 1 待部署后重拍」）；10-25 交接 §3 表格加一行「研究场景入口 MVP（2026-10-26，分支 `feat/scenario-entry`）」；`scripts/check-doc-facts.mjs` 把「测试规模」事实的 `doc`/`raw` 换成新数字，并新增：
```js
{ label: '研究场景入口：问卷数据 / 实验数据 / 教育数据三个场景',
  doc: ['问卷数据', '实验数据', '教育数据'],
  sources: ['src/ui/lib/scenarios.ts'], raw: ['问卷数据', '实验数据', '教育数据'] },
```
- [ ] **Step 3: README / 代码导读 / 设计文档**：README 测试行改实测数字，「已完成」表加 `| 研究场景入口 | 导入首屏三个场景卡片 + 合成示例 + 检查页「本次重点」筛选（8 项检查不减少） |`；`docs/代码导读与TS学习.md` 追加 **模块 41：研究场景入口**（场景为什么是纯数据、推荐检查 id 为什么必须来自 `CHECK_LABEL`、按文件归属的 sessionStorage 与 `rangeRuleStore` 的异同、示例回归如何防演示翻车；TS 语法讲 `as const satisfies`、字面量联合类型收窄、zustand 函数式更新），「待补充的模块」表加一行「研究场景入口 | 2026-10-26 MVP | 模块 41」；设计文档 §2.2 功能表 F13 后加 `| F14 | 研究场景入口（问卷 / 实验 / 教育场景化引导与合成示例） | P1 |`。
- [ ] **Step 4: 门禁并提交**：`pnpm doc:build` → 页数 ≤30；`pnpm check:doc` → 全过；再跑四道门禁；`git add docs scripts/check-doc-facts.mjs README.md`；`git status --short` 确认无 `docs/部署指南.docx`、无 `next-env.d.ts`；`git commit -m "docs: 研究场景入口文档与数字同步（技术文档仍 30 页）"`。

## 收尾：全分支审查与合并

- [ ] **Step 1: 分支自检**：`git status --short`（工作区只剩未跟踪的 `docs/部署指南.docx`）；`git diff --stat main...HEAD`；`git diff --stat main...HEAD | Select-String 'src/core/','src/worker/','src/agent/','src/knowledge/'` —— **必须无输出**（本功能不碰检查引擎、Worker、Agent、知识库）。
- [ ] **Step 2: 派全新上下文审查者**只读检查 `git diff main...HEAD` + 本计划：核对 Review Focus 五条，主动构造反例（推荐检查为空或未知 id、刷新与换文件两种时序、示例按钮连点、窄屏卡片溢出），按 Critical / Important / Minor 出报告。
- [ ] **Step 3: 修复 Critical 与 Important**：每条先补一条会失败的测试再修；修完重跑四道门禁，单独提交（多行中文提交信息写进 `D:\tmp` 文件后用 `git commit -F`）。
- [ ] **Step 4: `--no-ff` 合并并在合并结果上重跑门禁**：
  ```powershell
  git checkout main
  git merge --no-ff feat/scenario-entry -m "merge: 研究场景入口 MVP（场景卡片 / 示例数据 / 本次重点筛选）"
  node_modules/.bin/tsc.cmd --noEmit
  pnpm test
  pnpm test:e2e
  pnpm build
  ```
  期望四道门禁全绿、路由仍是六个。**不推送**：远端推送与线上部署由所有者决定（网络兜底流程见交接 §6；不要 force push）。
- [ ] **Step 5: 删分支并汇报**：`git branch -d feat/scenario-entry`；`git log --oneline -8`。汇报：文件清单、任务与估时、单测/E2E 的 passed/skipped/文件数、`doc:build` 页数与 `check:doc` 项数、审查发现与修复、仍未拍板的问题（是否部署后重拍 `01-import.png`）。

---

## Self-Review

**1. 需求覆盖**

| 需求 | 落在哪个任务 |
| --- | --- |
| 首屏三个场景卡片（问卷 / 实验 / 教育）与关注点 | Task 1 定义 + Task 4 UI |
| 「推荐检查」可调整但不减运行项 | Task 1 数据 + Task 5 筛选（8 项照跑；E2E 与收尾 diff 双保险） |
| 每个场景的示例数据入口 | Task 2 数据 + Task 4 `loadSample(scenarioId)` |
| 场景跟到检查页与全局上下文条 | Task 5 `IssueList` 筛选 + `DataContextBar` 徽章 |
| 刷新 / 换文件后的场景归属 | Task 3 store + Task 5 E2E |
| 文档与数字同步 | Task 6 |
| 审查、`--no-ff`、合并后复测 | 收尾 |

**已知缺口（写明理由）**：场景不写进 Prompt、不做知识库学科映射、不做场景专属检查项（避免「场景＝学科」被编造）；三份示例都是合成数据；图 1 重拍留到部署之后。

**2. 占位符扫描**：无 `TBD` / `TODO` / 「类似 Task N」。`EXPECTED` 只断言「至少命中」的 checkId，且已按 core 的阈值与判据核算（`unit-consistency` 不在问卷示例的预期里）。

**3. 类型与命名一致**：`ScenarioId` / `Scenario` / `SCENARIOS` / `scenarioById` / `isScenarioId` / `activeScenario` / `loadSample(scenarioId?)` / `sampleLabel` / `focusCheckIds` / `focusLabel` 跨任务一致；测试条数按实际 `it` 数（Task 1 为 5 条、Task 2 累计 9 条）。

**4. Review Focus → 测试**：①→Task 5 E2E + 收尾 diff（`src/core/`、`src/worker/`、`coverageMap.ts` 零改动）；②→Task 2 真实 `parseCsv` / `runAllChecks` 回归；③→Task 3 单测 + Task 5 刷新 / 换文件 E2E；④→Task 1 断言无 subject 字段 + 收尾 diff（`src/agent/`、`src/knowledge/` 零改动）；⑤→Task 4 / Task 5 明确列出必须保持绿的旧用例，收尾跑全量 E2E。

## 需要所有者拍板（开工前确认）

1. **问卷示例微调**：把第 6 行「年龄」改空（`missing` 变成 2/7、越过 20% 阈值），示例才会真实检出「缺失」；这会改变演示数据的缺失计数，接受吗？
2. **技术文档页数**：新增 F14 行 + §4.1 场景段约 2–3 行，计划靠压缩 §4.1 第三弹抵消；若 `doc:build` 仍超 30 页，是否允许继续压缩 §7.1 长清单或 §1.3 能力表？
3. **图 1 重拍时机**：本轮不重拍（未重新部署）；部署后按原尺寸重拍 `docs/images/01-import.png`，是否安排？
4. **示例数据的学科口径**：两份新示例按合成数据标注，是否需要老师 / 团队再审一遍内容？
5. **合并后推送与部署**：计划只到本地合并；推送 `origin/main`、Vercel 部署与线上六路由冒烟按所有者节奏单独执行。
