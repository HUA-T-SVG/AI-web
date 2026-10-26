# 数据处理方法草稿（MVP）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `/export` 增加一份**纯确定性模板拼装**的「数据处理方法草稿」：从可读报告已有的留痕 / 检查覆盖 / 人工决定 / 检查结论生成 6 段方法文字与免责声明，随预览、Word 附录、Markdown 下载三处同源输出；全程不调用大模型，也不重算任何数据统计。

**Architecture:** 新增 `src/ui/lib/methodDraft.ts` 纯函数，输入是 `ReadableReport` 已有的同一批数据 + 两个元数据（用户配置的值域规则、规则库规模）；`buildReadableReport` 是唯一生成点，`ReadableReport.methodDraft` 只承载、不再解释。为了让草稿能如实写「本次未进行」，先给检查覆盖地图补两类缺口（有效观测 <4 不做异常值判定、缺失率 <20% 不作为问题报告），阈值常量从 `core` 导出共用，草稿只读 `coverage.gaps`，不另算数字。三个消费方（预览 / Word / Markdown）都只读 `methodDraft`，不各拼一套。

**Tech Stack:** Next.js 16（App Router）+ React 19 + TypeScript strict · Vitest · Playwright · `docx@9` · 既有 `report.ts` / `reportDocx.ts` / `coverageMap.ts` / `core`

**Spec:** 没有独立设计文档；需求真源是 2026-10-26 所有者交办的《数据处理方法草稿（MVP）》（本计划 Goal 与 Global Constraints 已完整转录）。关联设计文档 §4.7（导出与报告）、§6.5（留痕）：`docs/superpowers/specs/2026-10-09-data-quality-agent-design.md`。若与代码冲突，以代码与测试为准并回来改本计划。

**前置状态（开工前核对一次）：** `main` 与 `origin/main` 一致；工作区只有未跟踪的 `docs/部署指南.docx`（**不要提交**）；基线：`tsc` 0 error · 单测 **798 passed / 8 skipped / 68 文件** · E2E **86 passed / 1 skipped** · `pnpm build` 成功 · 技术文档 **30/30 页** · `pnpm check:doc` 30 项。本计划是 2026-10-26 三份计划中的第 2 份（建议执行顺序：研究场景入口 → 数据处理方法草稿 → AI 主动追问）；三份都要改同一批文档与测试数字，必须顺序执行、逐个合并，**不要并行跑 E2E**（共用 3000 端口与 `.next`）。若前序计划已合并，基线数字以 `pnpm test` / `pnpm test:e2e` 实测为准。本计划会改 `src/core/checks/`（导出阈值常量）与 `coverageMap.ts`（补覆盖缺口），这是草稿能如实写「本次未进行」的前提，与另外两份计划不冲突。

## Global Constraints

- **确定性、绝不接 LLM。** `methodDraft.ts` 不得 import `@/agent`、不得 `fetch(`、不得读时钟或随机数；同一输入两次输出必须深相等（单测钉住）。方法文字只能是模板拼接。
- **浏览器本地生成。** 草稿、Markdown 下载、Word 附录都在前端算完，不新增服务端接口，原始数据不出浏览器。
- **数字只有一套口径。** 草稿只读 `ReadableReport` 的 `summary` / `steps` / `decisions` / `risks` / `checks` / `coverage`；行数、删除行、改写单元格一律用 `summary`，不重算、不并行给出第二套数。
- **方法阈值与 core 一致。** 缺失率 20%/50%、异常值 IQR 与最少 4 个有效观测，常量从 `core` 导出后共用；小样本与低缺失率只能写「本次未进行」，不能写「采用 IQR 判定」。
- **四态必须逐一说清。** 未执行清洗 / 检查未完成（含失败、未开始）/ 结论属于旧版本 / 无覆盖数据，四态下都不能给出像结论的数字。
- **免责声明只有一个来源。** `METHOD_DRAFT_DISCLAIMER`；预览、Word 附录、Markdown 下载三处都引用它。预览与 Markdown 由 E2E 逐字比对，Word 由 `methodDraftLines()` 输出（单测钉住最后一条）。
- **全中文 + TDD。** 界面文案、代码注释、提交信息全中文；注释解释「为什么」。每任务先写失败测试 → 确认失败 → 实现 → 通过 → 提交，一个提交一件事。
- **门禁（PowerShell，先设环境变量）：**
```powershell
Set-Location 'D:\传智杯-AI web网页开发'
$env:TEMP='D:\tmp'; $env:TMP='D:\tmp'; $env:PLAYWRIGHT_BROWSERS_PATH='D:\ms-playwright'
node_modules/.bin/tsc.cmd --noEmit                   # 期望 0 error
& 'D:\npm-global\pnpm.cmd' test                      # 期望全绿（8 skipped）
& 'D:\npm-global\pnpm.cmd' test:e2e                  # 期望全绿（1 skipped）
& 'D:\npm-global\pnpm.cmd' build                     # 期望成功
& 'D:\npm-global\pnpm.cmd' lint                      # 0 error / 201 warning 是现状
```

- **技术文档 30/30 已顶满**：`pnpm doc:build` 超页直接失败，所以只允许「先删后加」，最后必须仍为 30 页。
- **不要提交**：`docs/部署指南.docx`、`next-env.d.ts`（build 会抖）、`knowledge/reports/` 的测试噪声；`.tmp/` 是忽略目录。

## Review Focus

1. **草稿替作者背书** —— 把「草稿」写成可直接提交的方法学，或出现「本研究采用…」的既成事实。Task 2 钉：标题含「草稿」、正文不匹配 `/本研究(采用|使用)/`、免责声明含「不能直接作为正式论文或报告提交」。
2. **小样本写成虚假方法** —— 3 个观测也写「采用 IQR 判定」、10% 缺失写成「无缺失」。Task 1 钉 core 行为与覆盖缺口；Task 2 钉草稿写「本次未做判定 / 未作为问题报告」。
3. **三处免责声明不同源** —— Task 2 钉常量 / `methodDraftLines` / Markdown 三处同一文本；Task 4 的 E2E 从预览读文本、断言它逐字出现在下载的 `.md` 里。
4. **重复计算数字出现两套口径** —— Task 2 钉：改 fixture 的 `changedCells` / 删除行，草稿文字跟着变，且不读 `fieldChanges` 另算。
5. **规则引用捏造** —— 不出现 `general-` 前缀；只出现用户配置的 `user-range:`；规则库索引没加载时如实说「未加载」（Task 2）。
6. **四态被折叠成一句话** —— Task 2 四态各一条用例，Task 3 钉接线。

## File Structure

| 类型 | 文件 | 职责 |
| --- | --- | --- |
| 新建 | `src/ui/lib/methodDraft.ts` | 草稿纯函数与文案：`buildMethodDraft` / `methodDraftLines` / `formatMethodDraftMarkdown` / 常量 |
| 新建 | `src/ui/lib/methodDraft.test.ts` | 四态、小样本、归并口径、人工复核、未执行、规则引用、免责声明、确定性 |
| 改 | `src/core/checks/outliers.ts` / `missing.ts` / `index.ts` | 导出 `MIN_OUTLIER_OBSERVATIONS = 4`、`DEFAULT_MISSING_LOW_THRESHOLD = 0.2`、`DEFAULT_MISSING_HIGH_THRESHOLD = 0.5` |
| 改 | `src/ui/lib/coverageMap.ts` + `.test.ts` | 两类「检查跑了但没结论」的缺口；测试 +2 |
| 改 | `src/ui/lib/report.ts` + `.test.ts` | `ReportStep.mergeResolution`、`ReportCoverageRow.gaps`、`methodDraft` 字段与两个输入；测试 +4 |
| 改 | `src/ui/components/ReportDocument.tsx` | 报告末尾「附：数据处理方法草稿」预览段（打印同一份 DOM） |
| 改 | `src/ui/lib/reportDocx.ts` + `.test.ts` | Word 末尾附录（由 `methodDraftLines` 渲染，不改一~八章编号）；测试 +1 |
| 改 | `src/ui/components/ExportPanel.tsx` | 传 `rangeRules` / 规则库规模；新增 `.md` 下载；「四样产出」→「五样」 |
| 改 | `tests/e2e/quality-report.spec.ts` | +1 条：草稿预览、免责声明、`.md` 下载同源 |
| 改 | `docs/技术文档.md` / `README.md` / 6 份交接 md / `scripts/check-doc-facts.mjs` / `docs/代码导读与TS学习.md` / `docs/images/04-export.png` | Task 5 文档与数字同步、新模块、截图 |

分支：`git checkout -b feat/method-draft`（Task 1 开始前建，Task 5 合并后删）。

### Task 1: 覆盖缺口与报告透传（后续任务的输入）
**Files:**
- Modify: `src/core/checks/outliers.ts:17-18,35`、`src/core/checks/missing.ts:6-14`、`src/core/checks/index.ts:189-191`
- Modify: `src/ui/lib/coverageMap.ts`（`buildFieldRow`；`BuildContext` 加 `rowCount`）、`src/ui/lib/coverageMap.test.ts`
- Modify: `src/ui/lib/report.ts:115-144,248-302,621-646`、`src/ui/lib/report.test.ts`

**Interfaces:** Produces `MIN_OUTLIER_OBSERVATIONS = 4`、`DEFAULT_MISSING_LOW_THRESHOLD = 0.2`（从 `@/core`）；`CoverageGap` 新增 `kind: 'not-run'` 的「异常值」「缺失值」缺口；`ReportStep.mergeResolution?: MergeResolution`；`ReportCoverageRow.gaps: ReportCoverageGap[]`，`ReportCoverageGap = { kind: CoverageGap['kind']; capability: string; reason: string }`。
- [ ] **Step 1: 写两条失败的覆盖地图测试**（`coverageMap.test.ts`，顶部加 `import { runAllChecks, type Dataset } from '@/core';`）
```ts
it('有效观测少于 4 个：core 不判异常值，地图写「本次未进行」', () => {
  const small: Dataset = { rowCount: 3, columns: [{ name: '年龄', values: [20, 21, 22] }] };
  expect(runAllChecks(small).filter((issue) => issue.checkId === 'outliers')).toHaveLength(0);
  const map = buildCoverageMap(coverageInput({ profile: { rowCount: 3, columnCount: 1, duplicateColumnNames: [], columns: [column('年龄', 'number')] } }));
  expect(fieldOf(map, '年龄').completed).not.toContain('outliers');
  expect(gapOf(fieldOf(map, '年龄'), '异常值')?.kind).toBe('not-run');
  expect(gapOf(fieldOf(map, '年龄'), '异常值')?.reason).toContain('有效观测 3 个');
});
it('缺失率低于 20%：core 不报告，地图写「未作为问题报告」', () => {
  const thin: Dataset = { rowCount: 10, columns: [{ name: '备注', values: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', null] }] };
  expect(runAllChecks(thin).filter((issue) => issue.checkId === 'missing')).toHaveLength(0);
  const map = buildCoverageMap(coverageInput({ profile: { rowCount: 10, columnCount: 1, duplicateColumnNames: [], columns: [column('备注', 'text', { missingCount: 1, missingRate: 0.1 })] } }));
  const gap = gapOf(fieldOf(map, '备注'), '缺失值');
  expect(fieldOf(map, '备注').completed).not.toContain('missing');
  expect(gap?.kind).toBe('not-run');
  expect(gap?.reason).toContain('10.0%');
  expect(gap?.reason).toContain('20%');
});
```
- [ ] **Step 2: 跑它确认失败**：`node_modules/.bin/vitest.cmd run src/ui/lib/coverageMap.test.ts` → FAIL（`completed` 里仍有 `outliers` / `missing`）。
- [ ] **Step 3: 导出 core 阈值常量并补缺口**

`outliers.ts`：`const MIN_OBSERVATIONS = 4;` → `export const MIN_OUTLIER_OBSERVATIONS = 4;`（注释加「覆盖地图与报告要引用同一阈值」），函数体改用新名。`missing.ts` 加两个导出常量并把函数默认值改为它们。`checks/index.ts` 末尾追加 `export { MIN_OUTLIER_OBSERVATIONS } from './outliers';` 与 `export { DEFAULT_MISSING_LOW_THRESHOLD } from './missing';`。

`coverageMap.ts`：第 1 行改为 `import { DEFAULT_MISSING_LOW_THRESHOLD, MIN_OUTLIER_OBSERVATIONS, type ColumnProfile, type ColumnType, type DatasetProfile, type QualityIssue, type RangeRule } from '@/core';`；`BuildContext` 加 `rowCount: number`，建 context 时传 `rowCount: input.profile.rowCount`；`buildFieldRow` 改两处：
```ts
for (const checkId of COLUMN_BASE_CHECKS) {
  if (checkId === 'missing' && !context.failedChecks.has('missing') &&
      column.missingCount > 0 && column.missingRate < DEFAULT_MISSING_LOW_THRESHOLD) {
    addGap(gaps, { kind: 'not-run', capability: '缺失值', action: null,
      reason: `缺失率 ${(column.missingRate * 100).toFixed(1)}% 低于 ${DEFAULT_MISSING_LOW_THRESHOLD * 100}% 的报告阈值，本次未作为问题报告（缺失仍存在于数据中）` });
    continue;
  }
  markExecuted(checkId, completed, gaps, context.failedChecks);
}
// 异常值分支换成：
if (column.type === 'number') {
  const observed = context.rowCount - column.missingCount;
  if (!context.failedChecks.has('outliers') && observed < MIN_OUTLIER_OBSERVATIONS) {
    addGap(gaps, { kind: 'not-run', capability: '异常值', action: null,
      reason: `有效观测 ${observed} 个，少于 ${MIN_OUTLIER_OBSERVATIONS} 个时四分位数不稳定，本次不做异常值判定` });
  } else markExecuted('outliers', completed, gaps, context.failedChecks);
}
```
- [ ] **Step 4: 报告透传（先失败测试、再实现）**。`report.test.ts` 追加两条：第一，`step({ index: 0, actionType: 'merge_categories', mergeResolution: { column: '学历', groups: [{ winner: '硕士', mapping: { 研究生: '硕士' } }] } })` 经 `buildReadableReport` 后 `report.steps[0]?.mergeResolution?.groups[0]?.winner === '硕士'`；第二，`buildReadableReport(baseInput({ coverageMap: coverageInput() })).coverage!.table.gaps` 中存在 `{ kind: 'not-applicable', capability: '跨表检查' }` 且其 `reason` 含「单数据集」。先跑 `src/ui/lib/report.test.ts` 确认 FAIL，再改 `report.ts`：第 1 行加 `type MergeResolution`；`import type { CoverageGap, CoverageMap } from './coverageMap';`；`ReportStep` 加 `mergeResolution?: MergeResolution;`；`toReportStep` 追加 `...(step.mergeResolution !== undefined ? { mergeResolution: step.mergeResolution } : {})`；新增 `ReportCoverageGap` 接口、`ReportCoverageRow.gaps` 字段，`toCoverageRow` 里 `gaps: row.gaps.map((gap) => ({ kind: gap.kind, capability: gap.capability, reason: gap.reason })),`。
- [ ] **Step 5: 两个测试文件都绿 + 四道门禁 + 提交**。`Run: node_modules/.bin/vitest.cmd run src/ui/lib/coverageMap.test.ts src/ui/lib/report.test.ts` → PASS；跑 Global Constraints 的四道门禁，全绿后 `git add` 上述 7 个文件并 `git commit -m "feat(报告): 覆盖地图如实标出小样本与低缺失率未进行"`。

### Task 2: 方法草稿纯函数（四态 / 六段 / 免责声明）
**Files:** Create `src/ui/lib/methodDraft.ts`；Test `src/ui/lib/methodDraft.test.ts`。

**Interfaces:**
- Consumes: `ReadableReport`（Task 1 已补齐 `steps[].mergeResolution` 与 `coverage.*.gaps`）、`RangeRule` 与 `listChecks()`（`@/core`）。**报告已把 `DECISION_TEXT` / `actionText` / `formatParams` 的结果算成 `decisionText` / `actionText` / `paramsText`，草稿只读这些成品字段，不重复调用三个助手**（同一句话不能有两处拼装）。
- Produces: `METHOD_DRAFT_TITLE` / `METHOD_DRAFT_APPENDIX_HEADING` / `METHOD_DRAFT_CAVEAT_HEADING` / `METHOD_DRAFT_DISCLAIMER` / `METHOD_DRAFT_CLAIM_FORBIDDEN`；`MethodDraft { title; sections: MethodDraftSection[]; caveats: string[]; disclaimer }`；`MethodDraftSection { heading; paragraphs: string[] }`；`MethodDraftLine { kind: 'title'|'heading'|'body'|'caveat'|'disclaimer'; text }`；`MethodDraftReport = Omit<ReadableReport, 'methodDraft'>`；`MethodDraftKnowledgeBase { total; verified }`；`MethodDraftInput { report: MethodDraftReport; rangeRules: readonly RangeRule[]; knowledgeBase: MethodDraftKnowledgeBase | null }`；`buildMethodDraft` / `methodDraftLines` / `formatMethodDraftMarkdown`。
- [ ] **Step 1: 写失败的测试文件**（用真实 `buildReadableReport` 造输入，不再手抄报告形状）
```ts
import { describe, expect, it } from 'vitest';
import type { Provenance, ProvenanceStep } from '@/scriptgen';
import { buildCoverageMap } from './coverageMap';
import { buildReadableReport, type ReadableReportInput } from './report';
import { METHOD_DRAFT_CLAIM_FORBIDDEN, METHOD_DRAFT_DISCLAIMER, METHOD_DRAFT_TITLE,
  buildMethodDraft, formatMethodDraftMarkdown, methodDraftLines, type MethodDraft, type MethodDraftInput } from './methodDraft';
const mergeStep = (o: Partial<ProvenanceStep> = {}): ProvenanceStep => ({
  index: 0, actionType: 'merge_categories', targetColumns: ['学历'], appliedAt: '2026-10-26T01:00:00.000Z',
  params: { column: '学历', groups: [['硕士', '研究生']] }, changedCells: 1, beforeRowCount: 7, afterRowCount: 7,
  mergeResolution: { column: '学历', groups: [{ winner: '硕士', mapping: { 研究生: '硕士' } }] }, ...o });
const deleteStep: ProvenanceStep = { index: 1, actionType: 'remove_duplicates', targetColumns: [], params: {},
  appliedAt: '2026-10-26T01:30:00.000Z', changedCells: 1, beforeRowCount: 7, afterRowCount: 6 };
const provenanceOf = (steps: ProvenanceStep[] = [mergeStep(), deleteStep]): Provenance => ({
  datasetFingerprint: '1a2b3c4d', resultFingerprint: '5e6f7a8b', sessionStartedAt: '2026-10-26T00:00:00.000Z',
  completedAt: '2026-10-26T00:30:00.000Z', steps, decisions: [], generatedScript: '',
  environment: { appVersion: '0.1.0', ruleLibraryVersion: '178 条', embeddingModel: 'bge(q8)', dataVersion: 3 } });
const coverage = (rowCount = 3) => buildCoverageMap({
  profile: { rowCount, columnCount: 2, duplicateColumnNames: [], columns: [
    { name: '年龄', type: 'number', missingCount: 0, missingRate: 0, uniqueCount: 3, samples: [] },
    { name: '备注', type: 'text', missingCount: 1, missingRate: 0.1, uniqueCount: 2, samples: [] }] },
  issues: [], checksStatus: 'done', checksVersion: 3, dataVersion: 3, synonymStatus: 'ready', rangeRules: [] });
const reportOf = (o: Partial<ReadableReportInput> = {}) => buildReadableReport({
  sourceFileName: 'messy-survey.csv', dataVersion: 3, generatedAt: '2026-10-26T02:00:00.000Z', provenance: provenanceOf(),
  originalRowCount: 7, currentRowCount: 6, originalColumnCount: 6, currentColumnCount: 6, fieldChanges: [], rowDelta: -1,
  skipped: [], reviewItems: [], runVersion: 3, executedVersion: 3, checksVersion: 3, checksStatus: 'done',
  checkIssues: [{ severity: 'high', columns: ['年龄'], checkId: 'outliers' }], coverageMap: coverage(), ...o });
const draftOf = (o: Partial<ReadableReportInput> = {}, rules: MethodDraftInput['rangeRules'] = [],
  kb: MethodDraftInput['knowledgeBase'] = { total: 178, verified: 104 }) =>
  buildMethodDraft({ report: reportOf(o), rangeRules: rules, knowledgeBase: kb });
const text = (draft: MethodDraft) => draft.sections.flatMap((s) => s.paragraphs).join('\n');
```
用例（每条 2–4 行，断言照抄，全部写在 `methodDraft.test.ts` 的 `describe` 里）：

| 用例 | 关键断言 |
| --- | --- |
| 确定性 / 不接模型 / 不替作者背书 | `expect(draftOf()).toEqual(draftOf())`；`text(draftOf())` 不匹配 `METHOD_DRAFT_CLAIM_FORBIDDEN`；`title === METHOD_DRAFT_TITLE`；六段 heading 依次为 `一、样本与字段`…`六、依据与边界`；`readFileSync(new URL('./methodDraft.ts', import.meta.url), 'utf8')` 不匹配 `/from\s+['"]@\/agent/`、`/\bfetch\(/`、`/streamText\|generateText/` |
| 未执行清洗 | `draftOf({ provenance: provenanceOf([]), currentRowCount: 7, rowDelta: 0 })` 文本含「本次未执行任何清洗动作」、不含「步处理」、含「没有类别归并」 |
| 清洗后数字来自 summary | 含「原始 7 行 × 6 列」「删除记录 1 行」「改写单元格 1 个」；`provenanceOf([mergeStep({ changedCells: 99 }), deleteStep])` 时含「改写单元格 99 个」 |
| 四态 | `checksStatus: 'running'` 文本含「本次没有可用的检查结论」；`checksVersion: 1` 的 `caveats.join('')` 含「旧数据版本」；`coverageMap: null` 的 caveats 含「没有拿到字段画像与覆盖数据」 |
| 小样本 / 低缺失率 | 文本含「异常值：下列字段本次未做异常值判定」「有效观测 3 个」「缺失值：下列字段本次未得出可报告的缺失结论」「10.0%」；且不匹配 `/「年龄」[^。]*IQR/` |
| 归并口径 | 含「「研究生」统一为「硕士」」与「出现次数最多者胜」 |
| 人工复核 | 用 `reviewItems: [{ issue: { title: '备注列存在缺失', severity: 'medium', suggestion: { action: 'fill_missing', params: { column: '备注' }, rationale: '缺失比例高' } }, decision: 'rejected', note: '缺失本身有含义' }]`：含「拒绝并保留原值 1 条」「理由：缺失本身有含义」；同一条把 `note` 去掉后含「没有填写理由」 |
| 未执行动作 | `skipped: [{ action: { action: 'unify_units', params: { column: '单位' }, rationale: '单位写法不一', columns: ['单位'] }, reason: '缺少目标单位' }]`：文本含「未执行」与「缺少目标单位」 |
| 规则引用 | `draftOf({}, [{ id: 'user-range:年龄', column: '年龄', min: 0, max: 120 }])` 含 `user-range:年龄`、不匹配 `/general-[a-z0-9-]+/`；`draftOf({}, [], null)` 含「规则库索引本次没有加载出来」 |
| 免责声明同源 | `draft.disclaimer === METHOD_DRAFT_DISCLAIMER`；`methodDraftLines(draft).at(-1)` 等于 `{ kind: 'disclaimer', text: METHOD_DRAFT_DISCLAIMER }`；Markdown 含该常量与 `# 数据处理方法（草稿）` |

- [ ] **Step 2: 跑它确认失败**：`node_modules/.bin/vitest.cmd run src/ui/lib/methodDraft.test.ts` → FAIL（`Failed to resolve import './methodDraft'`）。
- [ ] **Step 3: 实现类型、常量、六段正文与 caveats**
```ts
import { listChecks, type RangeRule } from '@/core';
import type { ReadableReport, ReportCoverageRow } from './report';
export const METHOD_DRAFT_TITLE = '数据处理方法（草稿）';
export const METHOD_DRAFT_APPENDIX_HEADING = '附：数据处理方法草稿';
export const METHOD_DRAFT_CAVEAT_HEADING = '需要作者核对的要点';
export const METHOD_DRAFT_DISCLAIMER =
  '本文是根据本次处理记录自动生成的草稿，仅供参考；其中的方法描述、数字与表述须由作者对照原始数据与目标期刊' +
  '（或学校）的要求逐条核对、改写，不能直接作为正式论文或报告提交。';
/** 草稿不得替作者写成既成事实；单测用它守「本研究采用…」这类背书 */
export const METHOD_DRAFT_CLAIM_FORBIDDEN = /本研究(采用|使用)/;
export interface MethodDraftSection { heading: string; paragraphs: string[] }
export interface MethodDraft { title: string; sections: MethodDraftSection[]; caveats: string[]; disclaimer: string }
export type MethodDraftLineKind = 'title' | 'heading' | 'body' | 'caveat' | 'disclaimer';
export interface MethodDraftLine { kind: MethodDraftLineKind; text: string }
export type MethodDraftReport = Omit<ReadableReport, 'methodDraft'>;
export interface MethodDraftKnowledgeBase { total: number; verified: number }
export interface MethodDraftInput { report: MethodDraftReport; rangeRules: readonly RangeRule[]; knowledgeBase: MethodDraftKnowledgeBase | null }
const CHECK_METHOD = `系统内置 ${listChecks().length} 项确定性检查（${listChecks().map((check) => check.title).join('、')}）。缺失值检查按缺失率报告：≥20% 记为问题、≥50% 记为严重；异常值检查采用 IQR（Tukey 1.5 倍四分位距），有效观测少于 4 个时不判定。`;
const gapList = (rows: readonly ReportCoverageRow[], capability: string) => rows.flatMap((row) =>
  row.gaps.filter((gap) => gap.capability === capability).map((gap) => `「${row.column}」（${gap.reason}）`));
export function buildMethodDraft(input: MethodDraftInput): MethodDraft {
  const { report } = input;
  return { title: METHOD_DRAFT_TITLE, sections: [sampleSection(report), checksSection(report), mergeSection(report),
    reviewSection(report), skippedSection(report), basisSection(report, input.rangeRules, input.knowledgeBase)],
    caveats: buildCaveats(report), disclaimer: METHOD_DRAFT_DISCLAIMER };
}
```

六个 section 的固定内容（返回 `{ heading, paragraphs }`，措辞照抄，变量用 `${…}` 标出；`summary` 为 `report.summary`）：

| 段 | heading | paragraphs |
| --- | --- | --- |
| ① | `一、样本与字段` | `本次分析使用文件《${report.sourceFileName}》导入的数据：原始 ${summary.beforeRowCount} 行 × ${summary.beforeColumnCount} 列。`；`summary.isEmpty` 时第二段 `本次未执行任何清洗动作，数据保持导入时的原样（${summary.afterRowCount} 行 × ${summary.afterColumnCount} 列）；下面的描述不含清洗与字段改造。`，否则 `经 ${summary.actionCount} 步处理（数据版本 v${report.dataVersion}）后为 ${summary.afterRowCount} 行 × ${summary.afterColumnCount} 列；其中删除记录 ${summary.deletedRows} 行，改写单元格 ${summary.changedCells} 个。删除行不计入改写单元格，两者不重复累加。` |
| ② | `二、缺失与异常` | 先放 `CHECK_METHOD`。`report.checks.state === 'done' && counts !== null` 时追加 `本次检查已完成：检出问题 ${counts.issueCount} 条（严重 ${counts.high}、中等 ${counts.medium}、轻微 ${counts.low}），涉及 ${counts.fieldCount} 个字段。`，否则追加 `本次没有可用的检查结论：${report.checks.summary}本节只说明方法，不引用检查结果，也不据此判断缺失或异常情况。` 覆盖三选一：`coverage === null` → `本报告没有字段画像与覆盖数据，无法逐字段说明哪些检查本次未进行；「没有发现问题」不能读成「数据没有问题」。`；`!coverage.trustworthy` → `检查覆盖情况未知：${coverage.summary}因此不逐字段声称已检查或未检查。`；可信时 `gapList(fields, '缺失值')` 非空写 `缺失值：下列字段本次未得出可报告的缺失结论——${…join('；')}。`，`gapList(fields, '异常值')` 非空写 `异常值：下列字段本次未做异常值判定——${…join('；')}。`，两者都空写 `按覆盖记录，缺失值与异常值检查本次已在适用的字段上执行；未检出问题不代表数据没有缺陷。` |
| ③ | `三、类别归并口径` | `report.steps.filter((step) => step.mergeResolution !== undefined)`；为空时 `summary.isEmpty` 写「本次未执行清洗动作，因此没有类别归并。」否则「本次未执行类别归并动作。类别同义写法只作为待确认建议提交人工判断，系统不会自动归并。」；非空逐列写 `本次对「${column}」列执行了类别归并：${「研究生」统一为「硕士」…}。归并方向由执行时各取值的出现次数决定（出现次数最多者胜，并列时取组内原有顺序的第一个），处理留痕与导出脚本按同一份记录重放。`，最后追加 `语义相似度只用于提出待确认候选，不自动改变数据。` |
| ④ | `四、人工复核` | 无 decisions 写 `本次分析没有留下人工复核记录。`；否则首段 `本次共复核 AI 建议 ${n} 条：接受 ${accepted} 条、修改参数后接受 ${modified} 条、拒绝并保留原值 ${rejected} 条、待确认 ${pending} 条。`；有 `hasNote` 时追加 `复核中记录的理由：` + 每条 `「${title}」${decisionText}，理由：${note}。`，否则追加 `本次复核没有填写理由：这些决定没有留下可引用的判断依据。` |
| ⑤ | `五、未执行的动作与原因` | 无 `report.risks.skipped` 写 `本次没有未执行的动作。`；否则 `本次有 ${n} 条动作未执行：${actionText（reason）…}。这些动作没有改动数据，方法段不能写成已执行。` |
| ⑥ | `六、依据与边界` | 依次：`数据处理与检查全部在浏览器本地完成，原始数据没有上传；系统不做统计建模、推断统计或研究设计。`；`检查能力为固定实现：${listChecks 标题}；这些是确定性规则，不做统计推断。`；`rangeRules` 为空 `本次没有配置领域值域规则：「取值范围」检查在未配置的字段上没有给出结论，不能作为领域口径的依据。` 否则 `本次由用户配置了 ${n} 条领域值域规则：${「列」下界/上界/允许取值，规则标识 id}。这是本报告中唯一可逐条追溯到具体规则的依据。`；`knowledgeBase === null` 写 `规则库索引本次没有加载出来，无法说明参考了多少条规则，也不能声称引用了具体规则。` 否则 `分析阶段参考了领域规则库（共 ${total} 条，其中团队已核对 ${verified} 条、待核对 ${total - verified} 条）；检索命中不写入处理留痕，因此本报告不列出具体规则编号，也不能声称每条建议都来自某条知识库规则。`；`coverage === null` 写 `本报告没有覆盖数据，无法说明检查覆盖范围与当前版本的能力边界。` 否则 `当前版本的能力边界：${capability（reason）…}。这些边界之外的情形本次没有检查。` |

`buildCaveats(report)` 用 `[...new Set()]` 收集：未清洗、`checks.state !== 'done'`（含 `checks.summary`）、无覆盖 / 覆盖不可信、待确认条数、被拒条数、未执行条数、`report.staleNotices` 每条。
- [ ] **Step 4: 实现两个格式化函数（Word 与 Markdown 共用草稿，`import type` 只用于打破类型循环）**
```ts
export function methodDraftLines(draft: MethodDraft): MethodDraftLine[] {
  const lines: MethodDraftLine[] = [{ kind: 'title', text: draft.title }];
  for (const section of draft.sections) {
    lines.push({ kind: 'heading', text: section.heading });
    for (const paragraph of section.paragraphs) lines.push({ kind: 'body', text: paragraph });
  }
  if (draft.caveats.length > 0) {
    lines.push({ kind: 'heading', text: METHOD_DRAFT_CAVEAT_HEADING });
    for (const caveat of draft.caveats) lines.push({ kind: 'caveat', text: caveat });
  }
  lines.push({ kind: 'disclaimer', text: draft.disclaimer });
  return lines;
}
export function formatMethodDraftMarkdown(draft: MethodDraft): string {
  const body: string[] = [`# ${draft.title}`];
  for (const section of draft.sections) body.push(`## ${section.heading}`, ...section.paragraphs);
  if (draft.caveats.length > 0) body.push(`## ${METHOD_DRAFT_CAVEAT_HEADING}`, ...draft.caveats.map((c) => `- ${c}`));
  body.push('---', `> ${draft.disclaimer}`);
  return `${body.join('\n\n')}\n`;
}
```
- [ ] **Step 5: 测试全绿 + 四道门禁 + 提交**：`node_modules/.bin/vitest.cmd run src/ui/lib/methodDraft.test.ts` → PASS；门禁全绿后 `git add src/ui/lib/methodDraft.ts src/ui/lib/methodDraft.test.ts && git commit -m "feat(报告): 新增确定性数据处理方法草稿"`。

### Task 3: 接入可读报告与预览
**Files:** Modify `src/ui/lib/report.ts`、`src/ui/lib/report.test.ts`、`src/ui/components/ReportDocument.tsx`、`src/ui/components/ExportPanel.tsx`。

**Interfaces:** Produces `ReadableReport.methodDraft: MethodDraft`（唯一生成点 `buildReadableReport`）；`ReadableReportInput.rangeRules?: readonly RangeRule[]`、`knowledgeBase?: MethodDraftKnowledgeBase | null`。
- [ ] **Step 1: 写失败的接线测试**（`report.test.ts`）：`buildReadableReport(baseInput({ coverageMap: coverageInput(), rangeRules: [], knowledgeBase: null }))` 的 `methodDraft.sections` 长度为 6、`disclaimer` 含「不能直接作为正式论文或报告提交」、`caveats.join('')` 含「规则库索引本次没有加载出来」；`checksStatus: 'running'` 的 `methodDraft.caveats.join('')` 含「检查」。跑 `Run: node_modules/.bin/vitest.cmd run src/ui/lib/report.test.ts` → FAIL（字段不存在）。
- [ ] **Step 2: 实现接入（只生成一次、只承载）**
```ts
import { buildMethodDraft, type MethodDraft, type MethodDraftKnowledgeBase, type MethodDraftReport } from './methodDraft';
// report.ts 第 1 行的 '@/core' 导入再加 type RangeRule（不要另起一条重复 import）
// ReadableReport 加：/** 数据处理方法草稿。唯一生成点是 buildReadableReport；消费方只读不重算 */ methodDraft: MethodDraft;
// ReadableReportInput 加：rangeRules?: readonly RangeRule[]; knowledgeBase?: MethodDraftKnowledgeBase | null;
export function buildReadableReport(input: ReadableReportInput): ReadableReport {
  // 把现有 return 的对象字面量原样赋给 base（字段一个不改、不新增口径），再加一行：
  const base: MethodDraftReport = /* 现有返回对象 */;
  return { ...base, methodDraft: buildMethodDraft({ report: base, rangeRules: input.rangeRules ?? [], knowledgeBase: input.knowledgeBase ?? null }) };
}
```

> 上面 `/* 现有返回对象 */` 指的是把当前 `buildReadableReport` 的 `return { … }` 整体搬成 `const base: MethodDraftReport = { … };` —— 这是纯机械搬移，不重写任何一行字段；写完 `tsc` 必须只有 `methodDraft` 一处新错误。
- [ ] **Step 3: 预览渲染（屏幕与打印同一份 DOM）**。`ReportDocument.tsx` 在「版本与口径」之后追加；`import { METHOD_DRAFT_APPENDIX_HEADING } from '@/ui/lib/methodDraft';`
```tsx
<section className="mt-4 border-t border-line pt-3" data-testid="report-method-draft">
  <h4 className="text-xs font-medium text-ink">{METHOD_DRAFT_APPENDIX_HEADING}</h4>
  <p className="mt-1 text-xs text-ink-muted">{report.methodDraft.title}</p>
  {report.methodDraft.sections.map((section) => (
    <div key={section.heading} className="mt-2">
      <p className="text-xs font-medium text-ink">{section.heading}</p>
      {section.paragraphs.map((paragraph) => <p key={paragraph} className="mt-1 text-xs text-ink-muted">{paragraph}</p>)}
    </div>
  ))}
  {report.methodDraft.caveats.length > 0 ? (
    <ul className="mt-2 space-y-1 text-xs text-ink-muted">{report.methodDraft.caveats.map((caveat) => <li key={caveat}>{caveat}</li>)}</ul>
  ) : null}
  <p className="mt-2 border-t border-line pt-2 text-[11px] text-warning-700" data-testid="method-draft-disclaimer">{report.methodDraft.disclaimer}</p>
</section>
```
- [ ] **Step 4: ExportPanel 传元数据**。先 `import type { MethodDraftKnowledgeBase } from '@/ui/lib/methodDraft';`；新增 `const [ruleLibraryStats, setRuleLibraryStats] = useState<MethodDraftKnowledgeBase | null>(null);`；在现有 `loadRuleIndex()` 的 `then` 里同时 `setRuleLibraryStats({ total: index.entries.length, verified: index.entries.filter((record) => record.entry.核验状态 === '已核对').length })`（`catch` 里置 `null`）；`buildReadableReport` 入参加 `rangeRules: Object.values(rangeRuleMap), knowledgeBase: ruleLibraryStats`，`useMemo` 依赖数组加 `ruleLibraryStats`。
- [ ] **Step 5: 验证 + 提交**。`Run: node_modules/.bin/vitest.cmd run src/ui/lib/report.test.ts src/ui/lib/methodDraft.test.ts` → PASS；`Run: node_modules/.bin/playwright.cmd test tests/e2e/quality-report.spec.ts` → 现有 4 条仍 PASS（新增预览段不许挤掉原有断言）；四道门禁全绿后提交 `feat(报告): 方法草稿接入可读报告预览`。

### Task 4: Word 附录、Markdown 下载、入口文案与 E2E
**Files:** Modify `src/ui/lib/reportDocx.ts:273-282`（「八、版本与口径」之后、`return new docx.Document` 之前）、`src/ui/lib/reportDocx.test.ts`、`src/ui/components/ExportPanel.tsx`、`tests/e2e/quality-report.spec.ts`。

**Interfaces:** Consumes `report.methodDraft`、`methodDraftLines`、`formatMethodDraftMarkdown`、`METHOD_DRAFT_APPENDIX_HEADING`；Produces Word 一~八章编号不变、末尾附录；`.md` 文件名 `数据处理方法草稿-<时间戳>.md`；E2E 覆盖预览与下载同源。
- [ ] **Step 1: 写失败的 Word 测试**（`reportDocx.test.ts`）：`const report = sampleReport(); const bytes = await buildReportDocx(report);` 断言 `bytes[0] === 0x50 && bytes[1] === 0x4b`，且 `methodDraftLines(report.methodDraft).at(-1)` 等于 `{ kind: 'disclaimer', text: METHOD_DRAFT_DISCLAIMER }`。跑 `Run: node_modules/.bin/vitest.cmd run src/ui/lib/reportDocx.test.ts` → FAIL（导入不存在）。
- [ ] **Step 2: 实现 Word 附录**（`import { METHOD_DRAFT_APPENDIX_HEADING, methodDraftLines } from './methodDraft';`）
```ts
children.push(heading(METHOD_DRAFT_APPENDIX_HEADING));
for (const line of methodDraftLines(report.methodDraft)) {
  if (line.kind === 'title') children.push(paragraph(line.text, { bold: true, size: 24 }));
  else if (line.kind === 'heading') children.push(new docx.Paragraph({ spacing: { before: 200, after: 80 },
    children: [new docx.TextRun({ text: line.text, bold: true, size: 22 })] }));
  else if (line.kind === 'disclaimer') children.push(paragraph(line.text, { size: 18, color: 'C00000' }));
  else children.push(paragraph(line.text, { size: 20 }));
}
```
- [ ] **Step 3: 下载按钮 + 「五样产出」文案**。`ExportPanel.tsx` 加 `import { formatMethodDraftMarkdown } from '@/ui/lib/methodDraft';`，在 Word 按钮之后加：
```tsx
<Button size="sm" variant="secondary" onClick={() => {
  if (readableReport === null) return;
  download(`数据处理方法草稿-${stamp()}.md`, formatMethodDraftMarkdown(readableReport.methodDraft), 'text/markdown;charset=utf-8');
}}><FileText className="h-4 w-4" aria-hidden="true" />数据处理方法草稿（.md）</Button>
```

同时改三处与界面不符的文案：组件头注释、Card 头副标题、正文段落里的「四样产出」→「五样产出（含方法草稿）」，并在「可读报告」说明段补「Word 末尾附数据处理方法草稿」。
- [ ] **Step 4: E2E（预览与下载逐字比对）**。`quality-report.spec.ts` 顶部加 `import { readFileSync } from 'node:fs';`，追加：
```ts
test('可读报告：末尾带方法草稿，免责声明在预览与 Markdown 下载里同源', async ({ page }) => {
  await importAndOpen(page, '报告与导出');
  const draft = page.getByTestId('readable-report').getByTestId('report-method-draft');
  await expect(draft).toBeVisible();
  await expect(draft).toContainText('一、样本与字段');
  await expect(draft).toContainText('六、依据与边界');
  await expect(draft).toContainText('本次未执行任何清洗动作');   // 只导入没清洗，不许写成已清洗
  await expect(draft).not.toContainText(/全部通过|检查合格/);
  const disclaimer = (await draft.getByTestId('method-draft-disclaimer').textContent())?.trim() ?? '';
  expect(disclaimer).toContain('不能直接作为正式论文或报告提交');
  const [download] = await Promise.all([page.waitForEvent('download'),
    page.getByRole('button', { name: '数据处理方法草稿（.md）' }).click()]);
  expect(download.suggestedFilename()).toMatch(/^数据处理方法草稿-.+\.md$/);
  const markdown = readFileSync((await download.path())!, 'utf8');
  expect(markdown).toContain(disclaimer);                       // 三处同源：预览读到的文本逐字出现在下载文件
  expect(markdown).toContain('## 六、依据与边界');
  expect(markdown).not.toMatch(/general-[a-z]/);
});
```
- [ ] **Step 5: 验证 + 提交**。`Run: node_modules/.bin/playwright.cmd test tests/e2e/quality-report.spec.ts` → 5 passed；四道门禁 + `lint` 全绿后提交 `feat(导出): Word 附录与 Markdown 下载方法草稿`。

### Task 5: 文档与数字同步 → 全分支审查 → 合并
**Files:** Modify `docs/技术文档.md`、`README.md`、6 份交接 md（`docs/开发交接说明.md`、`docs/交接-2026-10-21.md`、`docs/交接-2026-10-23-界面方案第一/二/三轮.md`、`docs/交接-2026-10-25-上下文交接.md`）、`scripts/check-doc-facts.mjs:77-81`、`docs/代码导读与TS学习.md`、`docs/images/04-export.png`。
- [ ] **Step 1: 先跑全量门禁，记下三个实测数**：`pnpm test` 的 `Tests X passed | 8 skipped` 与 `Test Files Y passed`；`pnpm test:e2e` 的 `Z passed, 1 skipped`。下文所有「实测值」都指这三个数，不凭估计。
- [ ] **Step 2: 数字同步（先查再逐处改）**：`git grep -n -E "798|68 文件|68 files|86 passed|86 通过|86 E2E" -- docs README.md scripts/check-doc-facts.mjs`。规则：技术文档 / README / 6 份交接文档里表示「最新门禁」的写法全部换成实测值；`docs/开发交接说明.md` §8.14–§8.18 是当轮历史记录，保留原数字，由新增 §8.20 写最新值（先例：§8.12 的 653 就保留着）；`check-doc-facts.mjs` 的 `label: '测试规模：798 单测 / 68 文件 / 86 E2E'` 条目把 `label` / `doc` / `raw` 三处的三个数字一起换（出处仍指 `docs/开发交接说明.md` §一）。
- [ ] **Step 3: 技术文档（30 页顶满，先删后加）**。**不新增 F 编号**：§2.2 只把 F9 的说明补「含数据处理方法草稿（.md / Word 附录）」，功能表不新增行。§4.8 末尾加一条：**数据处理方法草稿（Markdown 下载 / Word 附录）** —— **不调用大模型**，由留痕、检查覆盖、人工决定与检查结论纯模板拼装 6 段方法文字（样本与字段、缺失与异常、类别归并口径、人工复核、未执行动作、依据与边界）；未执行清洗、检查未完成、结论属旧版本、无覆盖数据四种情况各自写「未进行」；小样本（有效观测 <4）与低缺失率（<20%）不写成「已判定」；免责声明在预览、Word、Markdown 三处同源。§6.2 标题「五项」→「六项」，表加 T6 行：`| T6 | 可复现的方法学草稿（不接 LLM） | 6 段方法文字由模板拼装，四态如实、免责声明三处同源 | 单测覆盖四态与小样本「未进行」；E2E 断言预览免责声明逐字出现在下载的 .md；methodDraft.ts 无 agent/fetch 依赖 |`。同一次编辑改图 5 图注「四样产出入口」→「五样产出入口」、附录 A「T1–T5」补 T6、§1.4/§7.1/§8.1/附录 A 测试数字换实测值。**先删两处腾页**：① §5.10 末段与表格重复的 token 用量句（「真实 token 用量已经测得到…（按公开单价估算）。」整句）；② §8.3 第 4 条（与 §8.2 pandas 行重复），第 5–8 条序号改 4–7。然后：
```powershell
$env:PYTHON='C:\Users\lt\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\python\python.exe'
$env:LO_KIT_NODE='D:\dsh-harness\resources\runtime\primary-runtime\dependencies\node\bin\node.exe'
$env:LO_KIT_CLI='D:\dsh-harness\resources\app.asar.unpacked\dsh\node_modules\@deepseek-ai\libreoffice-kit\lib\cli.js'
& 'D:\npm-global\pnpm.cmd' doc:build      # 必须仍是 30 页
& 'D:\npm-global\pnpm.cmd' check:doc      # 30 项全过
```
- [ ] **Step 4: README + 交接文档**。README：feature 行补「报告 / 方法草稿」；测试数字换实测值；顺手修第 39 行漂移的 L3 数字（仍是 113 条索引的 `94.7% / 100% / 0.9737`，改为 178 条的 `78.9% / 94.7% / 0.8684`）。`docs/开发交接说明.md` 末尾新增 `## 8.20 本轮会话（2026-10-26）做了什么：数据处理方法草稿`，必须含：目标一句话、六段与四态、三处免责声明同源、实测门禁数字、提交号清单、已知局限三条（① 不含逐项检查检出数，避免第二套计数；② 小样本阈值与 core 共用常量、由覆盖缺口转述；③ 知识库只给规模与核验数，不给具体规则编号），以及「推送与 Vercel 部署不在本轮范围内」。
- [ ] **Step 5: 代码导读 + 截图**。`docs/代码导读与TS学习.md` 在「## 待补充的模块」之前插入「## 模块 41：数据处理方法草稿（确定性模板，不接 LLM）」，讲清：做什么（输入 `ReadableReport`、输出 6 段 + caveats + 免责声明）；为什么不让模型写（会编造未发生的统计方法，属学术不端级风险；报告承诺浏览器本地生成）；TS 点（`Omit` 去掉自有字段防递归、`import type` 打破 report ↔ methodDraft 类型循环、可选字段与 `Set` 去重）；答辩怎么问（为什么不用 AI 写方法段、怎么保证数字不重算、三处免责声明怎么保证一致）。把「待补充的模块」段里的「模块 0–40」改为「0–41」，已补齐表追加一行。截图：`Copy-Item .tmp\shot-export.mjs .tmp\shot-export-draft.mjs`，先把 `base` 指向 `https://www.ai-web.me`，在等「178 条」之后加 `await page.getByRole('button', { name: '数据处理方法草稿（.md）' }).waitFor({ timeout: 30_000 });` 再跑 `node .tmp/shot-export-draft.mjs`；线上还没有这个按钮时改用本地生产构建（`pnpm build` → 后台 `pnpm start` → `base='http://127.0.0.1:3000'`），并**把图 5 图注的「线上真实界面」改成「本地生产构建界面」**（不能留「线上」二字）。两种路径都校验尺寸不变：`node -e "const b=require('fs').readFileSync('docs/images/04-export.png');console.log(b.readUInt32BE(16), b.readUInt32BE(20))"` 期望 `2880 1800`，截图后重跑 `doc:build` + `check:doc`（仍 30 页 / 30 项）。
- [ ] **Step 6: 全分支审查（全新上下文，只读）**。用 `subagent` 派审查者，prompt 写明：工作目录 `D:\传智杯-AI web网页开发`、分支 `feat/method-draft`、范围 `git diff main...feat/method-draft`、逐条对照本计划 Review Focus 六条并**主动构造反例**、输出 Critical / Important / Minor 与复现步骤。Critical 与 Important 一次修完，**每条先写失败测试再修**，重跑四道门禁后单独提交 `fix(报告): 方法草稿审查修复`；Minor 登记进 §8.20 已知局限，不强行全修。
- [ ] **Step 7: 合并、合并后重跑门禁、删分支**
```powershell
git switch main
git merge --no-ff feat/method-draft -m "merge: 数据处理方法草稿（确定性模板，不接 LLM）"
node_modules/.bin/tsc.cmd --noEmit
& 'D:\npm-global\pnpm.cmd' test
& 'D:\npm-global\pnpm.cmd' test:e2e
& 'D:\npm-global\pnpm.cmd' build
git branch -d feat/method-draft
git status --short      # 期望只有 ?? docs/部署指南.docx
```

`build` 抖了 `next-env.d.ts` 就 `git checkout -- next-env.d.ts`；测试写了 `knowledge/reports/*.json` 就 `git checkout -- knowledge/reports/`。**不要** `git add .`、不要提交 `docs/部署指南.docx`；推送与 Vercel 部署不在本计划内，另行执行。

## 估时与任务边界

5 个任务、合计约 **13 人·小时**：Task 1 覆盖缺口 + 报告透传 2 h · Task 2 `methodDraft.ts` 4.5 h · Task 3 报告接入与预览 2.5 h · Task 4 Word/Markdown/E2E 2 h · Task 5 文档数字同步 + 审查合并 2 h。每个 Task 独立提交、独立跑四道门禁；Task 5 是全分支审查与合并的唯一入口。

---

## Self-Review

**1. 需求覆盖**

| 需求 | 落在哪个任务 |
| --- | --- |
| 纯确定性模板、不接 LLM | Task 2（实现 + 源码扫描单测） |
| 只用 `ReadableReport` 已有数据、不重算 | Task 1（透传）、Task 2（只读成品字段）、Task 3（唯一生成点） |
| 六段方法文字与四态 | Task 2 |
| 小样本 / 低缺失率写「本次未进行」 | Task 1（coverage gaps + core 常量）、Task 2（读 gaps 的断言） |
| 免责声明三处同源 | Task 2（常量与格式化）、Task 3（预览）、Task 4（Word / `.md` + E2E 逐字比对） |
| 报告 / Word / Markdown 接入与「五样产出」文案 | Task 3、Task 4 |
| 文档与数字同步（30 页、6 份 md、脚本、代码导读、截图） | Task 5 |
| 审查、`--no-ff`、合并后复测 | Task 5 |

**已知缺口（写明理由）**：不引用具体知识库 ruleId（AI 建议里没有 ruleId、`query_rules` 命中不落盘，捏造规则编号比不写更糟）；不含逐项检查检出数（避免与 `checks.counts` 形成第二套口径；需要时另扩 `ReportChecksCounts`）；Word 用末尾附录而不是插入新章（避免一~八章重编号）。

**2. 占位符扫描**：无 `TBD` / `TODO` / 「类似 Task N」。唯一的 `/* 现有返回对象 */` 紧跟一段可执行的机械搬移说明（把当前 `return { … }` 整体赋给 `const base: MethodDraftReport`），不是留给执行者的空白设计。

**3. 类型与命名一致**：`MethodDraft` / `MethodDraftReport` / `MethodDraftInput` / `MethodDraftKnowledgeBase` / `MethodDraftLine` / `METHOD_DRAFT_*` / `methodDraftLines` / `formatMethodDraftMarkdown` / `ReportCoverageGap` / `ReadableReportInput.rangeRules` 跨任务一致；`Omit<ReadableReport, 'methodDraft'>` 用来打破 `report.ts` ↔ `methodDraft.ts` 的运行时循环（类型 import 会被擦除）。

**4. Review Focus → 测试**：①→Task 2 标题 / 禁用措辞断言；②→Task 1 coverageMap + Task 2「未进行」断言；③→Task 2 常量与格式化 + Task 4 E2E 逐字比对；④→Task 2 `changedCells` / 删除行跟随 + 不读 `fieldChanges`；⑤→Task 2 无 `general-` 前缀 + `knowledgeBase === null` 分支；⑥→Task 2 四态各一条 + Task 3 钉接线。

## 需要所有者拍板（开工前确认）

1. **覆盖地图新增两类缺口会在检查页可见**（不只是报告里）——这是草稿能如实写「本次未进行」的前提，但属于产品行为微调，是否接受？
2. **`methodDraft` 的生成点**放在 `buildReadableReport` 内（单真源、消费方只读），而不是由调用方传进来；接受吗？
3. **草稿是否要带逐项检查检出数**（如缺失 2 条 / 异常 1 条）？本计划为守「数字只有一套口径」不含；若答辩需要，需扩展 `ReportChecksCounts`（约 +0.5 h）。
4. **图 5 截图口径**：本轮不含推送部署；若不部署，只能本地生产构建截图，图注要从「线上真实界面」改成「本地生产构建界面」，接受吗？
5. **技术文档压缩清单**：30 页顶满，Task 5 会先删后加；若删到你需要保留的段落，需提前打招呼（默认删重复的历史叙述与过时口径）。
6. **合并后推送与部署**：计划只到本地合并；推送与线上验证按所有者节奏单独执行。
