# Plan 4：评测与打磨 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让「这个系统到底准不准」从一句主张变成**一张可复现的量化表**。spec §5.9 把评测定为「多数参赛作品缺失、而我们重点建设的一环」，而评分点里有两处直接要它的产物：「RAG 技术应用 6%」要求建立检索评测集，「解决方案有效性 5%」要求「量化评测数据佐证」。目前只有 L2（语义归并）有标注集与阈值扫描，其余四层全是空的。

**Architecture:** 沿用前三个计划立住的三条边界，一条都不动。第一，**`core/` 平台无关且同步** —— 评测要跑真实检查项，所以评测代码只能像单测那样调用 core 的纯函数，不得把浏览器 API 引进 core。第二，**评测数据进仓库、进单测** —— 与 `knowledge/labels/synonym-labels.json` 同一做法：数据集与标准答案是文件，回归由 `pnpm test` 承担，而不是靠一次性脚本。第三，**真实模型调用单独一条、默认跳过** —— 与 `real-api.spec.ts` 同一策略。L4（Agent 层）必须真调模型，所以它的评测脚本挂在 `pnpm eval:agent` 上，不进日常门禁。

**Tech Stack:** Next.js 16（App Router）+ React 19 + TypeScript strict · Vitest · Playwright · ECharts（新增，仅看板用）· 既有 `core/` / `scriptgen/` / `knowledge/`

**Spec:** `docs/superpowers/specs/2026-10-09-data-quality-agent-design.md`（§2.3 性能指标、§5.9 评测方案、§10.1 测试策略、§12 第 4 周、§9 评分点对照）

**前置状态（开工前必须知道）**：Plan 1a/1b/1c、Plan 2、Plan 3 均已合并；§8.8 与 §8.10 的欠账已逐条还清（`core→agent` 反向依赖已锁、L2 阈值已扫、`subject` 已从死参数改为可选加权）。**本计划的评测基线就是当前 `main`**，所以下面每一层的「达标线」都是对着现状定的，不是对着想象。

## Global Constraints

- **隐私（第一硬承诺）**：原始数据不得离开浏览器。评测数据集是**构造的假数据**，但仍按真实路径跑 —— 它只走浏览器内的 core，不上传。
- **`core/` 平台无关**：不得引用任何浏览器或 Node 专有 API，由 `src/core/platform.test.ts` 守（**含 `@/agent` 与 `@/ui` 反向依赖**，这半边本计划开始前刚上锁）。
- **评测数据进仓库、进单测**：数据集与标准答案是文件；`pnpm test` 就是回归。禁止把指标写死在文档里而没有可重跑的产出者。
- **真实模型调用不进日常门禁**：L4 评测挂 `pnpm eval:agent`，默认需要显式执行。理由是既有那条决定 —— 门禁一旦会因网络随机变红就失去判断力。
- **性能**（spec §2.3）：5 万行 × 50 列，剖析 ≤ 3 秒、检查全流程 ≤ 30 秒、界面全程不卡顿。**当前实测：剖析用例在并行负载下打出 3311–6161ms，预算是 3000ms** —— 这是 Task 8 的动因，不是新问题。
- **全中文**：代码注释、界面文案、提交信息。命名不用 `data1`/`temp`/`res`/`obj`。注释只写「为什么」。
- **提交粒度**：一个提交一件事。每个任务结束时四道门禁全绿才提交。
- **构建命令**（PowerShell，先设环境变量，见交接说明 §三）：`$env:TEMP='D:\tmp'` · `$env:PLAYWRIGHT_BROWSERS_PATH='D:\ms-playwright'`；门禁为 `tsc --noEmit` → `pnpm test` → `pnpm test:e2e` → `pnpm build`。

## Review Focus

这六类情形最可能让评测**产出好看但没有效力**的结论。每一条都钉在具体任务的测试里。

1. **指标算给自己看**（自欺）—— 用「检查项自己产出的问题」当标准答案，检出率必然是 100%。所以标准答案必须**独立于实现**：注入缺陷时记下的是「第 3 行第 2 列的值改成了 999」，不是「outliers 应该报一条」。
2. **只报检出率、不报误报率** —— 一个把所有列都报成问题的实现检出率是 100%。每一层都必须同时给出「漏报」与「误报」两个数。
3. **评测集与演示数据同源** —— `tests/e2e/fixtures/messy-survey.csv` 只有 7 行，用它算出来的指标没有意义。评测集必须与 E2E 参照数据分开，且规模写得出来。
4. **L4 评测变成不可复现的对话** —— Agent 层天然不确定（同一问题两次可能不同轮次）。所以 L4 的指标必须是**对多次运行取分布**（如「平均轮次」「成功率」），且评测脚本要能独立重跑并打印原始记录，而不是只给一个结论数字。
5. **看板把数字装饰化** —— 看板是给人看的，最容易变成「一排漂亮的数字」。每个指标必须同时显示**它的判据与达标线**（如「Precision 1.0000 / 要求 ≥0.95 / 达标」），否则读的人无法判断好坏。
6. **性能优化改变结果** —— Task 8 要把检查移到 Worker。搬进 Worker 的必须是**同一份 `core` 实现**，不得出现「Worker 版」与「主线程版」两套逻辑；搬完必须断言结果逐字节一致。

---

## File Structure

**新建**

| 文件 | 职责 |
| --- | --- |
| `knowledge/eval/README.md` | 评测集总说明：怎么构造、怎么跑、指标怎么读 |
| `knowledge/eval/dataset/base-clean.csv` | 干净底表（无缺陷），评测集的唯一真源 |
| `knowledge/eval/dataset/injector.mjs` | 注入脚本：底表 + 缺陷清单 → 脏数据 + 标准答案 |
| `knowledge/eval/dataset/defects.json` | 缺陷清单（注入什么、注入到哪一行哪一列） |
| `knowledge/eval/dataset/answers.json` | 注入脚本的产物：标准答案（行/列/缺陷类型） |
| `src/core/evaluate/` | 评测原语：把「检查结果」与「标准答案」比对，算检出率/误报率/定位准确率 |
| `src/core/evaluate/index.ts` | `scoreL1(issues, answers)` 等纯函数出口 |
| `src/ui/components/QualityReportPanel.tsx` | `/export` 上的指标看板与图表 |
| `src/ui/components/Chart.tsx` | ECharts 的最小封装（按需引入，避免整包进 bundle） |
| `src/ui/lib/workerChecks.ts` | 把 `runAllChecks` 搬进 Web Worker 的客户端封装（含主线程降级） |
| `src/worker/checks.worker.ts` | Worker 入口：只做「收 Dataset → 调 core → 回结果」 |
| `src/ui/lib/datasetCache.ts` | IndexedDB 暂存：存/取/清数据集与画像 |
| `tests/e2e/quality-report.spec.ts` | 端到端：看板显示指标与达标线 |
| `docs/superpowers/plans/2026-10-16-plan4-evaluation-and-polish.md` | 本文件 |

**修改**

| 文件 | 改动 |
| --- | --- |
| `package.json` | 新增 `echarts`；新增脚本 `eval:l1`、`eval:retrieval`、`eval:agent` |
| `src/ui/stores/datasetStore.ts` | 检查改走 Worker；数据集落 IndexedDB；刷新后恢复 |
| `src/app/export/page.tsx` | 从「纯下载页」改为「报告与导出」：指标看板 + 导出 |
| `src/ui/components/ExportPanel.tsx` | 与看板同页共存，章节顺序按「先结论后产物」 |
| `src/ui/lib/navigation.ts` | 「报告与导出」的说明文案改为含报告 |
| `knowledge/reports/` | 新增 `eval-l1.md` / `eval-retrieval.md` / `eval-agent.md`（产物，脚本生成） |
| `docs/开发交接说明.md` | §8.11 记录本轮；§8.6 的起手式更新 |
| `README.md` | 测试数、评测入口 |

---

### Task 1: 评测数据集（注入已知缺陷）

**这是整个 Plan 4 的关键路径** —— Task 2–6 全部依赖它的标准答案。方法与 spec §5.9.2 一致：从干净数据出发，按预设清单注入已知缺陷，记录标准答案。

规模按 spec 与现状定：**1000 行 × 12 列**（够跑出有意义的比率，又能在单测里秒级跑完），注入 8 类缺陷共 40 处。列要覆盖 core 现在支持的全部检查项（缺失、重复、类型混杂、异常值、单位混用、值域越界、同义写法、重复列名）。

**Files:**
- Create: `knowledge/eval/README.md`
- Create: `knowledge/eval/dataset/base-clean.csv`
- Create: `knowledge/eval/dataset/defects.json`
- Create: `knowledge/eval/dataset/injector.mjs`
- Create: `knowledge/eval/dataset/answers.json`（注入脚本的产物）
- Test: `knowledge/eval/dataset/injector.mjs --self-test`

**Interfaces:**
- Consumes: 无（独立于 `src/`，因为它是**标准答案**，不能由被测实现生成）
- Produces:
  - `injector.mjs --write` 生成 `messy-eval.csv`（脏数据）与 `answers.json`
  - `answers.json` 结构：`{ "dataset": "messy-eval.csv", "rowCount": 1000, "defects": [ { "kind": "outlier", "row": 12, "column": "年龄", "original": 24, "injected": 999 } ] }`
  - **`kind` 的取值必须与 core 的 `checkId` 一一对应**（`missing` / `duplicates` / `type-consistency` / `outliers` / `unit-consistency` / `range-rules` / `category-synonyms` / `duplicate-column-names`），否则 Task 2 得再写一层映射表 —— 而映射表就是漂移的入口

- [ ] **Step 1: 造干净底表**

```bash
node knowledge/eval/dataset/injector.mjs --make-base
```

底表要**真的干净**：用它跑 `runAllChecks` 必须一条问题都不报。这一点先用一次性命令确认，再写进自测（见 Step 4）。

生成规则写在脚本里而不是手写 CSV：手写 1000 行没法复核，而脚本生成的数据每次一致（用固定种子的伪随机），且能用自测断言它的形状。

- [ ] **Step 2: 写缺陷清单**

`defects.json` 只写「注入什么」，不写「应该报什么」—— 后者由注入脚本从**实际动作**推导，这是 Review Focus 第 1 条的落实。

```json
{
  "seed": 20261016,
  "injections": [
    { "kind": "missing",  "column": "备注", "rows": [3, 17, 42] },
    { "kind": "outliers", "column": "年龄", "rows": [12, 88], "values": [999, -1] },
    { "kind": "type-consistency", "column": "学号", "rows": [5, 60], "values": ["未知", ""] },
    { "kind": "unit-consistency", "column": "剂量", "rows": [7, 31, 55], "values": ["5mg", "10MG", "0.5g"] },
    { "kind": "range-rules", "column": "年龄", "rows": [200], "values": [300] },
    { "kind": "category-synonyms", "column": "学历", "rows": [9, 100, 233], "values": ["研究生", "硕士研究生", "本科在读"] },
    { "kind": "duplicates", "rows": [400, 401], "note": "复制第 400 行" },
    { "kind": "duplicate-column-names", "note": "整表级缺陷，见下" }
  ]
}
```

**两类缺陷是整表级的**（`duplicates` 是行级、`duplicate-column-names` 是表级），标准答案里它们没有 `row`/`column` —— 评分函数必须能处理这两种形状，否则 Task 2 会在第一个真实缺陷上崩。

- [ ] **Step 3: 实现注入与答案产出**

```bash
node knowledge/eval/dataset/injector.mjs --write
# → knowledge/eval/dataset/messy-eval.csv
# → knowledge/eval/dataset/answers.json
```

**关键约束：标准答案由「实际写入动作」推导，不由缺陷清单照抄。** 例如注入 `missing` 时，脚本要先读回该单元格确认它真的变成了空，才把这一条写进 `answers.json`。少了这一步，「清单写了但注入失败」会被算成「实现漏报」。

- [ ] **Step 4: 写自测并跑**

`injector.mjs --self-test` 覆盖脚本**能自己验的那部分**（形状、确定性、篡改检测）：

- 注入后的行数/列数与底表一致（`duplicates` 那类加行的除外）
- `answers.json` 的每条都有 `kind`，且 `kind` 都在允许集合里
- 同一 seed 跑两次结果逐字节一致（**确定性**：否则 Task 2 的指标会随机浮动）
- 篡改反例：把注入的值手工改坏后，脚本能发现答案与数据对不上（`--verify`）

**「底表真的干净」由 Task 2 的单测断言，不在本脚本里** —— 它要调 `runAllChecks`，
而那是 TS，Node 直接跑不了（`src/core/normalize` 是无扩展名的目录导入）。
脚本自测只验形状，语义的那一半交给 `pnpm test`。这也是「不为了凑一条自测而
把 core 抄一遍」的落实。

- [ ] **Step 5: 写 README 与跑门禁，提交**

`knowledge/eval/README.md` 要写清三件事：数据集怎么来的、怎么重新生成、指标怎么读（含「哪些缺陷本轮**不**评」—— 例如跨表键匹配没有实现，就明确不放进评测集，而不是放进去让它永远算漏报）。

四道门禁 + `injector.mjs --self-test` 全绿后提交。

---

### Task 2: L1 评测 —— 检查引擎的准确率

**Files:**
- Create: `src/core/evaluate/index.ts`
- Create: `src/core/evaluate/scoreL1.ts`
- Create: `src/core/evaluate/scoreL1.test.ts`
- Create: `knowledge/tools/eval-l1.mjs`（跑评测并生成报告）
- Create: `knowledge/reports/eval-l1.md`（产物）
- Test: `src/core/evaluate/scoreL1.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `answers.json`；`@/core` 的 `runAllChecks`、`Dataset`
- Produces:
  ```ts
  export interface DefectAnswer {
    kind: string;
    row?: number;
    column?: string;
  }
  export interface L1Score {
    /** 按 checkId 分组 */
    byCheck: Record<string, { detected: number; total: number; falsePositives: number; precision: number; recall: number }>;
    overall: { detected: number; total: number; falsePositives: number; precision: number; recall: number };
  }
  export function scoreL1(issues: QualityIssue[], answers: DefectAnswer[], dataset: Dataset): L1Score;
  ```
- **`scoreL1` 必须是纯函数**：它进 `core/evaluate/`，因此受平台无关约束（不得读文件）。读 `answers.json` 是脚本与测试的事，不是 core 的事。

- [ ] **Step 1: 写评分函数的失败测试**

用**手写的**小数据集与答案（不用 Task 1 的 1000 行），把四种情形各自钉住：

1. 完全命中 → `precision = 1`、`recall = 1`
2. 漏报一处 → `recall < 1`、`detected` 少 1
3. 误报一处（实现报了答案里没有的问题）→ `precision < 1`、`falsePositives = 1`
4. **整表级缺陷**（没有 `row`/`column`）也能计入 → 这一条是 Task 1 Step 2 的接口承诺

再补一条：**答案里同一处缺陷被实现报了两次**（core 的 `rangeRules` 与 `outliers` 可能同时命中 999）—— 不能算成两次命中，否则 recall 会虚高。

- [ ] **Step 2: 跑测试确认失败**

- [ ] **Step 3: 实现 `scoreL1`**

匹配规则要写清楚（这是最容易含糊的地方）：

- 有 `row` + `column`：问题的 `evidence.columns` 含该列，且 `evidence.rowIndices` 含该行
- 只有 `row`：任一列命中该行即可
- 只有 `column`：问题的 `evidence.columns` 含该列
- 表级（都没有）：`checkId` 匹配即可

**这条匹配规则要写进函数注释**，因为它是「检出」的定义；含糊的定义会让指标失去意义。

- [ ] **Step 4: 跑测试确认通过，然后接真实数据**

`knowledge/tools/eval-l1.mjs`：读 `messy-eval.csv` + `answers.json` → 调 core → `scoreL1` → 写 `knowledge/reports/eval-l1.md`。

Node 不能直接 import 项目的 TS（`src/core/normalize` 是无扩展名的目录导入）——**这是本计划第一个要解决的技术障碍**。两条路：

1. 用 `vitest run` 跑一个「生成报告」的测试（与 `literal-scan.test.ts` 同一做法，已验证可行）
2. 让 `.mjs` 脚本 shell 出 `vitest`，再读它的产物

**选 1**：已有先例、不引入新机制，且报告与守门测试共用同一份数据。

- [ ] **Step 5: 看真实指标，把结论写进报告**

报告里**每个检查项一行**：检出/总数、误报、Precision、Recall。并且必须含一句「本轮不达标的项与原因」—— 如果全是 100%，要反问是不是匹配规则太松（Review Focus 第 1、2 条）。

- [ ] **Step 6: 跑四道门禁并提交**

---

### Task 3: L3 检索评测集

spec 的「RAG 技术应用 6%」明文要求「建立检索评测集验证有效性」。现状：`build-index.py` 里只有**机械生成的自召回**，文档自己写着「它不能替代评测集」。

**Files:**
- Create: `knowledge/eval/retrieval-queries.json`（查询 → 期望命中）
- Create: `src/knowledge/retrievalEval.test.ts`（跑真实索引算指标）
- Create: `knowledge/reports/eval-retrieval.md`（产物）
- Test: `src/knowledge/retrievalEval.test.ts`

**Interfaces:**
- Consumes: `public/knowledge/rules.json`、`retrieveRules`
- Produces: 指标 `Hit@1` / `Hit@5` / `MRR`，**按查询分列**（不只是一个汇总数）

- [ ] **Step 1: 构造查询与期望命中**

`retrieval-queries.json` 的形状：`{ "query": "绩点 3.5 4.0", "columns": ["绩点"], "expected": ["ds-gpa-scale-caliber"], "why": "绩点口径是该学科的核心规则" }`。

**至少 20 条**，覆盖三类：学科专属（如绩点/学期）、通用（如单位混用）、**边界**（查一个规则库里确实没有的字段 —— 期望是空或低分，用来暴露「任意查询都返回同一批规则」这种失效）。

`expected` 只写**必须命中**的（allow-list），不写「不该命中」的 —— 后者会变成对排名的过度约束，改一次索引就要重写一遍。

- [ ] **Step 2: 写指标测试（先红）**

- [ ] **Step 3: 实现指标计算并跑出真实数字**

Hit@k 与 MRR 的定义要写进注释。跑完把数字填进 `eval-retrieval.md`，与 `build-index.py` 的自召回数字**并列展示**，并说明两者为什么不同（自召回用规则自己的正例造查询，天然偏乐观）。

- [ ] **Step 4: 把达标线写进测试**

spec 没有给检索的达标线。**本任务要定一个并说明理由** —— 建议 `Hit@5 ≥ 0.9 且 MRR ≥ 0.7`，理由是「注入 Prompt 的是 Top-5，只要答案在前五条里模型就能用到；MRR 保证它不是永远排第五」。达不到就把阈值下调并写明现状，**不许调低定义去凑达标**。

- [ ] **Step 5: 跑四道门禁并提交**

---

### Task 4: L5 系统评测 —— 耗时与成本

**Files:**
- Create: `knowledge/tools/eval-system.mjs`（或同一 vitest 思路的测试）
- Create: `knowledge/reports/eval-system.md`
- Test: 已有 `src/core/perf.test.ts` 保留；本任务加**端到端耗时**的采集

**Interfaces:**
- Consumes: `profileDataset`、`runAllChecks`、Task 1 的数据集（把底表放大到 5 万行 × 50 列）
- Produces: 剖析耗时、检查耗时、单次分析 token 与成本估算

- [ ] **Step 1: 采集本地耗时（不依赖网络）**

5 万行 × 50 列：剖析耗时、全量检查耗时、500 唯一值列的同义检查耗时。**要报分布而不是一个数**（跑 5 次取中位数），因为并行负载下的单次数（§8.5 第 7 条记的那个 3311–6161ms）会误导。

- [ ] **Step 2: token 与成本估算**

用 `buildDataSummary` 对 5 万行 × 50 列生成摘要，量它的字符数并给出粗略 token 估算（中文按字符近似），再按当前模型单价算单次分析成本。**写明这是估算而不是实测** —— 实测要真调 API，属于 Task 5。

- [ ] **Step 3: 看结论，决定 Task 8 的优先级**

如果全量检查超过 30 秒预算，Task 8（Worker 化）就从「体验优化」升级为「指标不达标」。这一步的产出直接决定 Task 8 怎么写。

- [ ] **Step 4: 写报告、跑门禁、提交**

---

### Task 5: L4 Agent 层评测（真调模型）

用户在本次会话中明确要求做这一层。**它必须真调模型**，所以按既有策略与日常门禁隔离：`pnpm eval:agent` 单独执行。

**Files:**
- Create: `knowledge/eval/agent-queries.json`（问题清单 + 期望动作）
- Create: `knowledge/tools/eval-agent.mjs`
- Create: `knowledge/reports/eval-agent.md`（产物，含原始记录）
- Test: 无单测（真调模型不适合当单测）；`tests/e2e/real-api.spec.ts` 保持默认跳过

**Interfaces:**
- Consumes: `POST /api/agent`、Task 1 的评测数据集
- Produces: 每条查询的原始记录（轮次、工具调用序列、是否提交问题、是否失败）+ 汇总指标

- [ ] **Step 1: 定义要评什么（以及怎么避免自欺）**

spec §5.9.1 给了四个指标：工具调用正确率、平均轮次、失败恢复率、计划合理性。**前三个可自动算，「计划合理性」不可** —— 对后者只能做结构化检查（计划里的 `checkId` 都合法、`targetColumns` 都真实存在、条数 ≤ 8），**并把这一限制写进报告**，不许拿「计划非空」冒充「计划合理」。

- [ ] **Step 2: 写评测脚本，跑多次取分布**

同一查询跑 3 次（Agent 天然不确定）。记录：轮次、工具序列、是否命中期望工具、是否最终提交问题、有无降级/报错。

**原始记录必须落盘**（`eval-agent.md` 里逐条列出或另存 JSON）—— 只给结论数字的评测没法复查。

- [ ] **Step 3: 跑一次真实评测，把结论与限制写进报告**

必须写明：花了多少次调用、哪些指标是自动算的、哪些是人工/结构化替代的、以及**本轮样本量太小不能代表稳定性**（如实说，别把它包装成统计结论）。

- [ ] **Step 4: 提交**（不进日常门禁；在 `package.json` 里加脚本并在 README 注明要花 API 费用）

---

### Task 6: 指标看板（挂在 `/export`）

用户选择挂在现有的 `/export`，不新开路由 —— 侧边栏五项已满，新开要动导航与 `navigation.test.ts`。

**Files:**
- Create: `src/ui/components/QualityReportPanel.tsx`
- Create: `src/ui/components/Chart.tsx`
- Modify: `src/app/export/page.tsx`、`src/ui/components/ExportPanel.tsx`
- Test: `tests/e2e/quality-report.spec.ts`

**Interfaces:**
- Consumes: 本次分析的画像与检查结果（`datasetStore`）、`docs` 与 `knowledge/reports/` 里的评测结论（**以静态 JSON 形式同步进 `public/`**，与 `rules.json` 同一做法）
- Produces: 看板页 + 可导出的报告

- [ ] **Step 1: 先定「看板要回答什么问题」**

不是「把数字排开」，而是回答三个问题：**这份数据有多脏**（本次结果）· **系统判断得准不准**（评测指标 + 达标线）· **这次分析做了什么**（检查项、耗时、是否降级）。

每个指标必须同时显示判据与达标线（Review Focus 第 5 条）：`Precision 1.0000 · 要求 ≥0.95 · 达标`。

- [ ] **Step 2: 评测结论进 `public/`**

新增 `scripts/sync-eval.mjs`（照 `sync-rules.mjs` 的样子），把 `knowledge/reports/*.json` / `knowledge/eval/` 的结论同步到 `public/eval/`，并挂进 `predev` / `prebuild`。**理由与 rules.json 相同**：客户端读不到 `knowledge/`，而手工复制必然漂移。

- [ ] **Step 3: 装 ECharts 并按需引入**

`pnpm add echarts`。**必须按需引入**（`echarts/core` + 具体图表），整包会显著影响 `/export` 的首屏 —— 这本身也是评分点「前端性能优化 3%」的内容。写一个 `Chart.tsx` 封装，把注册集中在一处。

- [ ] **Step 4: 写看板组件**

- [ ] **Step 5: E2E**

`quality-report.spec.ts`：导入数据 → 进 `/export` → 断言看板出现、显示达标线文字、图表容器渲染、**没有控制台错误**（用 `tests/e2e/helpers.ts` 的既有做法掐断模型下载）。

- [ ] **Step 6: 跑四道门禁并提交**

---

### Task 7: IndexedDB 暂存（修掉「刷新即空态」）

这是拖了很久的欠账，也是演示最容易踩的坑：数据集只在内存，刷新就没了，`/export` 变空态。

**Files:**
- Create: `src/ui/lib/datasetCache.ts`
- Modify: `src/ui/stores/datasetStore.ts`
- Test: `src/ui/lib/datasetCache.test.ts`（用 `fake-indexeddb` 或注入一个假的存储接口）

**Interfaces:**
- Consumes: `Dataset`、`DatasetProfile`
- Produces: `saveDataset` / `loadDataset` / `clearDataset`；`datasetStore` 启动时尝试恢复

- [ ] **Step 1: 写失败测试**

关键用例：存→取一致（**逐值相等**，不是「长度相同」）· 清空后取回 null · **版本不匹配时丢弃旧数据**（结构变了还硬读会得到半个数据集，比没有更坏）。

- [ ] **Step 2: 实现最小封装**

只存必要的东西：`Dataset` + `meta`（文件名、编码、工作表名）。**画像与问题清单不存** —— 它们能从 Dataset 重算，存两份就会有两个真相。

- [ ] **Step 3: 接进 store，且必须明说「恢复的是上一次的数据」**

静默恢复会让用户以为是他刚上传的那份。界面要给出提示与「放弃并重新上传」入口。

- [ ] **Step 4: E2E 补一条「刷新后数据还在，且有提示」**

- [ ] **Step 5: 跑四道门禁并提交**

---

### Task 8: 性能 —— 把检查搬到 Web Worker

**Files:**
- Create: `src/worker/checks.worker.ts`
- Create: `src/ui/lib/workerChecks.ts`
- Modify: `src/ui/stores/datasetStore.ts`
- Test: `src/ui/lib/workerChecks.test.ts`

**Interfaces:**
- Consumes: `runAllChecks`（**同一份实现**，不得为 Worker 另写一套）
- Produces: `runChecksInWorker(dataset, options): Promise<QualityIssue[]>`，Worker 不可用时降级主线程（与 `parser/workerClient.ts` 同一模式）

- [ ] **Step 1: 先断言「等价」，再谈性能**

`runChecksInWorker` 的结果必须与主线程 `runAllChecks` **逐字段一致**（问题 id 除外，它带计数器）。这是 Review Focus 第 6 条的落实：搬进 Worker 的必须是同一份 core。

- [ ] **Step 2: 实现 Worker 与客户端封装**

照抄 `src/parser/workerClient.ts` 已经验证过的模式：超时、`error` 事件、构造失败、只降级一次。

- [ ] **Step 3: 接进 store，界面给出「正在检查」状态**

- [ ] **Step 4: 实测 5 万行 × 50 列，把前后对比写进 Task 4 的报告**

- [ ] **Step 5: 跑四道门禁并提交**

---

### Task 9: 零散欠账与内容欠账的登记

**Files:**
- Modify: `src/scriptgen/`（`'001'` 类型推断）
- Modify: `docs/开发交接说明.md`

- [ ] **Step 1: 修 `read_csv` 把 `'001'` 推成 `1`**

先写失败测试：生成的脚本必须保留前导零（`dtype=str` 或显式 `converters`），否则学号、编号这类字段在用户本机跑出来会和界面不一致 —— 这直接违背「脚本是真跑过的」那条承诺。

- [ ] **Step 2: 知识库内容欠账只**登记**，不由本计划代写**

§8.5 第 15–17 条（2 条与产品自身重复、15 条意图型触发条件、15 条结构上不可能触发）与第 12 条（学科层继续往数据质量口径补）**都需要领域判断**，属于团队职责。本任务只把它们整理成一张**可勾选的清单**放进交接说明，不代写内容 —— 依据是 `能力边界与分工.md` 写明的「AI 硬写就是编造」。

- [ ] **Step 3: 跑四道门禁并提交**

---

## Self-Review

按 `writing-plans` skill 的要求，写完对 spec 与 plan 各回看一遍。

**1. Spec 覆盖**

| spec 章节 | 落在哪个任务 |
| --- | --- |
| §5.9.2 注入已知缺陷构造评测集 | Task 1 |
| §5.9.1 L1 检查引擎（检出率/误报率/定位准确率） | Task 2 |
| §5.9.1 L2 语义归并 | **已在 Plan 3 完成**（`literal-scan.test.ts` + 标注集）；本计划只补字段数（Task 9 Step 2 的清单） |
| §5.9.1 L3 RAG 检索（命中率/MRR/Top-K） | Task 3 |
| §5.9.1 L4 Agent（工具正确率/轮次/失败恢复/计划合理性） | Task 5 |
| §5.9.1 L5 系统（耗时/token/成本/异常率） | Task 4 |
| §5.9.3 用 `error-analysis` / `evaluate-rag` skill | Task 3（`evaluate-rag`）、Task 5（`error-analysis`）—— 执行时按 skill 目录确认是否可用 |
| §12 第 4 周「质量报告看板」 | Task 6 |
| §12 第 4 周「性能优化」 | Task 8 |
| §2.3 性能指标（3 秒 / 30 秒 / 不卡顿） | Task 4 采集、Task 8 改造 |
| §10.1 测试策略「评测：自建评测脚本」 | Task 1–5 |
| §6.5 / Plan 3 遗留的 IndexedDB 暂存 | Task 7 |
| spec §3.1 分层图里的 `IndexedDB（原始数据暂存）` | Task 7 |

**已知缺口**（写明理由，不留空）：跨表键匹配与多表加载（F3 缺项，评测集里明确**不注入**这类缺陷，避免「永远算漏报」）；Pyodide 脚本验证仍为可选、本计划不做。

**2. 占位符扫描**

没有 `TBD`/`TODO`。两处「由执行者定」是有意的，且给了判据：

- Task 3 Step 4 的检索达标线（spec 未规定）—— 给了建议值与理由，并要求写进测试
- Task 5 Step 1 的「计划合理性」只能结构化检查 —— 明确写出**不许拿「计划非空」冒充**

**3. 类型一致性**

- Task 1 的 `answers.json.kind` ←→ core 的 `checkId`：**一一对应**，且 Task 2 的 `scoreL1` 直接按它分组，不引入映射表。
- Task 2 的 `L1Score` 结构被 Task 6 的看板消费，字段名 `byCheck` / `overall` / `precision` / `recall` 两处一致。
- Task 7 的 `datasetCache` 与 Task 8 的 `workerChecks` 都只改 `datasetStore` 的内部实现，**不改它的对外字段**（`profile` / `issues` / `status` 不变），因此 Task 6 的看板与既有 E2E 不受影响。

**4. Review Focus**

| Review Focus | 钉在哪 |
| --- | --- |
| 1 指标自欺（标准答案由实现生成） | Task 1 Step 3（答案由**实际写入动作**推导）、Task 1 Step 4（篡改反例） |
| 2 只报检出率不报误报率 | Task 2 Step 1 的第三条用例 + 报告表格必含误报列 |
| 3 评测集与演示数据同源 | Task 1 Step 1（1000×12，与 `messy-survey.csv` 的 7 行分开） |
| 4 L4 不可复现 | Task 5 Step 2（跑 3 次取分布、原始记录落盘） |
| 5 看板装饰化 | Task 6 Step 1（每个指标带判据与达标线） |
| 6 性能优化改变结果 | Task 8 Step 1（逐字段一致） |
