# AI 主动追问（MVP）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** AI 在分析中途只针对「摘要里没有、但会改变结论」的领域信息停下来提问（1–3 题）；用户回答或跳过后以 **tool-result** 回填并自动续跑。每轮分析最多追问 1 次，回答不进留痕、不持久化。  
**Architecture:** 新增第六个客户端工具 `ask_clarification`，沿用 `plan_checks`/`submit_issue` 的「服务端只声明、不带 `execute`」模式，但它是第三类工具：不执行计算、不产生业务结果，只把一次工具调用变成 UI 暂停点。客户端 `onToolCall` 收到它时**不回填** → `lastAssistantMessageIsCompleteWithToolCalls` 为 false → 会话停在 `ready`；用户作答后 `addToolOutput` 以 tool-result 回填 → 谓词转真 → SDK 自动续跑。暂停状态全部从消息派生（不新增 store），回答经 `outbound.ts` 第三条出站通道整形后才上行。  
**Tech Stack:** Next.js 16 + React 19 + TypeScript strict · AI SDK 7（`useChat`/`addToolOutput`/`lastAssistantMessageIsCompleteWithToolCalls`）· Zod 4 · Zustand（只复用既有 store）· Vitest · Playwright  
**Spec:** `docs/superpowers/specs/2026-10-09-data-quality-agent-design.md`（§5.2 用户可干预、§5.3.3 工具循环、§5.8 人在环路）。**如实说明**：追问不在 spec 的 F1–F13 清单内，是把「可干预」前移到分析中途的新增能力，技术文档不得新增 F 编号。  
**前置状态（开工前核对）**：`main` 与 `origin/main` 一致（规划时 HEAD `480486a`）；工作区只有未跟踪的 `docs/部署指南.docx`（另一个会话的产物，**绝对不要提交**）。基线：`tsc` 0 error · 单测 **798 passed / 8 skipped / 68 文件** · E2E **86 passed / 1 skipped** · build 成功 · 技术文档 **30/30 页顶满**、`check:doc` 30 项 · lint 0 error / 201 warning。本计划是 2026-10-26 三份计划中的第 3 份（建议执行顺序：研究场景入口 → 数据处理方法草稿 → AI 主动追问）；三份都要改同一批文档与测试数字，必须顺序执行、逐个合并，**不要并行跑 E2E**（共用 3000 端口与 `.next`）。若前两份计划已合并，基线会更高，「预期数字」一律以实测为准。**F 编号**：研究场景入口计划会新增 F14；本计划不新增 F 编号，只把 F5/F7（可干预 / 人在环路）的说明补上追问。  
**估时：约 15 人·小时**（Task 0 2.0 · Task 1 2.5 · Task 2 1.5 · Task 3 3.5 · Task 4 2.5 · Task 5 2.0 · Task 6 1.0），分支 `feat/ai-clarification`。
## Global Constraints
- **数据不出浏览器**：回答是用户输入不是数据集，但会随 tool-result 上行并进入后续每轮上下文；只放行问题原文 + 回答，不得夹带画像/行数据/文件内容，UI 明示「回答会发给模型，请不要粘贴原始记录」；**问题只能基于摘要与画像提出，不得要求用户贴出原始数据行**。
- **回答不落库、不持久化**：不写 IndexedDB / sessionStorage / 留痕 / 导出，只活在当前会话 `messages` 里，刷新即失效。
- **硬上限**：一次 **1–3 题**、单题 **≤120 字**、选项 **≤6 个**（单选项 ≤60 字）、单题回答 **≤500 字**、每轮分析 **最多追问 1 次**。
- **追问必须单独成步**：不得与 `run_checks`/`submit_issue`/`query_rules` 同一步；客户端发现同一步有别的工具就回填 `output-error` 让模型重来。
- **全中文**（注释、文案、提交信息）；注释只写「为什么」；命名不用 `data1`/`temp`/`res`；**不新增依赖、不改 `core/`**。
- **TDD**：每任务先写失败测试确认红，再实现确认绿；一个提交一件事，四道门禁全绿才提交。
- **不提交**：`docs/部署指南.docx`、`next-env.d.ts`（`git checkout -- next-env.d.ts`）、`.tmp/`、`.superpowers/`（已忽略，ledger 放这里）。
- **门禁命令**（多行中文提交用 `git commit -F D:\tmp\commit-msg.txt`）：
  ```powershell
  cd 'D:\传智杯-AI web网页开发'; $env:TEMP='D:\tmp'; $env:TMP='D:\tmp'; $env:PLAYWRIGHT_BROWSERS_PATH='D:\ms-playwright'
  node_modules/.bin/tsc.cmd --noEmit; pnpm test; pnpm test:e2e; pnpm build; pnpm lint
  ```
- **文档 30 页顶满**：`pnpm doc:build` 超页退出码 1，**先删后加**（删减清单见 Task 5），不许改上限；`pnpm check:doc` 必须全过。
## Review Focus
1. **追问变成普通多轮对话**：回答若以 user 消息发出，会出现「你：重点高中」，轮次/成本/语义全错；第二次请求体里答案只能出现在 tool-result，`lastUserText` 不得含答案。
2. **暂停被误判成卡住**：`input-available` 的追问会让既有 `hasStuckToolCall` 报「模型没能把这一步发完」，用户点重试就把追问作废。
3. **回答回填静默失效**：`addToolOutput` 只改最后一条消息；等待期必须禁输入，用户已发消息则追问作废（残留补 `output-error`，不能留下半条历史触发 `MissingToolResultsError`）。
4. **模型滥用追问**：每轮多次、每题单独问、重问摘要已有信息；用预算回填 error + Prompt 纪律 + 单独成步拒绝三重约束。
5. **回答通道泄露原始数据**：用户可能粘贴原始记录；限长 + 明示 + `outbound` 白名单只保留 `question`/`answer` 两字段。
## File Structure
**新建**：`src/ui/lib/clarifications.ts`（暂停派生纯函数 + 草稿整形 + 文案常量；**不进 zustand selector**，参考 `planStore.ts` 的 `selectedChecksOf` 白屏教训）· `src/ui/lib/clarifications.test.ts` · `src/ui/components/ClarificationPanel.tsx` · `tests/e2e/clarification.spec.ts` · 本文件 · `tests/e2e/spike-clarification.spec.ts`（Task 0 临时探针，验证完删）
**修改**：`src/agent/shared/schemas.ts`（`clarificationSchema` + 上限）· `toolSchemas.ts`（工具契约）· `src/agent/server/tools.ts`（声明，不带 `execute`）· `src/ui/lib/toolExecutors.ts`（守卫分支，保持 switch 穷尽）· `src/agent/shared/outbound.ts`（第三条通道 + `MAX_ANSWER_LENGTH`）· `prompt.ts`（时机与纪律）· `src/ui/lib/agentPhase.ts`（卡住判据 / 残留文案 / 中文标签）· `src/ui/components/AgentPanel.tsx`（暂停、回填、禁输入、徽章、等待态、同一步拒绝）· 5 个既有 `.test.ts` · `docs/代码导读与TS学习.md` · 8 份 md + `scripts/check-doc-facts.mjs`（Task 5）

---
### Task 0: Spike —— 先验证「暂停点 + tool-result 回填自动续跑」（约 2.0 h）
**假设**：AI SDK 7 里，声明了但客户端不回填的工具调用会让本轮结束、`status` 回 `ready`；随后 `addToolOutput` 只改最后一条消息并触发自动续跑。
**Files:** 临时改 `src/ui/components/AgentPanel.tsx`；临时建 `tests/e2e/spike-clarification.spec.ts`；结论写 `.superpowers/sdd/2026-10-26-ai-clarification/spike.md`（已忽略）。**Interfaces:** 只消费既有 `/api/agent` mock 协议（`tool-input-available`，写法参考 `tests/e2e/plan-and-rules.spec.ts:99`）。
- [ ] **Step 1: 建分支、确认基线**
```powershell
git status -sb            # 应只有未跟踪 docs/部署指南.docx
git checkout -b feat/ai-clarification
$env:TEMP='D:\tmp'; $env:TMP='D:\tmp'; $env:PLAYWRIGHT_BROWSERS_PATH='D:\ms-playwright'
node_modules/.bin/tsc.cmd --noEmit; pnpm test; pnpm test:e2e; pnpm build   # 期望 0 / 798·8·68 / 86·1 / 成功
```
- [ ] **Step 2: 临时改 AgentPanel（验证完还原）**：`onToolCall` 最前面加 `if (toolCall.toolName === 'ask_clarification') return; // SPIKE：不回填，制造暂停点`；在 `return (` 之前加：
```tsx
const spikePart = messages.filter((m) => m.role === 'assistant').flatMap((m) => m.parts).reverse()
  .find((p) => p.type === 'tool-ask_clarification' && p.state === 'input-available');
// JSX（<form> 上方）：
{spikePart ? <Button data-testid="spike-answer" onClick={() => void addToolOutput({ tool: 'ask_clarification',
  toolCallId: (spikePart as { toolCallId: string }).toolCallId,
  output: { answers: [{ question: '「重点」指什么？', answer: '重点高中' }], skipped: false, answeredCount: 1 } })}>SPIKE 回答</Button> : null}
```
- [ ] **Step 3: 临时探针（验证完删除）**
```ts
import { test, expect } from '@playwright/test';
import { blockSemanticModelDownload, importFixture } from './helpers';
const SSE = { 'content-type': 'text/event-stream', 'x-vercel-ai-ui-message-stream': 'v1' };
const round = (p: unknown[]) => [{ type: 'start' }, { type: 'start-step' }, ...p, { type: 'finish-step' }, { type: 'finish' }];
const sse = (c: unknown[]) => c.map((x) => `data: ${JSON.stringify(x)}\n\n`).join('') + 'data: [DONE]\n\n';
test('spike: 无 execute 工具暂停后可用 tool-result 续跑', async ({ page }) => {
  await blockSemanticModelDownload(page); const bodies: string[] = [];
  await page.route('**/api/agent', async (route) => {
    const body = route.request().postData() ?? ''; bodies.push(body);
    await route.fulfill({ status: 200, headers: SSE, body: sse(round(body.includes('重点高中')
      ? [{ type: 'text-start', id: 't2' }, { type: 'text-delta', id: 't2', delta: '收到回答，继续分析。' }, { type: 'text-end', id: 't2' }]
      : [{ type: 'text-start', id: 't1' }, { type: 'text-delta', id: 't1', delta: '我需要确认一个口径。' }, { type: 'text-end', id: 't1' },
         { type: 'tool-input-available', toolCallId: 'spike-1', toolName: 'ask_clarification', input: { questions: [{ question: '「重点」指什么？', options: ['重点高中', '省重点'] }] } }])) });
  });
  await importFixture(page); await page.getByTestId('sidebar').getByRole('link', { name: 'AI 分析' }).click();
  await page.getByPlaceholder(/这份问卷数据/).fill('这份数据有什么问题'); await page.getByRole('button', { name: '开始分析' }).click();
  await expect(page.getByTestId('spike-answer')).toBeVisible();
  await expect(page.getByRole('button', { name: '开始分析' })).toBeEnabled();  // 判据 1：status 回 ready
  expect(bodies).toHaveLength(1);                                              // 判据 2：不回填不续跑
  await page.getByTestId('spike-answer').click();
  await expect(page.getByText('收到回答，继续分析。')).toBeVisible();           // 判据 3：自动续跑
  expect(bodies).toHaveLength(2); expect(bodies[1]).toContain('"tool-ask_clarification"');  // 判据 4
  expect(bodies[1]).toContain('重点高中');
});
```
Run: `node_modules/.bin/playwright.cmd test tests/e2e/spike-clarification.spec.ts` → 期望 1 passed。
- [ ] **Step 4: 回退方案（按序试，最多第 3 条）**：① status 不回 `ready` → 「等待中」改为显式派生（`pendingClarificationOf(messages) !== null && !busy`），禁输入与徽章不依赖 status，暂停仍成立，SDK 行为写进注释；② 回填后不续跑 → `sendAutomaticallyWhen` 换成 `({messages}) => lastAssistantMessageIsCompleteWithToolCalls({messages}) || hasCompleteClarification(messages)`；③ 回填打到错误消息 → 收紧「等待期禁止任何发送」，用 `setMessages` 精确替换含该 `toolCallId` 的消息后 `regenerate()` 续跑，如实记录可能重复生成上一段文本；④ 全失败 → **停止实施并上报**，证据写 `spike.md`；**不允许**降级成「把回答当用户消息发出去」（那正是 Review Focus 1）。
- [ ] **Step 5: 还原、写结论、不提交**：`git checkout -- src/ui/components/AgentPanel.tsx; Remove-Item tests/e2e/spike-clarification.spec.ts; git status -sb`（应回到只有未跟踪 `docs/部署指南.docx`）。`spike.md` 记：SDK 版本、四条判据结果、`status` 变化、走了哪条回退。**spike 代码不进提交历史。**

---
### Task 1: 契约、暂停派生与第三条出站通道（约 2.5 h）
**Files:** Modify `src/agent/shared/schemas.ts`、`toolSchemas.ts`、`src/agent/server/tools.ts`、`src/ui/lib/toolExecutors.ts`、`src/agent/shared/outbound.ts`、`src/ui/lib/agentPhase.ts`（只加中文标签）；Create `src/ui/lib/clarifications.ts` + `.test.ts`；Test 另加 `schemas.test.ts`、`outbound.test.ts`、`toolExecutors.test.ts`。
**Interfaces（后续任务按此调用）:**
```ts
// schemas.ts：一次 1–3 题、单题 ≤120、选项 ≤6（单选项 ≤60）
export const clarificationSchema = z.object({ questions: z.array(z.object({
  question: z.string().min(1).max(120), options: z.array(z.string().min(1).max(60)).max(6).default([]),
})).min(1).max(3) });
export type Clarification = z.infer<typeof clarificationSchema>;
// outbound.ts
export const MAX_ANSWER_LENGTH = 500;
export interface ClarificationAnswerForModel { question: string; answer: string }
export interface ClarificationToolOutput { answers: ClarificationAnswerForModel[]; skipped: boolean; answeredCount: number }
export function clarificationOutputForModel(questions: string[], drafts: string[]): ClarificationToolOutput;
// clarifications.ts
export interface PendingClarification { toolCallId: string; questions: Clarification['questions'] }
export function pendingClarificationOf(messages): PendingClarification | null;
export function clarificationUsedSinceLastUser(messages): boolean;
export function clarificationSharesStep(messages): boolean;
export function emptyDrafts(count: number): string[];
export function applyDraft(drafts: string[], index: number, value: string): string[];
export function buildClarificationOutput(questions: string[], drafts: string[]):
  { ok: true; output: ClarificationToolOutput } | { ok: false; error: string };
export const CLARIFICATION_STEP_VIOLATION_TEXT: string;
export const CLARIFICATION_DANGLING_TEXT: string;
```
- [ ] **Step 1: 先写失败测试（红）**：schema 5 条（1/3 题过、0/4 题拒、120 字过 121 字拒、6 选项过 7 拒、61 字选项拒）；outbound 3 条；执行器 1 条（`executeToolCall('ask_clarification', { questions: [] }, context)` → `ok:false` 且错误含「界面」）；`clarifications.test.ts` 9 条（待回答从最后助手消息最后一步取出；已回答/已拒绝/最后是用户消息 → null；已答过一次 → 预算已用；被拒不算、新一轮用户消息后归零；同一步有别的工具 → true、只有追问 → false；提交空题丢弃且保序；全空 → 错误含「跳过」；501 字 → 错误含「500」；`applyDraft`/`emptyDrafts` 不就地改入参）。
```ts
// outbound.test.ts 的 3 条
expect(clarificationOutputForModel(['Q1','Q2'], [' 重点高中 ','']))       // trim、配对、丢空、answeredCount
  .toEqual({ answers: [{ question: 'Q1', answer: '重点高中' }], skipped: false, answeredCount: 1 });
const long = clarificationOutputForModel(['Q1'], ['长'.repeat(600)]).answers[0]!;
expect(long.answer).toHaveLength(500); expect(Object.keys(long).sort()).toEqual(['answer','question']);
expect(clarificationOutputForModel(['Q1'], [])).toEqual({ answers: [], skipped: true, answeredCount: 0 });
```
Run: `node_modules/.bin/vitest.cmd run src/ui/lib/clarifications.test.ts` → FAIL（模块不存在）。
- [ ] **Step 2: 实现**：`schemas.ts` 追加 `clarificationSchema`；`toolSchemas.ts` 加 `ask_clarification: clarificationSchema`；`server/tools.ts` 加声明：
```ts
ask_clarification: {
  description: '当摘要里没有、但会显著改变结论的领域信息缺失时向用户确认：缺失值编码、单位、量表/满分制、重复测量结构、反向题。一次最多 3 题、每题 ≤120 字、选项 ≤6 个。**必须单独占一步**，调用后停下等用户回答（回答后系统自动继续）。每轮最多问 1 次；用户跳过时按现有信息继续并调低 confidence。摘要里已有的信息不要重复问。',
  inputSchema: TOOL_INPUT_SCHEMAS.ask_clarification,
},
```
`toolExecutors.ts` 加守卫（保持 switch 穷尽，否则 TS 报缺少结尾 return）：`case 'ask_clarification': return { ok: false, error: 'ask_clarification 由界面直接呈现给用户回答，不在工具执行器里执行。' };`
`outbound.ts`：头注释「两条通道」→「三条通道」，补通道 C（问题原文 + 回答、≤500 字/题、不含本地数据）；实现：
```ts
export function clarificationOutputForModel(questions: string[], drafts: string[]): ClarificationToolOutput {
  const answers = questions.map((question, index) => ({ question, answer: (drafts[index] ?? '').trim() }))
    .filter((item) => item.answer !== '').map((item) => ({ question: item.question, answer: item.answer.slice(0, MAX_ANSWER_LENGTH) }));
  return { answers, skipped: answers.length === 0, answeredCount: answers.length };
}
```
`clarifications.ts`：只认**最后一条助手消息**、只看**最后一个 `step-start` 之后**的 parts（与 SDK 谓词同口径）；`pendingClarificationOf` 用 `clarificationSchema.safeParse(part.input)`，失败返回 null；`clarificationSharesStep` = 有 pending 且同一步工具 part 数 > 1；`buildClarificationOutput` 先按 `MAX_ANSWER_LENGTH` 逐题校验（超长报错、不悄悄截断），全空报「至少回答一个问题，或者点『跳过，按现有信息继续』」，通过后交给 `clarificationOutputForModel`。文件头写清：派生函数每次返回新对象/数组，**禁止写进 zustand selector**（`planStore.ts` 已因同因白屏过一次）。`agentPhase.ts`：`TOOL_LABELS` 加 `'tool-ask_clarification': '向你确认信息'`（既有测试遍历 `TOOL_INPUT_SCHEMAS`，漏了会红）。
- [ ] **Step 3: 跑测试与门禁，提交**
```powershell
node_modules/.bin/vitest.cmd run src/ui/lib/clarifications.test.ts src/agent/shared/ src/ui/lib/toolExecutors.test.ts
node_modules/.bin/tsc.cmd --noEmit; pnpm test   # 以实测为准（在本计划基线上新增 18 条单测；69 个测试文件）
git add src/agent/shared/schemas.ts src/agent/shared/toolSchemas.ts src/agent/server/tools.ts src/agent/shared/outbound.ts src/agent/shared/*.test.ts src/ui/lib/toolExecutors.ts src/ui/lib/toolExecutors.test.ts src/ui/lib/agentPhase.ts src/ui/lib/clarifications.ts src/ui/lib/clarifications.test.ts
git commit -F D:\tmp\commit-msg.txt   # "feat(agent): 追问工具契约与第三条出站通道"
```

---
### Task 2: Prompt —— 把「何时该问」写成纪律（约 1.5 h）
**Files:** Modify `src/agent/shared/prompt.ts`；Test `src/agent/shared/prompt.test.ts`。**Interfaces:** 产出可被断言的 `SYSTEM_INSTRUCTIONS` 五类时机与四条纪律。
- [ ] **Step 1: 写失败测试（2 条）**
```ts
it('写明何时该追问 —— 五类领域信息，缺了会改变结论', () => { for (const k of ['缺失值', '单位', '量表', '重复测量', '反向']) expect(SYSTEM_INSTRUCTIONS).toContain(k); });
it('追问硬纪律：不重问摘要、每轮 1 次、单独成步、算收尾预算', () => { for (const k of ['ask_clarification', '最多问 1 次', '单独', '收尾', '摘要里已有']) expect(SYSTEM_INSTRUCTIONS).toContain(k); });
```
Run: `node_modules/.bin/vitest.cmd run src/agent/shared/prompt.test.ts` → FAIL。
- [ ] **Step 2: 改 `SYSTEM_INSTRUCTIONS`（工作方式第 5 条之后追加，原文照写）**
```
提问的时机（只有一种情况值得打断用户）：摘要与列画像里没有、但缺少它就会让结论差一个量级的领域信息。典型五类：
1. 缺失值的编码含义（空值是「未填写」「不知道」还是「无此项」）；2. 计量单位与量纲（「剂量」列的数字是 mg 还是 g）；
3. 量表与满分制（各题分制、是否有反向题、总分怎么算）；4. 重复测量的数据结构（同一受试者是否出现多行、是否有被试编号列）；
5. 反向表述题（哪些题目反向计分，方向搞反会得出相反结论）。
ask_clarification 的纪律：先看摘要，摘要里已有的信息不要重复问；一次 1–3 个问题、每题不超过 120 字、每题最多 6 个选项；**必须单独占一步**，那一步不要调用任何其它工具，问完就停，系统会等用户回答后自动继续，不要自己猜答案往下走；**每轮分析最多问 1 次**，用户跳过时按现有信息继续并把受影响结论的 confidence 调低；追问也占用收尾预算，问之前先确认该做的检查已经做完，不要把追问当成拖延步骤。
```
- [ ] **Step 3: 跑测试与门禁，提交**：`node_modules/.bin/vitest.cmd run src/agent/shared/prompt.test.ts; pnpm test; node_modules/.bin/tsc.cmd --noEmit`（在本计划基线上再 +2 条；以实测为准）；`git add src/agent/shared/prompt.ts src/agent/shared/prompt.test.ts; git commit -F D:\tmp\commit-msg.txt`（"feat(agent): 系统指令加入追问时机与纪律"）。

---
### Task 3: UI —— 暂停点、追问卡片与回填（约 3.5 h）
**Files:** Modify `src/ui/lib/agentPhase.ts`、`agentPhase.test.ts`；Create `src/ui/components/ClarificationPanel.tsx`；Modify `src/ui/components/AgentPanel.tsx`。**Interfaces:** Consumes Task 1 全部派生/整形函数与 `MAX_ANSWER_LENGTH`；Produces `<ClarificationPanel questions onSubmit onSkip />`（`onSubmit(output: ClarificationToolOutput)`）。
- [ ] **Step 1: 先写 agentPhase 失败测试（2 条）**
```ts
it('等待用户回答的追问不算卡住 —— 否则界面会诱导用户点重试，把追问作废', () => { expect(hasStuckToolCall([{ role: 'assistant', parts: [{ type: 'tool-ask_clarification', state: 'input-available' }] }], false)).toBe(false); });
it('追问被绕过时用专用失败文案，而不是通用「上一次分析中断」', () => {
  const repaired = repairDanglingToolCalls([{ role: 'assistant', parts: [{ type: 'tool-ask_clarification', state: 'input-available', toolCallId: 'call-c' }] }]);
  expect((repaired[0] as { parts: { errorText?: string }[] }).parts[0]?.errorText).toBe(CLARIFICATION_DANGLING_TEXT);
});
```
Run: `node_modules/.bin/vitest.cmd run src/ui/lib/agentPhase.test.ts` → FAIL。
- [ ] **Step 2: 改 `agentPhase.ts`**：新增 `export const CLARIFICATION_DANGLING_TEXT = '用户没有回答这个追问，而是改为直接补充要求；本次追问作废。请按现有信息继续分析，不要重复追问，并把受影响结论的 confidence 调低。';`；`hasStuckToolCall` 的 `.some()` 排除 `part.type === 'tool-ask_clarification' && part.state === 'input-available'`（`input-streaming` 仍算卡住 —— 那是输入没流完）；`repairDanglingToolCalls` 按工具选文案：`ask_clarification` 用 `CLARIFICATION_DANGLING_TEXT`，其余仍用 `DANGLING_TOOL_REPAIR_TEXT`，调用方显式传 `errorText` 时以传入值为准。
- [ ] **Step 3: 写 `ClarificationPanel.tsx`**
```tsx
'use client';
import { useState } from 'react';
import type { Clarification } from '@/agent/shared/schemas';
import { MAX_ANSWER_LENGTH, type ClarificationToolOutput } from '@/agent/shared/outbound';
import { applyDraft, buildClarificationOutput, emptyDrafts } from '@/ui/lib/clarifications';
import { Badge } from '@/ui/components/base/Badge';
import { Button } from '@/ui/components/base/Button';
import { Card, CardBody, CardHeader, CardTitle } from '@/ui/components/base/Card';

/** 追问是暂停点，回答必须以 tool-result 回填；不要改成 sendMessage，那会退化成普通多轮对话 */
export function ClarificationPanel({ questions, onSubmit, onSkip }: {
  questions: Clarification['questions']; onSubmit: (output: ClarificationToolOutput) => void; onSkip: () => void;
}) {
  const [drafts, setDrafts] = useState<string[]>(() => emptyDrafts(questions.length));
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false); // 防双击触发第二次 addToolOutput
  const submit = () => {
    const built = buildClarificationOutput(questions.map((item) => item.question), drafts);
    if (!built.ok) { setError(built.error); return; }
    setSubmitted(true); onSubmit(built.output);
  };
  return (
    <Card className="mt-4 border-warning-200" data-testid="clarification-panel">
      <CardHeader className="bg-warning-50/60">
        <div><CardTitle>AI 需要你确认几件事</CardTitle>
          <p className="mt-0.5 text-xs text-ink-muted">回答会发给模型，请不要粘贴原始记录、姓名或联系方式。回答不会保存到本机，也不会进处理留痕。</p></div>
        <Badge tone="medium">等待你回答</Badge>
      </CardHeader>
      <CardBody>
        <ol className="space-y-4">
          {questions.map((item, index) => (
            <li key={`${index}-${item.question}`}>
              <p className="text-sm font-medium text-ink">{index + 1}. {item.question}</p>
              {item.options.length > 0 ? <div className="mt-2 flex flex-wrap gap-2">
                {item.options.map((option) => (
                  <button key={option} type="button" disabled={submitted} onClick={() => setDrafts((p) => applyDraft(p, index, option))}
                    className="rounded-full border border-line-strong bg-surface px-3 py-1 text-xs text-ink max-md:min-h-11">{option}</button>
                ))}
              </div> : null}
              <textarea rows={2} value={drafts[index] ?? ''} maxLength={MAX_ANSWER_LENGTH} disabled={submitted}
                aria-label={`回答第 ${index + 1} 个问题`} placeholder="也可以自己写；留空表示这题不回答"
                onChange={(event) => setDrafts((p) => applyDraft(p, index, event.target.value))}
                className="mt-2 w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-ink max-md:min-h-11" />
              <p className="mt-1 text-right text-[11px] text-ink-muted">{(drafts[index] ?? '').length} / {MAX_ANSWER_LENGTH}</p>
            </li>
          ))}
        </ol>
        {error !== null ? <p role="alert" className="mt-3 text-xs text-danger-700">{error}</p> : null}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button onClick={submit} disabled={submitted}>提交回答</Button>
          <Button variant="secondary" disabled={submitted} onClick={() => { setSubmitted(true); onSkip(); }}>跳过，按现有信息继续</Button>
          <span className="text-xs text-ink-muted">跳过会让 AI 按现有信息继续，并调低受影响结论的置信度。</span>
        </div>
      </CardBody>
    </Card>
  );
}
```
- [ ] **Step 4: 接进 `AgentPanel.tsx`（六处，先 `grep -n` 定位）**：① `SUPPORTED_TOOLS` 加 `'ask_clarification'`，import `ClarificationPanel`、`pendingClarificationOf`/`clarificationUsedSinceLastUser`/`clarificationSharesStep`/`CLARIFICATION_STEP_VIOLATION_TEXT`、`TOOL_INPUT_SCHEMAS`、`ClarificationToolOutput`；② `onToolCall` 里 `isSupportedTool` 之后、`executeToolCall` 之前插入：
```tsx
if (toolName === 'ask_clarification') {
  const parsed = TOOL_INPUT_SCHEMAS.ask_clarification.safeParse(toolCall.input);
  if (!parsed.success) { addToolOutput({ tool: toolName, toolCallId: toolCall.toolCallId, state: 'output-error', errorText: '追问的格式不对：请按 1–3 个问题、每题 ≤120 字、选项 ≤6 个重新调用，或直接用现有信息继续。' }); return; }
  if (clarificationUsedSinceLastUser(messages)) { addToolOutput({ tool: toolName, toolCallId: toolCall.toolCallId, state: 'output-error', errorText: '本轮已经追问过一次了。请按现有信息继续分析，并把受影响的结论 confidence 调低。' }); return; }
  return; // 刻意不回填：这就是暂停点，等 submitClarification 用 tool-result 回填
}
```
③ `retryPlan` 之后加派生、同一步拒绝 effect、回填函数：
```tsx
const pendingClarification = pendingClarificationOf(messages);
const awaitingAnswer = pendingClarification !== null && !busy;
useEffect(() => {
  if (busy || pendingClarification === null || !clarificationSharesStep(messages)) return;
  void addToolOutput({ tool: 'ask_clarification', toolCallId: pendingClarification.toolCallId, state: 'output-error', errorText: CLARIFICATION_STEP_VIOLATION_TEXT });
}, [busy, pendingClarification, messages, addToolOutput]);
const submitClarification = (output: ClarificationToolOutput) => {
  if (pendingClarification === null) return;
  void addToolOutput({ tool: 'ask_clarification', toolCallId: pendingClarification.toolCallId, output });
};
```
④ `phaseBadge` 最高优先级加 `awaitingAnswer ? { tone: 'medium', text: '等待你回答' } : …`；⑤ `ToolPart`：`input-available` 且 `part.type === 'tool-ask_clarification'` 渲染「已向你提问，等待回答」（**不要转圈**），`input-streaming` 仍转圈，其余保持原样；⑥ 消息列表之后渲染卡片，`<input>` 与提交按钮加 `awaitingAnswer` 禁用、表单 `onSubmit` 开头加 `if (awaitingAnswer) return;`：
```tsx
{awaitingAnswer && pendingClarification ? (
  <ClarificationPanel key={pendingClarification.toolCallId} questions={pendingClarification.questions}
    onSubmit={submitClarification} onSkip={() => submitClarification({ answers: [], skipped: true, answeredCount: 0 })} />
) : null}
```
- [ ] **Step 5: 跑测试与门禁，提交**
```powershell
node_modules/.bin/vitest.cmd run src/ui/lib/agentPhase.test.ts
node_modules/.bin/tsc.cmd --noEmit; pnpm test; pnpm build     # 以实测为准（本计划累计新增约 20 条单测；69 个测试文件）
git add src/ui/lib/agentPhase.ts src/ui/lib/agentPhase.test.ts src/ui/components/ClarificationPanel.tsx src/ui/components/AgentPanel.tsx
git commit -F D:\tmp\commit-msg.txt   # "feat(ui): AI 主动追问的暂停点与回答卡片"
```

---
### Task 4: E2E —— 作答续跑与跳过继续（约 2.5 h）
**Files:** Create `tests/e2e/clarification.spec.ts`。**Interfaces:** Consumes Task 3 的 `data-testid="clarification-panel"`、按钮文案「提交回答」「跳过，按现有信息继续」、`helpers.ts` 的 `blockSemanticModelDownload`/`importFixture`；Produces 新增 2 条 E2E（总数以 `pnpm test:e2e` 实测为准：基线 86 + 本计划 2；若前序计划已合并会更高）。
- [ ] **Step 1: 写 mock 与两条用例**
```ts
import { test, expect, type Page } from '@playwright/test';
import { blockSemanticModelDownload, importFixture } from './helpers';
const SSE = { 'content-type': 'text/event-stream', 'x-vercel-ai-ui-message-stream': 'v1' };
const stream = (c: unknown[]) => c.map((x) => `data: ${JSON.stringify(x)}\n\n`).join('') + 'data: [DONE]\n\n';
const text = (id: string, delta: string) => [{ type: 'text-start', id }, { type: 'text-delta', id, delta }, { type: 'text-end', id }];
const round = (start: unknown, steps: unknown[]) => [start, { type: 'start-step' }, ...steps, { type: 'finish-step' }, { type: 'finish' }];
// 复刻真实服务端 id 规则：历史以 assistant 结尾 → 回上一条 id；否则由客户端生成
const startChunk = (body: string) => {
  const messages = (JSON.parse(body) as { messages?: { id: string; role: string }[] }).messages;
  const last = messages?.[messages.length - 1];
  return last?.role === 'assistant' ? { type: 'start', messageId: last.id } : { type: 'start' };
};
// 只取最后一条用户消息：整份请求体里含着上一轮的追问原文
const lastUserText = (body: string) => {
  const messages = (JSON.parse(body) as { messages?: { role: string; parts: { text?: string }[] }[] }).messages ?? [];
  return (([...messages].reverse().find((m) => m.role === 'user')?.parts) ?? []).map((p) => p.text ?? '').join('\n');
};
const ISSUE = { checkId: 'duplicates', severity: 'medium', title: '学号列有 2 组重复', description: '学号是唯一标识，出现重复通常意味着数据合并时出了问题。', columns: ['学号'], confidence: 0.8,
  suggestion: { action: 'review_duplicates', params: {}, rationale: '先确认这两组是否为同一条记录', columns: ['学号'] } };
async function mock(page: Page) {
  const bodies: string[] = [];
  await page.route('**/api/agent', async (route) => {
    const body = route.request().postData() ?? ''; bodies.push(body);
    const answered = body.includes('重点高中') || body.includes('"skipped":true');
    const steps = body.includes('"tool-submit_issue"') ? text('f', '按你确认的口径继续，结论已整理。')
      : answered ? [...text('2', '明白，我按这个口径继续。'), { type: 'tool-input-available', toolCallId: 'submit-1', toolName: 'submit_issue', input: ISSUE }]
      : [...text('1', '我需要确认一个口径。'), { type: 'tool-input-available', toolCallId: 'clarify-1', toolName: 'ask_clarification',
          input: { questions: [{ question: '「学校类型」里的「重点」指什么？', options: ['重点高中', '省重点'] }] } }];
    await route.fulfill({ status: 200, headers: SSE, body: stream(round(startChunk(body), steps)) });
  });
  return bodies;
}
async function open(page: Page) {
  await importFixture(page); await page.getByTestId('sidebar').getByRole('link', { name: 'AI 分析' }).click();
  await page.getByPlaceholder(/这份问卷数据/).fill('这份数据有什么问题'); await page.getByRole('button', { name: '开始分析' }).click();
}
test.beforeEach(async ({ page }) => { await blockSemanticModelDownload(page); });
test('追问 → 面板作答 → tool-result 回填 → 续跑并提交问题', async ({ page }) => {
  const bodies = await mock(page); await open(page);
  const panel = page.getByTestId('clarification-panel');
  await expect(panel).toBeVisible(); await expect(page.getByPlaceholder(/这份问卷数据/)).toBeDisabled();
  await expect(page.getByText('模型没能把这一步发完')).toHaveCount(0); // Review Focus 2
  await panel.getByRole('button', { name: '重点高中' }).click();
  await expect(panel.getByRole('textbox', { name: '回答第 1 个问题' })).toHaveValue('重点高中');
  await panel.getByRole('button', { name: '提交回答' }).click();
  await expect(page.getByTestId('issue-review')).toContainText('学号列有 2 组重复');
  await expect(page.getByText('按你确认的口径继续，结论已整理。')).toBeVisible(); await expect(panel).toHaveCount(0);
  expect(bodies).toHaveLength(3); expect(bodies[1]).toContain('"tool-ask_clarification"'); expect(bodies[1]).toContain('重点高中');
  expect(lastUserText(bodies[1])).not.toContain('重点高中'); // 回答不是一条用户消息
});
test('跳过追问 → 按现有信息继续，模型收到 skipped 标记', async ({ page }) => {
  const bodies = await mock(page); await open(page);
  await page.getByTestId('clarification-panel').getByRole('button', { name: '跳过，按现有信息继续' }).click();
  await expect(page.getByTestId('issue-review')).toContainText('学号列有 2 组重复');
  await expect(page.getByText('按你确认的口径继续，结论已整理。')).toBeVisible();
  expect(bodies[1]).toContain('"skipped":true'); expect(lastUserText(bodies[1])).not.toContain('跳过');
});
```
- [ ] **Step 2: 证明测试有效，再跑全量**：先把 Task 3 的 `ask_clarification` 早退临时注释掉，跑 `node_modules/.bin/playwright.cmd test tests/e2e/clarification.spec.ts` 确认两条都会红，再还原；然后 `$env:PLAYWRIGHT_BROWSERS_PATH='D:\ms-playwright'; pnpm test:e2e`（期望在基线上 +2 条；以实测为准）。`.next` 被残留 dev server 弄脏导致大面积「元素找不到」时删 `.next` 重跑（不是产品 bug）。
- [ ] **Step 3: 提交**：`git add tests/e2e/clarification.spec.ts; git commit -F D:\tmp\commit-msg.txt`（"test(e2e): 追问作答续跑与跳过继续"）。

---
### Task 5: 文档与数字同步（技术文档先删后加，30 页不破，约 2.0 h）
**Files:** Modify `docs/技术文档.md`、`开发交接说明.md`、`交接-2026-10-21.md`、`交接-2026-10-23-界面方案第一/二/三轮.md`、`交接-2026-10-25-上下文交接.md`、`README.md`、`代码导读与TS学习.md`、`scripts/check-doc-facts.mjs`。**Interfaces:** Consumes Task 1–4 真实数字；Produces `check:doc` 覆盖新数字、技术文档仍 30/30 页。
- [ ] **Step 1: 先拿真实数字（不要照抄预期）**：`pnpm test; pnpm test:e2e; git log --oneline main..HEAD`。预期 = 当前基线上新增约 20 条单测（69 个测试文件）与 2 条 E2E；**一切以命令实测为准**，并把实测值写进交接 §8.21。
- [ ] **Step 2: 技术文档（新增只写这五处，每处 2–4 行）**：① §1.4 关键数字（单测/E2E/工具数 5 → 6，注明「其中 1 个不执行计算」）；② §3.2 标题「两条通道」→「三条通道」，新增 **通道 C：用户对追问的回答**（只含问题原文与回答、≤500 字/题、不含本地数据），流程图工具列表补 `ask_clarification`；③ §4.4 插入「③′ `ask_clarification` **单独一步**提问 → 界面暂停 → 回答/跳过后按 tool-result 续跑」，写明每轮 1 次、1–3 题、回答不持久化不进留痕；④ §5.2/§5.3 Prompt 五类时机与纪律、工具数 5 → 6（追问「不带 execute、只呈现不执行」）；⑤ 创新点（§6.2 T4 证据 + §6.3）与 §7.1 测试表/§7.5/§8.1 补「追问式交互」与新数字，§8.2 加局限（每轮 1 次 / 不持久化 / 纯文本）。
  **删减（先删后加；仍超页就按序继续删，并在交接记录）**：① §5.10 末段重复的 token 数字句（`**真实 token 用量已经测得到**（T2）：…约 **¥0.13**（按公开单价估算）。`）整句删，保留「比按摘要估的 ¥0.02 高约 6 倍…」；② §3.2 硬约束第 3 条末尾「**尚未做到逐格比对的 golden 测试**（见 §8.2）」改成「pandas 等价性见 §4.8」（原句已过时：2026-10-25 已真跑通过）；③ §5.10 第 1、2 点历史叙述压成 2–3 行；④ §7.3「其余优化」段压成一句；⑤ §8.2 与 §8.1 重复处删一处。**不新增截图**（顶满，图占页），图 3 说明可加半句「含追问卡片」。
- [ ] **Step 3: 其余 7 份 md + README + 脚本**：`docs/开发交接说明.md`（§一 测试/评测行数字；新增 **§8.21 本轮会话（2026-10-26）：AI 主动追问（MVP）**（若前两份计划已合并，以当前最后一节为准）：机制 tool-result 续跑、门禁数字、局限每轮 1 次/不持久化/未做真实模型联调、各任务提交号；§八顶部「今天五节」补一节）；`docs/交接-2026-10-21.md`（§0 现状、§2 表格数字、§3 剩余活补「真实模型联调（可选）」）；`docs/交接-2026-10-23-界面方案第一/二/三轮.md`（三份「测试数字」段）；`docs/交接-2026-10-25-上下文交接.md`（§1/§2 命令注释/§3 数字、§4 出站通道口径两条 → 三条）；`README.md`（测试数、AI 分析功能描述加追问；顺手把过时 L3 数字 94.7%/100%/0.9737 改成当前 78.9%/94.7%/0.8684，原因见交接 §8.15.4）；`scripts/check-doc-facts.mjs`（「测试规模」改新数字；新增两条防漂移：文档含「≤120 字」「1–3 题」且 `src/agent/shared/schemas.ts` 含 `max(120)`；文档含「每轮最多 1 次」且 `src/agent/shared/prompt.ts` 含「每轮分析最多问 1 次」）；`docs/代码导读与TS学习.md`（末尾新增 **模块 41：AI 主动追问 —— 一次工具调用怎么变成暂停点**，四段式：`### 这个模块干什么` / `### 为什么这样写`（为什么用 tool-result 而非用户消息、为什么暂停从消息派生、为什么每轮只问 1 次）/ `### TypeScript 教学点`（联合类型收窄、`z.infer`、`readonly`、`useEffect` 依赖）/ `### 答辩可能怎么问` ≥3 问；「待补充的模块」里「模块 0–40」改「0–41」并加一行）。
- [ ] **Step 4: 重建并校验**
```powershell
$env:TEMP='D:\tmp'; $env:TMP='D:\tmp'
$env:PYTHON='C:\Users\lt\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\python\python.exe'
$env:LO_KIT_NODE='D:\dsh-harness\resources\runtime\primary-runtime\dependencies\node\bin\node.exe'
$env:LO_KIT_CLI='D:\dsh-harness\resources\app.asar.unpacked\dsh\node_modules\@deepseek-ai\libreoffice-kit\lib\cli.js'
pnpm doc:build   # 期望 30 页，超页回 Step 2 继续删
pnpm check:doc   # 项数会随新增防漂移事实增加（当前 30 项，本计划约 +2），以脚本输出为准
```
- [ ] **Step 5: 全量门禁并提交**：`node_modules/.bin/tsc.cmd --noEmit; pnpm test; pnpm test:e2e; pnpm build; pnpm lint`；`git status -sb`（`next-env.d.ts` 无意外改动、`docs/部署指南.docx` 未被 add）；`git add docs scripts/check-doc-facts.mjs README.md; git commit -F D:\tmp\commit-msg.txt`（"docs: 追问功能文档与数字同步（30 页不破）"）。

---
### Task 6: 全分支审查、合并与合并后复测（约 1.0 h）
**Files:** 不改产品代码（审查发现按需修）；只动 Git 历史。**Interfaces:** Consumes Task 0–5 全部提交；Produces `main` 上的 `--no-ff` 合并提交、分支删除、合并结果上的四道门禁。
- [ ] **Step 1: 派全新上下文审查者**：用 `subagent` 只读审查 `git diff main...feat/ai-clarification`，提示词必须含：按 Review Focus 五条逐条找反例并**实际复现**；重点查「追问被误判卡住」「回填打到非最后一条消息」「同一步拒绝是否死循环」「outbound 是否只放行 question/answer」「E2E 是否真能证明答案不是用户消息」；只报可复现问题，按 Critical / Important / Minor 分级。Critical 与 Important 一次修完，**每条先有失败测试再改**，单独提交。
- [ ] **Step 2: 合并前检查**：`git status -sb`（只有未跟踪 `docs/部署指南.docx`）；`node_modules/.bin/tsc.cmd --noEmit; pnpm test; pnpm test:e2e; pnpm build; pnpm lint; pnpm doc:build; pnpm check:doc` 全绿。
- [ ] **Step 3: 合并并在合并结果上复测**：`git checkout main; git merge --no-ff feat/ai-clarification -m "merge: AI 主动追问（MVP，tool-result 回填续跑）"`；再跑一遍 Step 2 的全部命令。期望与合并前一致（passed 数以实际输出为准）；不一致先查清再往下。
- [ ] **Step 4: 删分支、回填数字**：`git branch -d feat/ai-clarification; git log --oneline -3`；把合并提交号与最终数字回填 `docs/开发交接说明.md` §8.21（若合并后又产生提交，允许再提交一次只改数字的文档）。**推送 `origin/main` 与线上部署不在本任务内**：会触发 Vercel 生产部署，需所有者确认时机后单独执行（GitHub 网络不稳，重试循环见交接 §4.2）。

---
## Self-Review
**1. Spec 覆盖**：服务端只声明不带 execute → Task 1（既有 `tools.test.ts` 自动覆盖新工具）；1–3 题/≤120 字/≤6 选项 → Task 1 schema 单测 + Task 3 `maxLength`；每轮 1 次与第二次回填 error → Task 1 `clarificationUsedSinceLastUser` + Task 3 预算分支；暂停点成立 → Task 0 验证 + Task 3 实现 + Task 4 E2E；`agentPhase` 三处 → Task 1 标签 + Task 3 两条单测；单独成步 → Task 2 Prompt + Task 1 `clarificationSharesStep` + Task 3 effect；回答 ≤500 字与「不要粘贴原始记录」→ Task 1 outbound + Task 3 文案/计数器；第三条出站通道 → Task 1 + Task 5 技术文档 §3.2；测试（schema 上限/预算拒绝/暂停判定/回答整形/标签与卡住/两条 E2E）→ Task 1（18 条）+ Task 3（2 条）+ Task 4（2 条）；文档与数字同步 → Task 5；审查/`--no-ff`/合并后重跑/删分支 → Task 6。**已知缺口（写明理由）**：真实模型联调与 L4 评测补充不在本计划（花 API 费用 + 需新增「缺口径」评测查询），列为可选、需所有者拍板；跨表/多表追问、追问带附件或表格、回答持久化到留痕均明确不做。  
**2. 占位符扫描**：无 `TBD`/`TODO`/「类似 Task N」；上限与文案全部写死（120 / 60 / 3 / 6 / 500 / 1 次）；Task 5 数字写成「预期 + 以命令输出为准」——测试数只能在实现后测得，预期由新增用例清单推出、可核对，不是留白。  
**3. 类型一致性**：`clarificationSchema`/`Clarification` → `PendingClarification.questions` → `ClarificationPanel` props 同源；`ClarificationToolOutput` 的 `answers`/`skipped`/`answeredCount` 从 outbound → 面板 → `addToolOutput` → E2E 断言全程一致；`hasStuckToolCall(messages, isStreaming)` 与 `repairDanglingToolCalls(messages, errorText?)` 签名不变，既有 agentPhase 测试无需改写。  
**4. Review Focus → 测试**：1 → Task 4 E2E（`bodies[1]` 含答案、`lastUserText` 不含）+ Task 1 预算按最后一条用户消息计；2 → Task 3 单测 + Task 4 断言无「模型没能把这一步发完」；3 → Task 1 `pendingClarificationOf`（最后是用户消息 → null）+ Task 3 禁输入 + 专用修复文案单测；4 → Task 1 预算单测 + Task 3 同一步拒绝 + Task 2 Prompt 回归；5 → Task 1 outbound 单测（只有两键、限长）+ Task 3 明示文案。
## 需要所有者拍板（开工前确认）
1. **回答是否算「处理留痕」**：本计划定为**不算**（不持久化、不进导出），技术文档 §8.2 如实写；若要进留痕，需改 `Provenance` 与导出格式，属另一个计划。
2. **「每轮分析」口径**：本计划 = 一次带摘要的「开始分析」为一轮；「按此计划执行」不算新轮。若按每次工具循环重置预算，限制会被削弱。
3. **真实模型联调与 L4 补充**做不做（约 ¥2 内、4–6 分钟，需新增评测查询；建议省赛演示前手工冒烟一次，不进日常门禁）。
4. **合并后是否立即推送 `origin/main`**（会触发 Vercel 生产部署；建议本地合并复测后择时推送，留到 11/18 前）。
