# Plan 3：语义与产出 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让「AI 比 pandas 强在哪」这句主张第一次真正成立 —— 端侧 embedding + 分层归并让「硕士／研究生」这类**字面零重叠**的同类写法能被检出，再把检出结果接上人工确认、清洗执行、脚本导出与留痕，最后把已建好的 113 条领域规则库在运行时检索起来。

**Architecture:** 沿用 Plan 2 已经立住的两条边界。第一，**`core/` 保持平台无关且同步** —— embedding 是异步且平台相关的，所以 core 只做「余弦 + 决策 + 产出问题」，向量由调用方算好传进来（`vectors?: Map<string, number[]>`），这与现有 `rangeRules?: RangeRule[]` 的注入方式同构。第二，**算法与执行分层**：`core/synonyms/` 是纯函数，`src/embedding/` 只在浏览器跑，两者由 `src/ui/lib/synonymBridge.ts` 串起来。

**Tech Stack:** Next.js 16（App Router）+ React 19 + TypeScript strict · Zustand · Zod · Vitest · Playwright · AI SDK（`streamText` + 无 `execute` 的客户端工具）· `@huggingface/transformers`（Transformers.js，WebGPU → WASM 回退）· `bge-small-zh-v1.5` ONNX 量化版

**Spec:** `docs/superpowers/specs/2026-10-09-data-quality-agent-design.md`（§5.2 工作流、§5.3 工具集、§5.4 RAG、§5.5 端侧 embedding 与类别同义检测、§6.4 清洗动作、§6.5 处理留痕、§12 第 3 周）

## Global Constraints

- **隐私（第一硬承诺）**：原始数据不得离开浏览器；只允许发送聚合后的结构摘要。新的出站通道一律经 `src/agent/outbound.ts` 白名单重建 —— **新增字段默认出门不了**。
- **`core/` 平台无关**：不得引用任何浏览器或 Node 专有 API，由 `src/core/platform.test.ts` 守。
- **工具刻意不带 `execute`**：AI SDK 里没有 `execute` 的工具会终止本轮循环、把调用交给客户端 —— 这是「工具在浏览器执行」的技术前提，已有测试锁死。
- **一次提交一条问题**：`submit_issue` 单条；文本上限 `title` 60 / `description` 300 / `rationale` 200。整份报告塞进一次调用会流不完。
- **性能**（spec §2.3）：5 万行 × 50 列，剖析 ≤ 3 秒、检查全流程 ≤ 30 秒、界面全程不卡顿。
- **全中文**：代码注释、界面文案、提交信息。命名不用 `data1`/`temp`/`res`/`obj`。注释只写「为什么」。
- **提交粒度**：一个提交一件事。每个任务结束时四道门禁全绿才提交。
- **Python 工具链独立**：`knowledge/tools/` 不在 Vitest 里，它的自测是 `build-index.py --self-test`。改它必须跑。
- **构建命令**（PowerShell，先设环境变量，见交接说明 §三）：`$env:TEMP='D:\tmp'` · `$env:PLAYWRIGHT_BROWSERS_PATH='D:\ms-playwright'`；门禁为 `tsc --noEmit` → `pnpm test` → `pnpm test:e2e` → `pnpm build`。

## Review Focus

这五类输入或情形，spec 没有逐条写明，但最可能让使用者踩到。每一类都在它所属任务的测试里钉死。

1. **反义与互斥类别被误合并** —— `男／女`、`是／否`、`本科／硕士`、`1／2`、`无／未填`。向量空间里它们天然接近，而误合并会直接破坏数据，是 spec §5.5.1 点名的**核心风险**。主指标 Precision ≥ 0.95（Precision 优先，因为漏检只是「没帮上忙」）。
2. **embedding 模型下载失败、断网、或 WebGPU 不可用** —— 界面必须明示「语义归并不可用，已降级为结构化规则」，**不能静默失败，也不能卡住首屏**（模型约 25 MB，spec §4.3 要求懒加载 + 后台预取 + 降级）。
3. **某列唯一值极多**（spec §5.5.5 举的是 500 个）—— 两两比较约 12.5 万对。必须先用 L1/L2 粗筛再决定给哪些取值算向量，否则检查全流程会超出 30 秒预算。
4. **清洗动作作用在「只给了部分列」的数据上** —— `run_checks` 允许传 `columns` 只跑几列，但**执行清洗必须基于完整 `Dataset`**，否则行数虽对、其余列会被静默丢掉。
5. **导出的 pandas 脚本在用户本机跑出来与界面显示不一致** —— 这正是 `core/` 保持平台无关的理由（设计文档 §3.4：浏览器与将来的 MCP Server 共用同一份实现）。脚本必须由**与界面同一套动作序列**生成，且能被独立验证。
6. **`rules.json`（920 KB）加载失败或离线** —— `/rules` 页必须给出可读的降级提示，而不是白屏或一直转圈。

---

## File Structure

**新建**

| 文件 | 职责 |
| --- | --- |
| `src/core/synonyms/types.ts` | 归并相关的公共类型：候选、信号、阈值、判决 |
| `src/core/synonyms/literal.ts` | L2 字面相似度：编辑距离、Jaro-Winkler、子串包含、后缀剥离 |
| `src/core/synonyms/guard.ts` | 反义／互斥护栏：数值型、布尔型、单字对、长度极短且字符集不同 |
| `src/core/synonyms/decide.ts` | 组合决策规则（spec §5.5.3）+ 候选对生成 + 问题产出 |
| `src/core/synonyms/index.ts` | `checkCategorySynonyms` 等对外出口 |
| `src/embedding/types.ts` | `Embedder` 接口、加载状态、降级原因 |
| `src/embedding/loadModel.ts` | Transformers.js 加载、WebGPU → WASM 回退、Cache API、懒加载 + 预取 |
| `src/embedding/embedder.ts` | 批量 `embed(texts)`、维度校验、失败降级 |
| `src/ui/lib/synonymBridge.ts` | 串起 core 与 embedding：粗筛 → 算向量 → 决策 → 产出问题 |
| `src/ui/stores/planStore.ts` | 检查计划的勾选覆盖状态（计划本体仍从消息派生） |
| `src/ui/stores/provenanceStore.ts` | 清洗动作序列、应用前后的数据集、留痕 |
| `src/ui/components/CheckPlanPanel.tsx` | 检查计划面板：reasoning + 检查项，可勾选、可执行 |
| `src/ui/components/RuleLibraryPanel.tsx` | `/rules` 页的规则浏览与检索试跑 |
| `src/ui/components/ExportPanel.tsx` | 导出：清洗后数据、报告、pandas 脚本、留痕 |
| `src/scriptgen/types.ts` | `CleaningAction` / `Provenance` 的 TS 契约（对应 spec §6.4／§6.5） |
| `src/scriptgen/pandas.ts` | 动作序列 → pandas 脚本（纯字符串，零运行时依赖） |
| `src/scriptgen/index.ts` | `buildScript` / `buildProvenance` 出口 |
| `knowledge/reports/embedding-validation.md` | 验证实验结论（Task 1 的产物） |
| `tests/fixtures/synonym-labels.json` | 归并标注集（正例对／负例对），进仓库、进单测 |
| `tests/e2e/cleaning.spec.ts` | 端到端：接受问题 → 执行清洗 → 导出 |
| `tests/e2e/rules.spec.ts` | 端到端：/rules 检索**

**修改**

| 文件 | 改动 |
| --- | --- |
| `src/core/checks/index.ts` | 注册第 7 项检查 `category-synonyms`；`RunChecksOptions` 增加 `synonyms?: SynonymOptions` |
| `src/core/index.ts` | 导出 synonyms 与 cleaning 的公共 API |
| `src/agent/toolSchemas.ts` | 新增 `plan_checks`、`query_rules` 两个工具的输入契约 |
| `src/agent/schemas.ts` | 新增 `checkPlanSchema` |
| `src/agent/tools.ts` | 把两个新工具加进交给模型的清单 |
| `src/agent/outbound.ts` | 新增计划与规则命中的出站塑形；**规则命中的 `规则内容` 必须逐字保留**（那是要注入 Prompt 的领域知识，不是原始数据） |
| `src/agent/prompt.ts` | 提示词补「先计划后执行」与「规则命中优先于常识」两段 |
| `src/ui/lib/toolExecutors.ts` | 实现 `plan_checks`、`query_rules` 两个 case |
| `src/ui/lib/navigation.ts` | `/rules` 与「报告与导出」改为 `available: true` |
| `src/ui/stores/reviewStore.ts` | 记录用户决定与最终动作序列，供清洗执行与留痕 |
| `src/ui/components/IssueReview.tsx` | 解禁「执行清洗」按钮，接上真实执行 |
| `src/app/rules/page.tsx` | 新建 `/rules` 路由页 |

---

### Task 1: 端侧 embedding 验证实验（实施前先做）

这是设计文档 §5.5.6 明文要求、而**至今从未执行**的一步。它不做产品代码，只回答一个问题：这条技术路线成不成立。结论先写清楚，再决定后面几个任务要不要按计划走。

**Files:**
- Create: `knowledge/tools/validate-embedding.py`
- Create: `knowledge/reports/embedding-validation.md`（产物，脚本生成）
- Create: `knowledge/labels/synonym-labels.json`（标注集，真源）
- Test: `knowledge/tools/validate-embedding.py --self-test`

**Interfaces:**
- Consumes: 无（独立脚本，不依赖 `src/`）
- Produces: 标注集文件 `knowledge/labels/synonym-labels.json`，结构 `{ "fields": [ { "name": str, "values": [str] } ], "positivePairs": [[str,str]], "negativePairs": [[str,str]] }`；报告 `knowledge/reports/embedding-validation.md` 给出 `T_L2` / `T_high` / `T_low` 三个阈值与 Precision/Recall，或明确写出「不达标，降级为 L1+L2」。

- [ ] **Step 1: 建标注集，覆盖 spec §5.5.1 列举的全部情形**

标注集是这一步唯一需要「人手判断」的东西，也是后面所有阈值的依据。**负例必须显著多于正例**（spec §5.5.4：负例 ≥ 200，正例 ≥ 100）。实验阶段先做到「正例 ≥ 80、负例 ≥ 160、字段 ≥ 30」，并在报告里如实写明尚未达到 spec 的最终规模，Plan 4 建评测集时补足。

```json
{
  "fields": [
    { "name": "学历", "values": ["硕士", "研究生", "硕士研究生", "本科", "大学本科", "博士"] },
    { "name": "性别", "values": ["男", "女性", "M", "F", "1", "2"] },
    { "name": "单位", "values": ["mg", "MG", "毫克", "ｇ", "g", "kg"] },
    { "name": "是否吸烟", "values": ["是", "否", "Y", "N", "1", "0"] },
    { "name": "在读状态", "values": ["本科在读", "在读", "已毕业", "毕业"] }
  ],
  "positivePairs": [
    ["硕士", "研究生"],
    ["硕士", "硕士研究生"],
    ["mg", "MG"],
    ["mg", "毫克"],
    ["男", "男性"],
    ["本科在读", "在读"]
  ],
  "negativePairs": [
    ["男", "女"],
    ["是", "否"],
    ["本科", "硕士"],
    ["1", "2"],
    ["无", "未填"],
    ["博士", "硕士"],
    ["已毕业", "在读"],
    ["g", "kg"]
  ]
}
```

**必须补齐的负例类型**（这是这一步的价值所在，别只填显眼的）：同领域不同类别（`本科／硕士／博士` 两两）、反义对（`男／女`、`是／否`、`有／无`、`在读／已毕业`）、纯数字对（`1／2／3`）、长度极短且字符集不同（`男／M`、`无／／`）、语义相近但含义不同（`无／未填`、`缺失／不适用`）、量级相差倍数（`g／kg`、`元／万元`）。

- [ ] **Step 2: 写脚本骨架与自测**

```python
# knowledge/tools/validate-embedding.py
"""端侧 embedding 验证实验（设计文档 §5.5.6）。

独立于产品：只回答「bge-small-zh 能不能支撑类别同义归并」。
结论写进 knowledge/reports/embedding-validation.md，阈值写进同一份报告。

用法：
    python knowledge/tools/validate-embedding.py --self-test    # 校验标注集与决策规则
    python knowledge/tools/validate-embedding.py --embedder bge # 真跑，需要下载模型
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LABELS = ROOT / "labels/synonym-labels.json"
REPORT = ROOT / "reports/embedding-validation.md"


def load_labels() -> dict:
    data = json.loads(LABELS.read_text(encoding="utf-8"))
    # 占位：Step 3 会补真正的校验
    return data


def run_self_test() -> int:
    labels = load_labels()
    assert labels["positivePairs"], "正例对不能为空"
    assert labels["negativePairs"], "负例对不能为空"
    print(f"自测通过：正例 {len(labels['positivePairs'])} 对，负例 {len(labels['negativePairs'])} 对")
    return 0


if __name__ == "__main__":
    if "--self-test" in sys.argv:
        sys.exit(run_self_test())
    sys.exit("本步骤只实现 --self-test；真跑见 Step 4")
```

- [ ] **Step 3: 补全标注集校验，让它能挡住自相矛盾的标注**

正负例重叠、取值不在任何字段里、正负例同一对同时出现 —— 这三种错误会让后面的阈值扫描算出一个假的最优点。

```python
def validate_labels(labels: dict) -> list[str]:
    """返回问题清单，空列表表示通过。"""
    problems = []
    known = {value for field in labels["fields"] for value in field["values"]}

    for name in ("positivePairs", "negativePairs"):
        for pair in labels[name]:
            if len(pair) != 2:
                problems.append(f"{name} 里有一对不是两个取值：{pair}")
                continue
            for value in pair:
                if value not in known:
                    problems.append(f"{name} 里的「{value}」不在任何字段的取值里")

    def as_key(pair):
        return tuple(sorted(pair))

    positives = {as_key(pair) for pair in labels["positivePairs"]}
    negatives = {as_key(pair) for pair in labels["negativePairs"]}
    for overlap in positives & negatives:
        problems.append(f"「{overlap[0]}／{overlap[1]}」同时出现在正例与负例里")

    if len(negatives) < 2 * len(positives):
        problems.append(
            f"负例只有正例的 {len(negatives) / max(len(positives), 1):.2f} 倍；"
            "spec §5.5.4 要求负例显著多于正例（≥2 倍），否则 Precision 会被高估"
        )
    return problems
```

- [ ] **Step 4: 跑真实验：加载模型 → 算相似度 → 扫阈值 → 出 PR**

```python
def embed_with_bge(texts: list[str]) -> list[list[float]]:
    """用 Transformers.js 的 Python 等价物算向量。

    这里刻意用 sentence-transformers 而不是产品要用的 @huggingface/transformers：
    实验要回答的是「这个模型能不能区分这些中文类别」，与最终在浏览器里怎么加载无关。
    换后端必须重扫阈值（spec §5.5.4 第五步），这一点写进报告。
    """
    from sentence_transformers import SentenceTransformer
    model = SentenceTransformer("BAAI/bge-small-zh-v1.5")
    return model.encode(texts, normalize_embeddings=True).tolist()
```

扫描逻辑按 spec §5.5.4 第三步：对 `t ∈ [0.50, 0.99]`（步长 0.01）算 Precision/Recall，取 **Precision ≥ 0.95 条件下 Recall 最大**的点作为 `T_high`；`T_low` 取 Precision 仍 ≥ 0.99 的最低点（进入「待确认」的门槛要比「直接归并」宽松）。

- [ ] **Step 5: 写结论，并据此决定后面几个任务怎么走**

报告必须明确写出**四种情形中的哪一种**，不能含糊：

| 情形 | 后续动作 |
| --- | --- |
| Precision ≥ 0.95 且有可用 Recall | 按本计划 Task 4/5 原样走，阈值用扫描值 |
| Precision < 0.95 | 降级：`T_high` 抬到 Precision 达标处，剩余候选全部进「待确认」，Task 5 的界面必须解释为什么这么多待确认 |
| 模型下载/运行失败 | 记下失败原因；Task 4 的降级路径升为**主路径**，Task 5 只用 L1+L2，`T_high` 置为不可达（永不自动建议归并） |
| 反义对在低阈值就撞车（如 `男／女` 余弦 ≥ `T_high`） | **护栏（Task 3 的 `guard.ts`）从「优化项」升为「前置条件」**，且必须在 Task 5 之前完成 |

- [ ] **Step 6: 跑自测与真实验，提交**

```bash
python knowledge/tools/validate-embedding.py --self-test
python knowledge/tools/validate-embedding.py --embedder bge
git add knowledge/tools/validate-embedding.py knowledge/labels/synonym-labels.json knowledge/reports/embedding-validation.md
git commit -m "knowledge: 补设计文档 §5.5.6 要求的端侧 embedding 验证实验，给出阈值与路线结论"
```

---

### Task 2: 把 `agent/` 拆成 `shared/` 与 `server/`

交接说明 §8.5 第 9 条：目前 `agent/` 把服务端专用模块与会被客户端 import 的模块压在同一层，读代码的人分不清哪个能进客户端。**必须在加新工具之前做**，否则两个新工具会让它更乱。

**Files:**
- Move: `src/agent/provider.ts` → `src/agent/server/provider.ts`
- Move: `src/agent/tools.ts` → `src/agent/server/tools.ts`
- Move: `src/agent/dataQualityAgent.ts` → `src/agent/server/dataQualityAgent.ts`
- Move: `src/agent/toolSchemas.ts` → `src/agent/shared/toolSchemas.ts`
- Move: `src/agent/schemas.ts` → `src/agent/shared/schemas.ts`
- Move: `src/agent/phases.ts` → `src/agent/shared/phases.ts`
- Move: `src/agent/summary.ts` → `src/agent/shared/summary.ts`
- Move: `src/agent/outbound.ts` → `src/agent/shared/outbound.ts`
- Move: `src/agent/errors.ts` → `src/agent/shared/errors.ts`
- Move: `src/agent/prompt.ts` → `src/agent/server/prompt.ts`
- Test: 现有测试文件随源文件一起移动，路径同步更新

**Interfaces:**
- Consumes: 无
- Produces: 同名导出，只是路径变了。`@/agent/shared/*` 允许被 `src/ui/` 与 `src/app/api/` 同时引用；`@/agent/server/*` **只允许**被 `src/app/api/` 引用。

- [ ] **Step 1: 先写一个守住分层的测试**

这条测试是本任务真正的产出 —— 它让「哪个模块能进客户端」从口头约定变成门禁。

```typescript
// src/agent/layering.test.ts
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 服务端专用模块不得被客户端代码引用。
 *
 * 这条约束原来只存在于注释里。`provider.ts` 读的是 LLM_API_KEY，
 * 一旦被客户端 import，密钥就有随 bundle 出门的风险 —— 而这正是
 * 「公开仓库不得包含任何密钥」那条规则最容易被绕过的地方。
 */
const CLIENT_ROOTS = ['src/ui', 'src/app'];

function collectSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return collectSourceFiles(path);
    return entry.name.endsWith('.ts') || entry.name.endsWith('.tsx') ? [path] : [];
  });
}

describe('agent 分层', () => {
  it('客户端代码不引用 agent/server/ 下的任何模块', () => {
    const offenders: string[] = [];
    for (const root of CLIENT_ROOTS) {
      for (const file of collectSourceFiles(root)) {
        const text = readFileSync(file, 'utf8');
        if (/@\/agent\/server\//.test(text)) offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 2: 跑测试，确认它在重构前就通过（此刻还没有 server/ 目录）**

Run: `npx vitest run src/agent/layering.test.ts`
Expected: PASS —— 现在没有 `@/agent/server/` 这个字符串，所以这条测试在重构前是空转的。**这正是问题**：它现在守不住任何东西。Step 3 之后它才开始有意义。

- [ ] **Step 3: 移动文件并更新全部 import 路径**

用 git mv 保留历史。移动后逐条修 import：

```bash
git mv src/agent/provider.ts src/agent/server/provider.ts
git mv src/agent/tools.ts src/agent/server/tools.ts
git mv src/agent/dataQualityAgent.ts src/agent/server/dataQualityAgent.ts
git mv src/agent/prompt.ts src/agent/server/prompt.ts
git mv src/agent/toolSchemas.ts src/agent/shared/toolSchemas.ts
git mv src/agent/schemas.ts src/agent/shared/schemas.ts
git mv src/agent/phases.ts src/agent/shared/phases.ts
git mv src/agent/summary.ts src/agent/shared/summary.ts
git mv src/agent/outbound.ts src/agent/shared/outbound.ts
git mv src/agent/errors.ts src/agent/shared/errors.ts
```

测试文件同名一起移动。随后全局替换 import 路径（`@/agent/provider` → `@/agent/server/provider`，依此类推）。

- [ ] **Step 4: 跑四道门禁**

Run: `tsc --noEmit` → `pnpm test` → `pnpm build`
Expected: 全绿。**typecheck 必须是判断依据** —— 交接说明 §三记着一次教训：把 typecheck 和 commit 放在同一段脚本里却没拿它做判断，结果类型错误被提交进去了。

- [ ] **Step 5: 确认新的分层测试真的能挡住违规**

临时在 `src/ui/lib/cn.ts` 顶部加一行 `import '@/agent/server/provider';`，跑测试，**必须看到它失败**。然后撤销这一行。

Run: `npx vitest run src/agent/layering.test.ts`
Expected: 加了那行时 FAIL 且指名 `src/ui/lib/cn.ts`；撤销后 PASS。这一步是在证明测试有效，不是走流程。

- [ ] **Step 6: 提交**

```bash
git add -A src/agent src/ui src/app
git commit -m "refactor: agent/ 拆成 shared/ 与 server/，并用测试锁死分层"
```

---

### Task 3: `core/synonyms/` 的 L1 规范化与 L2 字面层

先做不依赖 embedding 的那一半。它本身就有价值（`MG／mg`、`硕士研究生／硕士`、`本科在读／本科` 都能覆盖），也是 embedding 不可用时的降级路径。

**Files:**
- Create: `src/core/synonyms/types.ts`
- Create: `src/core/synonyms/literal.ts`
- Create: `src/core/synonyms/guard.ts`
- Create: `src/core/synonyms/literal.test.ts`
- Create: `src/core/synonyms/guard.test.ts`

**Interfaces:**
- Consumes: `normalizeKey` / `normalizeText`（`src/core/normalize/index.ts`，已存在）、`ColumnProfile` / `Dataset`（`src/core/types.ts`，已存在）
- Produces:
  ```typescript
  // types.ts
  export interface SynonymCandidate { key: string; variants: string[]; count: number }
  export interface SynonymSignals { a: string; b: string; normalizedEqual: boolean; literalSimilarity: number; semanticCosine?: number }
  export type SynonymVerdict = 'merge' | 'review' | 'ignore';
  export interface SynonymThresholds { literal: number; semanticHigh: number; semanticLow: number }
  export interface SynonymAnalysis { column: string; candidates: SynonymCandidate[]; signals: SynonymSignals[] }
  // literal.ts
  export function levenshteinDistance(a: string, b: string): number
  export function normalizedLevenshtein(a: string, b: string): number
  export function jaroWinkler(a: string, b: string): number
  export function stripSuffixes(value: string): string
  export function literalSimilarity(a: string, b: string): number
  // guard.ts
  export function isGuardedPair(a: string, b: string): boolean
  ```

- [ ] **Step 1: 写 L2 的失败测试**

```typescript
// src/core/synonyms/literal.test.ts
import { describe, expect, it } from 'vitest';
import { jaroWinkler, literalSimilarity, normalizedLevenshtein, stripSuffixes } from './literal';

describe('L2 字面层', () => {
  it('完全相同为 1，完全不同为 0', () => {
    expect(normalizedLevenshtein('硕士', '硕士')).toBe(1);
    expect(normalizedLevenshtein('硕士', '博士')).toBe(0);
  });

  it('剥离中文数据高频后缀', () => {
    expect(stripSuffixes('本科在读')).toBe('本科');
    expect(stripSuffixes('硕士研究生')).toBe('硕士');
    expect(stripSuffixes('五年级')).toBe('五');
  });

  it('子串包含给高分，但不给满分 —— 包含不等于等价', () => {
    const score = literalSimilarity('硕士', '硕士研究生');
    expect(score).toBeGreaterThan(0.8);
    expect(score).toBeLessThan(1);
  });

  it('反义对在字面层就该是可分的', () => {
    expect(literalSimilarity('男', '女')).toBe(0);
    expect(literalSimilarity('本科', '硕士')).toBe(0);
  });

  it('Jaro-Winkler 对短串的前缀更敏感', () => {
    expect(jaroWinkler('mg', 'mg')).toBe(1);
    expect(jaroWinkler('abc', 'xyz')).toBeLessThan(0.6);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/core/synonyms/literal.test.ts`
Expected: FAIL，报 `Failed to resolve import "./literal"`

- [ ] **Step 3: 实现 L1/L2**

```typescript
// src/core/synonyms/literal.ts
import { normalizeText } from '../normalize';

/** 中文数据里高频出现、且剥离后不改变语义归属的后缀。顺序有意义：长的在前。 */
const SUFFIXES = ['在读', '已毕业', '年级', '研究生', '以上', '及以下'];

export function stripSuffixes(value: string): string {
  for (const suffix of SUFFIXES) {
    if (value.length > suffix.length && value.endsWith(suffix)) {
      return value.slice(0, -suffix.length);
    }
  }
  return value;
}

export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost);
    }
    previous = current;
  }
  return previous[b.length];
}

export function normalizedLevenshtein(a: string, b: string): number {
  const longest = Math.max(a.length, b.length);
  if (longest === 0) return 1;
  return 1 - levenshteinDistance(a, b) / longest;
}

export function jaroWinkler(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  const window = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const aFlags = new Array<boolean>(a.length).fill(false);
  const bFlags = new Array<boolean>(b.length).fill(false);
  let matches = 0;

  for (let i = 0; i < a.length; i += 1) {
    const from = Math.max(0, i - window);
    const to = Math.min(i + window + 1, b.length);
    for (let j = from; j < to; j += 1) {
      if (bFlags[j] || a[i] !== b[j]) continue;
      aFlags[i] = true;
      bFlags[j] = true;
      matches += 1;
      break;
    }
  }
  if (matches === 0) return 0;

  let transpositions = 0;
  let probe = 0;
  for (let i = 0; i < a.length; i += 1) {
    if (!aFlags[i]) continue;
    while (!bFlags[probe]) probe += 1;
    if (a[i] !== b[probe]) transpositions += 1;
    probe += 1;
  }
  transpositions /= 2;

  const jaro =
    (matches / a.length + matches / b.length + (matches - transpositions) / matches) / 3;

  // 前缀加成只在 Jaro 已经达到 0.7 时启用 —— 这是 Winkler 原始定义，
  // 不加这个门槛会让「本科」与「本科在读」以外的短串也被前缀拉高。
  if (jaro <= 0.7) return jaro;
  let prefix = 0;
  while (prefix < 4 && prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) {
    prefix += 1;
  }
  return jaro + prefix * 0.1 * (1 - jaro);
}

/**
 * L2 相似度：取多路信号的最大值。
 *
 * 为什么不是加权平均：加权平均需要在没有标注集的情况下定权重，而那是拍脑袋。
 * 取最大值等于「任一强信号成立即可」，与 spec §5.5.3 的析取式决策一致；
 * 真正的把关交给组合决策规则与护栏。
 */
export function literalSimilarity(a: string, b: string): number {
  const left = normalizeText(a).toLowerCase();
  const right = normalizeText(b).toLowerCase();
  if (left === right) return 1;

  const strippedLeft = stripSuffixes(left);
  const strippedRight = stripSuffixes(right);
  if (strippedLeft === strippedRight) return 0.99; // 只差后缀，几乎可判等

  const candidates = [
    normalizedLevenshtein(left, right),
    jaroWinkler(left, right),
    normalizedLevenshtein(strippedLeft, strippedRight),
  ];

  // 子串包含：单独给一个「高但不满」的分，因为它抓得住「硕士／硕士研究生」，
  // 抓不住「研究生／硕士」（字面零重叠，只能靠 L3）。
  if (left.includes(right) || right.includes(left)) {
    const ratio = Math.min(left.length, right.length) / Math.max(left.length, right.length);
    candidates.push(0.8 + 0.15 * ratio);
  }

  return Math.max(...candidates);
}
```

```typescript
// src/core/synonyms/guard.ts
import { normalizeText } from '../normalize';

const BOOLEANISH = new Set([
  '是', '否', 'y', 'n', 'yes', 'no', 'true', 'false', 't', 'f', '有', '无', '同意', '不同意',
]);

/**
 * 反义／互斥护栏 —— spec §5.5.3 的「非反义模式」。
 *
 * 这一层不是优化，是**误合并的唯一拦路石**。spec §5.5.1 点名：
 * 「男／女」在向量空间里天然接近，而误合并会直接破坏数据。
 * 所以判定从宽：宁可把可疑对推给「待确认」，也不自动建议归并。
 */
export function isGuardedPair(a: string, b: string): boolean {
  const left = normalizeText(a).toLowerCase();
  const right = normalizeText(b).toLowerCase();

  // 1. 双方都是纯数字或单字符数字 —— 「1／2」不该进语义归并
  if (/^\d+(\.\d+)?$/.test(left) && /^\d+(\.\d+)?$/.test(right)) return true;

  // 2. 布尔型取值
  if (BOOLEANISH.has(left) || BOOLEANISH.has(right)) return true;

  // 3. 单字对且字符集不同 —— 「男／女」「是／否」
  if (left.length === 1 && right.length === 1 && left !== right) return true;

  // 4. 一方是另一方的反义字：中文里常见单字反义对
  const ANTONYM_PAIRS = [
    ['男', '女'], ['是', '否'], ['有', '无'], ['真', '假'], ['高', '低'], ['多', '少'],
    ['在读', '已毕业'], ['毕业', '在读'], ['已婚', '未婚'], ['城', '乡'], ['前', '后'],
  ];
  if (ANTONYM_PAIRS.some(([x, y]) => (left === x && right === y) || (left === y && right === x))) {
    return true;
  }

  // 5. 同一字段族的相邻等级 —— 长度相同、只有一个字符不同、且都是常见序数词
  const ORDINAL_CHARS = /^[一二三四五六七八九十\d]+$/;
  if (
    left.length === right.length &&
    left.length <= 3 &&
    ORDINAL_CHARS.test(left) &&
    ORDINAL_CHARS.test(right)
  ) {
    return true;
  }

  return false;
}
```

- [ ] **Step 4: 写护栏的失败测试，尤其要把 spec 点名的每一对都钉住**

```typescript
// src/core/synonyms/guard.test.ts
import { describe, expect, it } from 'vitest';
import { isGuardedPair } from './guard';

describe('反义与互斥护栏', () => {
  // spec §5.5.1 的「绝不能归并」清单，逐对钉死
  it.each([
    ['男', '女'],
    ['是', '否'],
    ['本科', '硕士'],
    ['1', '2'],
    ['无', '未填'],
  ])('「%s／%s」必须被拦下', (a, b) => {
    expect(isGuardedPair(a, b)).toBe(true);
  });

  it('量级相差倍数的单位不该自动归并', () => {
    expect(isGuardedPair('g', 'kg')).toBe(true);
    expect(isGuardedPair('元', '万元')).toBe(true);
  });

  it('正常的同义写法不该被拦', () => {
    expect(isGuardedPair('硕士', '研究生')).toBe(false);
    expect(isGuardedPair('mg', '毫克')).toBe(false);
    expect(isGuardedPair('本科在读', '本科')).toBe(false);
  });
});
```

- [ ] **Step 5: 跑测试，补实现直到全绿**

Run: `npx vitest run src/core/synonyms/`
Expected: PASS。若「g／kg」未通过，在护栏里补一条**单位量级表**（`{ g: 1, kg: 1000, mg: 0.001 }`），比较两者比值是否为 1 的 10 的整数次幂且不为 1。

- [ ] **Step 6: 提交**

```bash
git add src/core/synonyms
git commit -m "feat(core): 类别归并的 L1 规范化、L2 字面层与反义护栏"
```

---

### Task 4: `src/embedding/` 端侧向量接线

**这一层只在浏览器跑**，因此不放进 `core/`。它要解决的不是「怎么算向量」，而是 spec §4.3 列的四件事：WebGPU 优先 WASM 回退、Cache API、懒加载 + 后台预取、不可用时降级。

**Files:**
- Create: `src/embedding/types.ts`
- Create: `src/embedding/loadModel.ts`
- Create: `src/embedding/embedder.ts`
- Create: `src/embedding/embedder.test.ts`
- Modify: `package.json`（加 `@huggingface/transformers`）

**Interfaces:**
- Consumes: 无（不依赖 core）
- Produces:
  ```typescript
  // types.ts
  export type EmbeddingBackend = 'webgpu' | 'wasm';
  export type EmbedderStatus =
    | { kind: 'idle' }
    | { kind: 'loading'; ratio: number }
    | { kind: 'ready'; backend: EmbeddingBackend }
    | { kind: 'unavailable'; reason: string };
  export interface Embedder {
    /** 懒加载后批量算向量；不可用时抛 EmbedderUnavailableError */
    embed(texts: string[]): Promise<number[][]>;
    status(): EmbedderStatus;
    /** 空闲时预取，不阻塞主流程 */
    prefetch(): void;
  }
  export class EmbedderUnavailableError extends Error {}
  // embedder.ts
  export function createEmbedder(options?: { load?: ModelLoader }): Embedder;
  export const embeddingDimension: number; // 512，bge-small-zh-v1.5
  ```

- [ ] **Step 1: 先确认模型仓库名与后端可用性（这一步不能靠猜）**

```bash
node -e "fetch('https://huggingface.co/api/models/Xenova/bge-small-zh-v1.5').then(r=>console.log(r.status))"
```

Expected: `200`。若 `404`，在 HuggingFace 上搜 `bge-small-zh` 的 ONNX 转换版，把真实的仓库名记进 `loadModel.ts` 的常量 —— **不要留一个没验证过的 id**，那会在用户第一次打开页面时才炸。本机 `huggingface.co` 已验证可达（200），`hf-mirror.com` 可作备用镜像，把可选的 `env.remoteHost` 开关一并记在注释里。

- [ ] **Step 2: 安装依赖并写 loader 的类型与测试（用一个假的 load，不下载模型）**

```typescript
// src/embedding/embedder.test.ts
import { describe, expect, it, vi } from 'vitest';
import { EmbedderUnavailableError, createEmbedder } from './embedder';
import type { ModelLoader } from './types';

/** 单元测试不能下载 25 MB 模型 —— 注入一个假 loader，测的是状态机与降级，不是模型。 */
function fakeLoader(backend: 'webgpu' | 'wasm' = 'wasm'): ModelLoader {
  return async (onProgress) => {
    onProgress(0.5);
    onProgress(1);
    return { backend, run: async (texts) => texts.map(() => [1, 0, 0]) };
  };
}

describe('Embedder 状态机', () => {
  it('初始是 idle，不加载任何东西', () => {
    const embedder = createEmbedder({ load: fakeLoader() });
    expect(embedder.status()).toEqual({ kind: 'idle' });
  });

  it('embed 触发懒加载，成功后状态变 ready 并带上后端', async () => {
    const embedder = createEmbedder({ load: fakeLoader('webgpu') });
    const vectors = await embedder.embed(['硕士']);
    expect(vectors).toHaveLength(1);
    expect(embedder.status()).toEqual({ kind: 'ready', backend: 'webgpu' });
  });

  it('加载失败降级为 unavailable，并且把原因带出来给界面显示', async () => {
    const failing: ModelLoader = async () => {
      throw new Error('网络不可达');
    };
    const embedder = createEmbedder({ load: failing });
    await expect(embedder.embed(['硕士'])).rejects.toBeInstanceOf(EmbedderUnavailableError);
    const status = embedder.status();
    expect(status.kind).toBe('unavailable');
    if (status.kind === 'unavailable') expect(status.reason).toContain('网络不可达');
  });

  it('同一实例只加载一次 —— 重复加载会把 25 MB 下两遍', async () => {
    const load = vi.fn(fakeLoader());
    const embedder = createEmbedder({ load });
    await embedder.embed(['a']);
    await embedder.embed(['b']);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('预取失败不影响主流程，状态回到 idle 之外仍然可用', async () => {
    const failing: ModelLoader = async () => {
      throw new Error('离线');
    };
    const embedder = createEmbedder({ load: failing });
    expect(() => embedder.prefetch()).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(embedder.status().kind).toBe('unavailable');
  });
});
```

- [ ] **Step 3: 跑测试确认失败**

Run: `npx vitest run src/embedding/embedder.test.ts`
Expected: FAIL，报 `Failed to resolve import "./embedder"`

- [ ] **Step 4: 实现 loader 与 embedder**

```typescript
// src/embedding/types.ts
export type EmbeddingBackend = 'webgpu' | 'wasm';

export type EmbedderStatus =
  | { kind: 'idle' }
  | { kind: 'loading'; ratio: number }
  | { kind: 'ready'; backend: EmbeddingBackend }
  | { kind: 'unavailable'; reason: string };

export interface LoadedModel {
  backend: EmbeddingBackend;
  run(texts: string[]): Promise<number[][]>;
}

/** 加载策略可注入：单元测试用它绕开 25 MB 下载，生产用它做 WebGPU→WASM 回退。 */
export type ModelLoader = (onProgress: (ratio: number) => void) => Promise<LoadedModel>;
```

```typescript
// src/embedding/loadModel.ts
import { env, pipeline } from '@huggingface/transformers';
import type { LoadedModel } from './types';

/**
 * 模型仓库。这个 id 必须经过验证 —— 写错的话，用户第一次打开页面才会发现。
 * 候选：Xenova 系列提供的 ONNX 转换版，约 25 MB（spec §4.3）。
 */
const MODEL_ID = 'Xenova/bge-small-zh-v1.5';

/**
 * 允许换镜像。境内直连 huggingface.co 不稳时，把 remoteHost 指到 hf-mirror.com。
 * 用环境变量而不是硬编码：换镜像不该改代码重新部署。
 */
if (process.env.NEXT_PUBLIC_HF_MIRROR) {
  env.remoteHost = process.env.NEXT_PUBLIC_HF_MIRROR;
}

// 浏览器 Cache API 缓存模型文件，二次访问即秒开（spec §4.3）
env.useBrowserCache = true;

async function loadOnDevice(
  device: 'webgpu' | 'wasm',
  onProgress: (ratio: number) => void,
): Promise<LoadedModel> {
  const extractor = await pipeline('feature-extraction', MODEL_ID, {
    dtype: 'q8',
    device,
    progress_callback: (report: { status?: string; progress?: number }) => {
      if (report.status === 'progress' && typeof report.progress === 'number') {
        onProgress(report.progress / 100);
      }
    },
  });

  return {
    backend: device,
    run: async (texts: string[]) => {
      const tensor = await extractor(texts, { pooling: 'mean', normalize: true });
      return tensor.tolist() as number[][];
    },
  };
}

/**
 * 优先 WebGPU，失败回退 WASM（spec §4.3）。
 *
 * 回退必须发生在**一次加载之内**：WebGPU 在部分浏览器上会「加载到一半才报错」，
 * 所以不能只看 API 是否存在就决定用哪个后端。
 */
export const loadModel: ModelLoader = async (onProgress) => {
  try {
    return await loadOnDevice('webgpu', onProgress);
  } catch (error) {
    // WebGPU 不可用是常态（旧版 Chrome、Safari），不当作错误上报，
    // 但进度要重置 —— 否则界面会停在 WebGPU 那次的 40% 不动
    onProgress(0);
    return await loadOnDevice('wasm', onProgress);
  }
};
```

```typescript
// src/embedding/embedder.ts
import { loadModel } from './loadModel';
import type { EmbedderStatus, LoadedModel, ModelLoader } from './types';

export class EmbedderUnavailableError extends Error {}

/** bge-small-zh-v1.5 的向量维度。写死是为了让规则库索引的维度能被校验。 */
export const embeddingDimension = 512;

export interface Embedder {
  embed(texts: string[]): Promise<number[][]>;
  status(): EmbedderStatus;
  prefetch(): void;
}

export function createEmbedder(options: { load?: ModelLoader } = {}): Embedder {
  const load = options.load ?? loadModel;
  let status: EmbedderStatus = { kind: 'idle' };
  let pending: Promise<LoadedModel> | null = null;

  function start(): Promise<LoadedModel> {
    // 同一实例只加载一次：重复加载会把 25 MB 下两遍
    if (!pending) {
      status = { kind: 'loading', ratio: 0 };
      pending = load((ratio) => {
        status = { kind: 'loading', ratio };
      })
        .then((model) => {
          status = { kind: 'ready', backend: model.backend };
          return model;
        })
        .catch((error: unknown) => {
          const reason = error instanceof Error ? error.message : String(error);
          status = { kind: 'unavailable', reason };
          pending = null; // 允许下次重试（网络恢复后不必刷新页面）
          throw error;
        });
    }
    return pending;
  }

  return {
    async embed(texts) {
      if (texts.length === 0) return [];
      let model: LoadedModel;
      try {
        model = await start();
      } catch (error) {
        throw new EmbedderUnavailableError(
          `语义模型不可用（${error instanceof Error ? error.message : String(error)}），已降级为结构化规则。`,
        );
      }
      return model.run(texts);
    },

    status: () => status,

    prefetch() {
      // 空闲预取：失败只记状态，不抛给调用方 —— 预取是优化，不该拖垮任何主流程
      if (status.kind !== 'idle') return;
      void start().catch(() => undefined);
    },
  };
}
```

- [ ] **Step 5: 加依赖、跑测试、跑 typecheck**

```bash
pnpm add @huggingface/transformers
```
Run: `npx vitest run src/embedding/embedder.test.ts` → PASS
Run: `tsc --noEmit` → exit 0

**若 typecheck 报 `process.env` 未定义**：这是客户端文件里用 Node 全局变量导致的。改成在 `next.config.ts` 的 `env` 或模块顶层用 Next 的公开变量注入，**不要**加 `@ts-ignore` —— 那会把「这里混了服务端代码」这个真问题盖掉。

- [ ] **Step 6: 在 `AppShell` 挂上空闲预取**

```typescript
// src/ui/components/AppShell.tsx 内，组件顶层
useEffect(() => {
  // 首次进入应用后空闲时预取，不阻塞任何交互（spec §4.3）
  const timer = window.setTimeout(() => embedder.prefetch(), 3000);
  return () => window.clearTimeout(timer);
}, []);
```
`embedder` 用模块级单例（`src/embedding/instance.ts` 导出 `export const embedder = createEmbedder()`），避免每个组件各建一个把模型下多遍。

- [ ] **Step 7: 提交**

```bash
git add package.json pnpm-lock.yaml src/embedding src/ui/components/AppShell.tsx
git commit -m "feat(embedding): 端侧 bge 向量接线，含 WebGPU→WASM 回退、缓存与可用性降级"
```

---

### Task 5: L3 语义层 + 组合决策，接成 core 第 7 项检查

**Files:**
- Create: `src/core/synonyms/decide.ts`
- Create: `src/core/synonyms/decide.test.ts`
- Create: `src/core/synonyms/index.ts`
- Create: `src/ui/lib/synonymBridge.ts`
- Create: `src/ui/lib/synonymBridge.test.ts`
- Modify: `src/core/checks/index.ts`（注册 `category-synonyms`）
- Modify: `src/core/index.ts`（导出）
- Modify: `src/ui/stores/datasetStore.ts`（接上桥接层）

**Interfaces:**
- Consumes: Task 3 的 `literalSimilarity` / `isGuardedPair` / 类型；Task 4 的 `Embedder`；`ColumnProfile` / `Dataset`
- Produces:
  ```typescript
  // decide.ts
  export const DEFAULT_THRESHOLDS: SynonymThresholds;
  export function collectSynonymCandidates(
    dataset: Dataset,
    options?: { maxUniqueValues?: number },
  ): SynonymAnalysis[];
  export function decideSynonymVerdicts(
    analysis: SynonymAnalysis,
    options?: { thresholds?: Partial<SynonymThresholds>; vectors?: Map<string, number[]> },
  ): Array<{ keys: string[]; verdict: SynonymVerdict; reason: string }>;
  export function checkCategorySynonyms(dataset: Dataset, options?: SynonymOptions): QualityIssue[];
  // index.ts
  export { collectSynonymCandidates, decideSynonymVerdicts, checkCategorySynonyms };
  export { collectVectorsFor } from './decide'; // 桥接层用它决定要给哪些取值算向量
  ```

- [ ] **Step 1: 写组合决策的失败测试，把 spec §5.5.3 的每一条析取都覆盖**

```typescript
// src/core/synonyms/decide.test.ts
import { describe, expect, it } from 'vitest';
import { decideSynonymVerdicts, DEFAULT_THRESHOLDS } from './decide';
import type { SynonymAnalysis } from './types';

/** 构造一条只有两个取值的分析结果，省得每个用例都手写全量字段。 */
function analysisOf(a: string, b: string): SynonymAnalysis {
  return {
    column: '学历',
    candidates: [
      { key: a, variants: [a], count: 10 },
      { key: b, variants: [b], count: 8 },
    ],
    signals: [{ a, b, normalizedEqual: false, literalSimilarity: 0 }],
  };
}

function cosinesOf(a: string, b: string, value: number): Map<string, number[]> {
  // 用一维向量表达余弦：core 只做点积，测试不需要真向量
  return new Map([
    [a, [1]],
    [b, [value]],
  ]);
}

describe('组合决策（spec §5.5.3）', () => {
  it('L1 规范化后相等 → 直接归并', () => {
    const analysis = analysisOf('MG', 'mg');
    analysis.signals[0].normalizedEqual = true;
    const verdicts = decideSynonymVerdicts(analysis);
    expect(verdicts[0].verdict).toBe('merge');
  });

  it('L2 达到阈值 → 归并', () => {
    const analysis = analysisOf('硕士', '硕士研究生');
    analysis.signals[0].literalSimilarity = DEFAULT_THRESHOLDS.literal + 0.01;
    expect(decideSynonymVerdicts(analysis)[0].verdict).toBe('merge');
  });

  it('L3 高相似且无 L2 信号 → 归并（这是「研究生／硕士」唯一能走通的路）', () => {
    const analysis = analysisOf('研究生', '硕士');
    const verdicts = decideSynonymVerdicts(analysis, {
      vectors: cosinesOf('研究生', '硕士', DEFAULT_THRESHOLDS.semanticHigh + 0.01),
    });
    expect(verdicts[0].verdict).toBe('merge');
  });

  it('L3 落在 [T_low, T_high) 且 L2 无正信号 → 待确认，不是归并', () => {
    const analysis = analysisOf('无', '未填');
    const mid = (DEFAULT_THRESHOLDS.semanticLow + DEFAULT_THRESHOLDS.semanticHigh) / 2;
    const verdicts = decideSynonymVerdicts(analysis, { vectors: cosinesOf('无', '未填', mid) });
    expect(verdicts[0].verdict).toBe('review');
  });

  it('L3 落在 [T_low, T_high) 但 L2 有正信号 → 归并', () => {
    const analysis = analysisOf('本科在读', '本科');
    const mid = (DEFAULT_THRESHOLDS.semanticLow + DEFAULT_THRESHOLDS.semanticHigh) / 2;
    analysis.signals[0].literalSimilarity = 0.9;
    const verdicts = decideSynonymVerdicts(analysis, { vectors: cosinesOf('本科在读', '本科', mid) });
    expect(verdicts[0].verdict).toBe('merge');
  });

  it('护栏命中的对即使 L3 很高也不归并 —— 这是误合并的唯一拦路石', () => {
    const analysis = analysisOf('男', '女');
    const verdicts = decideSynonymVerdicts(analysis, {
      vectors: cosinesOf('男', '女', 0.99),
    });
    expect(verdicts[0].verdict).not.toBe('merge');
  });

  it('没有任何信号 → 忽略，不进问题清单', () => {
    const analysis = analysisOf('北京', '上海');
    expect(decideSynonymVerdicts(analysis)[0].verdict).toBe('ignore');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/core/synonyms/decide.test.ts`
Expected: FAIL，报 `Failed to resolve import "./decide"`

- [ ] **Step 3: 实现候选生成与组合决策**

```typescript
// src/core/synonyms/decide.ts
import type { Dataset, QualityIssue } from '../types';
import { normalizeKey } from '../normalize';
import { createIssueId } from '../checks/id';
import { isGuardedPair } from './guard';
import { literalSimilarity } from './literal';
import type { SynonymAnalysis, SynonymCandidate, SynonymThresholds, SynonymVerdict } from './types';

/**
 * 默认阈值。
 *
 * **这三个数不是拍脑袋定的** —— 它们是 Task 1（设计文档 §5.5.6 的验证实验）
 * 在标注集上扫描出来的，出处是 knowledge/reports/embedding-validation.md。
 * 换 embedding 模型必须重新扫描（spec §5.5.4 第五步：阈值与模型强绑定）。
 *
 * 若 Task 1 的结论是「模型不可用」，把 semanticHigh 设为 Number.POSITIVE_INFINITY：
 * 那样 L3 永远不会单独触发归并，只剩 L1/L2 在工作 —— 这正是 spec §5.5.2 说的降级路径。
 */
export const DEFAULT_THRESHOLDS: SynonymThresholds = {
  literal: 0.86,
  semanticHigh: 0.92,
  semanticLow: 0.8,
};

/**
 * 单列参与语义比较的唯一值上限（spec §5.5.5 举的是 500）。
 *
 * 500 个唯一值 → 约 12.5 万对。再高就必须先做更强的粗筛，
 * 否则单列就能吃掉全流程 30 秒的预算。
 */
const MAX_UNIQUE_VALUES = 500;

/** 只有这几类列的值才可能构成「同义写法」。数值列与自由文本列不参与。 */
const MERGEABLE_TYPES = new Set(['category', 'boolean', 'text']);

function toCandidates(distribution: Record<string, number>): SynonymCandidate[] {
  const byKey = new Map<string, SynonymCandidate>();
  for (const [raw, count] of Object.entries(distribution)) {
    const key = normalizeKey(raw);
    if (key === '') continue; // 缺失值不参与归并
    const existing = byKey.get(key);
    if (existing) {
      existing.count += count;
      // 同一个归一化 key 下的多种原始写法要留着 —— 界面要展示「硕士／研究生」
      if (!existing.variants.includes(raw)) existing.variants.push(raw);
    } else {
      byKey.set(key, { key, variants: [raw], count });
    }
  }
  // 排序保证结果稳定：同一份数据跑两次必须得到同样的问题清单
  return [...byKey.values()].sort((left, right) => left.key.localeCompare(right.key));
}

export function collectSynonymCandidates(
  dataset: Dataset,
  options: { maxUniqueValues?: number } = {},
): SynonymAnalysis[] {
  const limit = options.maxUniqueValues ?? MAX_UNIQUE_VALUES;
  const analyses: SynonymAnalysis[] = [];

  for (const column of dataset.columns) {
    const values = column.values;
    const distribution = new Map<string, number>();
    let missing = 0;
    for (const value of values) {
      const key = normalizeKey(value);
      if (key === '') {
        missing += 1;
        continue;
      }
      distribution.set(key, (distribution.get(key) ?? 0) + 1);
    }
    // 缺失率过高的列先交给 missing 检查，这里不重复报
    if (distribution.size < 2 || distribution.size > limit) continue;
    if (missing === values.length) continue;

    const type = inferMergeableType(distribution.size, values.length);
    if (!MERGEABLE_TYPES.has(type)) continue;

    const candidates = toCandidates(Object.fromEntries(distribution));
    if (candidates.length < 2) continue;

    const signals = [];
    for (let i = 0; i < candidates.length; i += 1) {
      for (let j = i + 1; j < candidates.length; j += 1) {
        const a = candidates[i].key;
        const b = candidates[j].key;
        signals.push({
          a,
          b,
          normalizedEqual: a === b,
          literalSimilarity: literalSimilarity(a, b),
        });
      }
    }
    // 完全没有 L2 正信号的列不值得进一步处理
    if (signals.length > 0) analyses.push({ column: column.name, candidates, signals });
  }

  return analyses;
}

/** 一个列的唯一值全都不重复时按 text 处理会更保守，这里用最简判定。 */
function inferMergeableType(uniqueCount: number, rowCount: number): string {
  if (uniqueCount <= 2) return 'boolean';
  if (uniqueCount < rowCount * 0.5) return 'category';
  return 'text';
}

function cosine(left: number[], right: number[]): number {
  if (left.length !== right.length) return 0;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let i = 0; i < left.length; i += 1) {
    dot += left[i] * right[i];
    leftNorm += left[i] * left[i];
    rightNorm += right[i] * right[i];
  }
  if (leftNorm === 0 || rightNorm === 0) return 0;
  return dot / Math.sqrt(leftNorm * rightNorm);
}

export function decideSynonymVerdicts(
  analysis: SynonymAnalysis,
  options: { thresholds?: Partial<SynonymThresholds>; vectors?: Map<string, number[]> } = {},
): Array<{ keys: string[]; verdict: SynonymVerdict; reason: string }> {
  const thresholds = { ...DEFAULT_THRESHOLDS, ...options.thresholds };

  return analysis.signals.map((signal) => {
    const { a, b } = signal;

    // 护栏优先于一切其它信号 —— 包括很高的 L3 余弦
    if (isGuardedPair(a, b)) {
      return { keys: [a, b], verdict: 'ignore' as SynonymVerdict, reason: '属于反义或互斥取值，不参与归并' };
    }
    if (signal.normalizedEqual) {
      return { keys: [a, b], verdict: 'merge' as SynonymVerdict, reason: '规范化后完全相同' };
    }
    if (signal.literalSimilarity >= thresholds.literal) {
      return {
        keys: [a, b],
        verdict: 'merge' as SynonymVerdict,
        reason: `字面相似度 ${signal.literalSimilarity.toFixed(3)} 达到阈值 ${thresholds.literal}`,
      };
    }

    const left = options.vectors?.get(a);
    const right = options.vectors?.get(b);
    const semantic = left && right ? cosine(left, right) : undefined;

    if (semantic !== undefined) {
      if (semantic >= thresholds.semanticHigh) {
        return {
          keys: [a, b],
          verdict: 'merge' as SynonymVerdict,
          reason: `语义相似度 ${semantic.toFixed(3)} 达到阈值 ${thresholds.semanticHigh}`,
        };
      }
      if (semantic >= thresholds.semanticLow && signal.literalSimilarity > 0) {
        return {
          keys: [a, b],
          verdict: 'merge' as SynonymVerdict,
          reason: '语义中等但字面也有正向信号，两者方向一致',
        };
      }
      if (semantic >= thresholds.semanticLow) {
        return {
          keys: [a, b],
          verdict: 'review' as SynonymVerdict,
          reason: `语义相似度 ${semantic.toFixed(3)} 处于待确认区间，需人工判断`,
        };
      }
    }

    return { keys: [a, b], verdict: 'ignore' as SynonymVerdict, reason: '所有信号均未达到阈值' };
  });
}

/**
 * 把「归并」判定的对合并成组，一组产出一个问题。
 *
 * 为什么不一对一报：`硕士／研究生／硕士研究生` 会产出 3 对，
 * 用户看到 3 条几乎一样的问题要逐个接受，而它们本来就是一件事。
 */
export function checkCategorySynonyms(
  dataset: Dataset,
  options: {
    thresholds?: Partial<SynonymThresholds>;
    vectors?: Map<string, number[]>;
    maxUniqueValues?: number;
  } = {},
): QualityIssue[] {
  const analyses = collectSynonymCandidates(dataset, {
    maxUniqueValues: options.maxUniqueValues,
  });
  const issues: QualityIssue[] = [];

  for (const analysis of analyses) {
    const verdicts = decideSynonymVerdicts(analysis, options);
    const mergeKeys = new Set<string>();
    for (const verdict of verdicts) {
      if (verdict.verdict === 'merge') verdict.keys.forEach((key) => mergeKeys.add(key));
    }

    // 并查集：把互相判定为可归并的取值连成组
    const parent = new Map<string, string>();
    const find = (key: string): string => {
      const up = parent.get(key) ?? key;
      if (up === key) return key;
      const root = find(up);
      parent.set(key, root);
      return root;
    };
    for (const key of mergeKeys) parent.set(key, key);
    for (const verdict of verdicts) {
      if (verdict.verdict !== 'merge') continue;
      const [a, b] = verdict.keys;
      const rootA = find(a);
      const rootB = find(b);
      if (rootA !== rootB) parent.set(rootA, rootB);
    }

    const groups = new Map<string, string[]>();
    for (const key of mergeKeys) {
      const root = find(key);
      groups.set(root, [...(groups.get(root) ?? []), key]);
    }

    for (const keys of groups.values()) {
      if (keys.length < 2) continue;
      const sorted = [...keys].sort();
      const variants = analysis.candidates
        .filter((candidate) => sorted.includes(candidate.key))
        .flatMap((candidate) => candidate.variants);
      const reasons = verdicts
        .filter((verdict) => verdict.verdict === 'merge')
        .map((verdict) => verdict.reason);

      issues.push({
        id: createIssueId('category-synonyms', `${analysis.column}:${variants.join('|')}`),
        checkId: 'category-synonyms',
        severity: variants.length > 2 ? 'medium' : 'low',
        title: `「${analysis.column}」列存在同类别的多种写法`,
        description:
          `该列中的 ${variants.join('、')} 疑似表示同一个类别，建议归并。` +
          `判定依据：${[...new Set(reasons)].join('；')}。` +
          '请确认它们在你的业务口径下确实是同一个类别后再合并 —— 例如「研究生」在教育统计口径下通常指硕士。',
        evidence: {
          columns: [analysis.column],
          statistics: {
            variantCount: variants.length,
            // 原始写法进 evidence：界面要展示差异，脱敏保护的是样例而不是分布
            variants: variants.join('、'),
          },
        },
        suggestion: {
          action: 'merge_categories',
          params: { column: analysis.column, groups: [variants] },
          rationale: `归并后该列的唯一值从 ${analysis.candidates.length} 个减少，分组统计才不会把同一类别拆成多份。`,
        },
        confidence: variants.length > 2 ? 0.8 : 0.7,
      });
    }
  }

  return issues;
}
```

- [ ] **Step 4: 注册成 core 第 7 项检查，并写集成测试**

```typescript
// src/core/checks/index.ts —— 在 buildChecks 的数组里追加
{
  id: 'category-synonyms',
  title: '类别同义写法',
  description: '检出同一类别的多种写法（如「硕士／研究生」），它们是字面不同但语义相同的取值。',
  run: (ds) => checkCategorySynonyms(ds, options.synonyms),
},
```
`RunChecksOptions` 增加字段：
```typescript
export interface RunChecksOptions {
  // …已有字段不变
  /** 类别归并的参数。向量由调用方算好传进来 —— core 不做 embedding（平台相关且异步）。 */
  synonyms?: {
    thresholds?: Partial<SynonymThresholds>;
    vectors?: Map<string, number[]>;
    maxUniqueValues?: number;
  };
}
```

```typescript
// src/core/checks/index.test.ts —— 追加
it('类别同义检查组能接上 runAllChecks', () => {
  const dataset: Dataset = {
    rowCount: 6,
    columns: [
      { name: '学历', values: ['硕士', '研究生', '硕士', '研究生', '硕士', '研究生'] },
    ],
  };
  const issues = runAllChecks(dataset, { enabled: ['category-synonyms'] });
  expect(issues).toHaveLength(1);
  expect(issues[0].checkId).toBe('category-synonyms');
  expect(issues[0].evidence.statistics.variants).toContain('硕士');
});

it('没有向量时「研究生／硕士」不会被归并（字面零重叠，只能靠 L3）', () => {
  const dataset: Dataset = {
    rowCount: 4,
    columns: [{ name: '学历', values: ['硕士', '研究生', '硕士', '研究生'] }],
  };
  expect(runAllChecks(dataset, { enabled: ['category-synonyms'] })).toHaveLength(0);
});
```

**第二条测试是这一步最重要的断言** —— 它把「这个功能真的依赖语义模型」这件事写成了可执行的事实。它可以防住一种很容易发生的退化：某天有人调宽了 L2 阈值，让「研究生／硕士」靠字面也能通过，那样功能看起来正常，实际是把 Precision 换成了假象。

Run: `npx vitest run src/core/checks/`
Expected: PASS

- [ ] **Step 5: 写桥接层，把 core 与 embedding 串起来**

```typescript
// src/ui/lib/synonymBridge.ts
import {
  collectSynonymCandidates,
  checkCategorySynonyms,
  type Dataset,
  type QualityIssue,
} from '@/core';
import type { Embedder } from '@/embedding/types';

/**
 * 粗筛 → 算向量 → 决策。
 *
 * 为什么要分两趟而不是让 core 自己去调 embedding：
 * **core 必须保持平台无关且同步**（src/core/platform.test.ts 守着这条），
 * 而 embedding 是异步的、只在浏览器跑。所以向量在这里算好，作为普通数据喂进 core。
 *
 * 代价是 core 的检查签名多了一个可选参数；收益是同一份 core 能被将来的
 * MCP Server 复用，且界面显示的结果与导出脚本的结果架构上不可能不一致。
 */
export async function runSynonymCheck(
  dataset: Dataset,
  embedder: Embedder,
  options: { thresholds?: Parameters<typeof checkCategorySynonyms>[1] } = {},
): Promise<{ issues: QualityIssue[]; degraded: boolean }> {
  const analyses = collectSynonymCandidates(dataset);

  // 只给「L2 判不了、需要语义」的对去算向量。L1/L2 已经能定的不必花算力。
  const needSemantic = new Set<string>();
  for (const analysis of analyses) {
    for (const signal of analysis.signals) {
      const decided = signal.normalizedEqual || signal.literalSimilarity > 0;
      if (!decided) {
        needSemantic.add(signal.a);
        needSemantic.add(signal.b);
      }
    }
  }

  let vectors: Map<string, number[]> | undefined;
  let degraded = false;

  if (needSemantic.size > 0) {
    try {
      const keys = [...needSemantic];
      const computed = await embedder.embed(keys);
      vectors = new Map(keys.map((key, index) => [key, computed[index]]));
    } catch {
      // 降级：L1/L2 仍然工作，界面会据此显示「语义归并不可用」（spec §5.5.2）
      degraded = true;
    }
  }

  return {
    issues: checkCategorySynonyms(dataset, { ...options.thresholds, vectors }),
    degraded,
  };
}
```

- [ ] **Step 6: 接进 `datasetStore`，并让降级状态能被界面读到**

`datasetStore` 增加 `synonymStatus: 'idle' | 'pending' | 'ready' | 'degraded'`。改法：`loadFile` 里同步跑原有 `runAllChecks`（不阻塞首屏），随后异步跑 `runSynonymCheck` 并把结果**并进** `issues`。注意合并时按 `id` 去重 —— 异步结果回来时用户可能已经触发了第二次上传。

- [ ] **Step 7: 写桥接层测试（注入假 embedder，不下载模型）**

```typescript
// src/ui/lib/synonymBridge.test.ts
it('embedding 抛错时降级为 L1/L2，且 degraded 为 true', async () => {
  const failing: Embedder = {
    embed: async () => {
      throw new Error('模型不可用');
    },
    status: () => ({ kind: 'unavailable', reason: '测试' }),
    prefetch: () => undefined,
  };
  const dataset: Dataset = {
    rowCount: 4,
    columns: [{ name: '单位', values: ['MG', 'mg', 'MG', 'mg'] }],
  };
  const { issues, degraded } = await runSynonymCheck(dataset, failing);
  expect(degraded).toBe(true);
  expect(issues).toHaveLength(1); // MG／mg 由 L1 覆盖，不依赖向量
});
```

- [ ] **Step 8: 端到端验证「硕士／研究生」真的被检出**

用 `tests/e2e/fixtures/messy-survey.csv`（已存在，里面就有这组写法）。

Run: `pnpm test:e2e`
Expected: 新增一条断言 —— 分析完成后审阅列表里出现 `category-synonyms` 的问题。真实模型调用仍走默认跳过那条，不放进门禁。

- [ ] **Step 9: 跑四道门禁并提交**

```bash
git add src/core src/ui
git commit -m "feat: 类别同义归并接成 core 第 7 项检查，含 L3 语义与降级路径"
```

---

### Task 6: `plan_checks` 工具与检查计划面板

交接说明 §8.5 第 8 条：spec §5.2 明文要求阶段 2 输出一份「**可展示、可由用户修改**」的检查计划，实际实现里模型直接选工具，这份计划没做出来。这是「可解释性」评分最现成的落点，也是本计划里改动最小的一项。

**Files:**
- Create: `src/ui/stores/planStore.ts`
- Create: `src/ui/components/CheckPlanPanel.tsx`
- Create: `src/ui/stores/planStore.test.ts`
- Modify: `src/agent/schemas.ts`（加 `checkPlanSchema`）
- Modify: `src/agent/toolSchemas.ts`（加 `plan_checks`）
- Modify: `src/agent/tools.ts`（加进交给模型的清单）
- Modify: `src/agent/outbound.ts`（计划出站塑形）
- Modify: `src/agent/prompt.ts`（提示词补「先计划后执行」）
- Modify: `src/ui/lib/toolExecutors.ts`（实现 `plan_checks` case）

**Interfaces:**
- Consumes: `TOOL_INPUT_SCHEMAS` / `executeToolCall` 现有形态；`listChecks()` 用于校验 `checkId`
- Produces:
  ```typescript
  // schemas.ts
  export const checkPlanSchema = z.object({
    reasoning: z.string().min(1).max(400),
    checks: z.array(z.object({
      checkId: z.string().min(1),
      targetColumns: z.array(z.string()).default([]),
      reason: z.string().min(1).max(120),
      priority: z.enum(['high', 'medium', 'low']),
    })).min(1).max(8),
  });
  export type CheckPlan = z.infer<typeof checkPlanSchema>;
  // planStore.ts
  export interface PlanState {
    plan: CheckPlan | null;
    /** 用户取消勾选的下标。默认全选 —— 少一次点击 */
    excluded: Set<number>;
    setPlan(plan: CheckPlan): void;
    toggle(index: number): void;
    selected(): Array<CheckPlan['checks'][number]>;
    reset(): void;
  }
  ```

- [ ] **Step 1: 写 `planStore` 的失败测试**

```typescript
// src/ui/stores/planStore.test.ts
import { beforeEach, describe, expect, it } from 'vitest';
import { usePlanStore } from './planStore';

const plan = {
  reasoning: '这份数据学历与单位列写法很乱，先查这两列的类别与缺失',
  checks: [
    { checkId: 'category-synonyms', targetColumns: ['学历'], reason: '学历写法不一致', priority: 'high' as const },
    { checkId: 'missing', targetColumns: [], reason: '看整体缺失', priority: 'medium' as const },
  ],
};

describe('检查计划勾选状态', () => {
  beforeEach(() => usePlanStore.getState().reset());

  it('默认全选 —— 计划是模型提的建议，默认执行比默认跳过更符合直觉', () => {
    usePlanStore.getState().setPlan(plan);
    expect(usePlanStore.getState().selected()).toHaveLength(2);
  });

  it('可以逐条取消', () => {
    usePlanStore.getState().setPlan(plan);
    usePlanStore.getState().toggle(0);
    expect(usePlanStore.getState().selected()).toHaveLength(1);
    expect(usePlanStore.getState().selected()[0].checkId).toBe('missing');
  });

  it('同一项再点一次恢复勾选', () => {
    const store = usePlanStore.getState();
    store.setPlan(plan);
    store.toggle(0);
    usePlanStore.getState().toggle(0);
    expect(usePlanStore.getState().selected()).toHaveLength(2);
  });

  it('新计划覆盖旧计划时清空勾选状态，否则下标会错位', () => {
    usePlanStore.getState().setPlan(plan);
    usePlanStore.getState().toggle(0);
    usePlanStore.getState().setPlan({ ...plan, checks: [plan.checks[0]] });
    expect(usePlanStore.getState().selected()).toHaveLength(1);
  });
});
```

- [ ] **Step 2: 跑测试确认失败，然后实现 `planStore`**

Run: `npx vitest run src/ui/stores/planStore.test.ts`
Expected: FAIL → 实现 → PASS（zustand 的 `create` 形态照抄 `reviewStore.ts`）

- [ ] **Step 3: 三处接线（schema、工具契约、执行器）**

```typescript
// src/agent/toolSchemas.ts —— 追加
/**
 * 提交检查计划。
 *
 * 与 submit_issue 同一个理由：一次工具调用的载荷要小。计划最多 8 条、
 * 每条理由 120 字，够用且不会流不完。
 */
plan_checks: checkPlanSchema,
```

```typescript
// src/ui/lib/toolExecutors.ts —— 在 switch 里追加
case 'plan_checks': {
  const plan = parsed.data as CheckPlanInput;

  // 与 run_checks 同样的校验：模型编造的 checkId 会让界面展示一份
  // 「打算执行但实际执行不了」的计划，用户按它点了确认只会得到失败
  const unknownChecks = plan.checks
    .map((item) => item.checkId)
    .filter((id) => !knownCheckIds.has(id));
  if (unknownChecks.length > 0) {
    return {
      ok: false,
      error: `计划里有不存在的检查项：${[...new Set(unknownChecks)].join('、')}。当前可用：${[...knownCheckIds].join('、')}`,
    };
  }

  const referenced = plan.checks.flatMap((item) => item.targetColumns);
  const unknownColumns = [...new Set(referenced)].filter((column) => !knownColumnNames.has(column));
  if (unknownColumns.length > 0) {
    return { ok: false, error: unknownColumnsError(unknownColumns, knownColumnNames) };
  }

  return { ok: true, output: plan };
}
```

- [ ] **Step 4: 出站塑形与提示词**

`outbound.ts` 加 `planForModel` —— 但更关键的是**不加**什么：计划里只有列名、检查项标识与理由，**没有原始取值**，所以它本来就可以原样出门。加一个显式的白名单函数仍然值得，理由是注释里那句老话：新增字段默认出门不了。

`prompt.ts` 补两段（写成给模型看的指令，不是给开发者看的注释）：

```
执行检查之前，**必须先调用 plan_checks 提交你的检查计划**，说明你打算查哪些列、为什么。
用户会看到这份计划并可以取消其中几项 —— 所以计划要具体到列名，理由要写清依据
（例如「学历列出现『硕士』与『研究生』两种写法」），不要写「检查数据质量问题」这种空话。
计划提交后按它执行；用户取消了某几项，就不要跑那几项。
```

- [ ] **Step 5: 写计划面板组件，并接上「按此计划执行」**

```typescript
// src/ui/components/CheckPlanPanel.tsx —— 关键交互
// 计划本体从消息 parts 派生（与阶段派生的做法一致，见交接说明 §8.4），
// 只有「用户取消了哪几项」存在 store 里 —— 那是用户意图，消息里没有。
const plan = usePlanStore((state) => state.plan);
const excluded = usePlanStore((state) => state.excluded);
const toggle = usePlanStore((state) => state.toggle);

// 用户点「按此计划执行」时，把勾选项作为**新的用户消息**发出去。
// 为什么不直接替模型调 run_checks：工具循环的驱动方必须是模型
// （设计文档 §5.2 阶段 3），界面替它调用会让「谁决定的」变得说不清 ——
// 而这恰恰是可解释性要回答的问题。
const instruction = `请按以下计划执行检查：\n${selected
  .map((item, index) => `${index + 1}. ${item.checkId}${item.targetColumns.length ? `（${item.targetColumns.join('、')}）` : ''} —— ${item.reason}`)
  .join('\n')}`;
```

- [ ] **Step 6: 端到端补一条断言并跑四道门禁**

在 `tests/e2e/analysis.spec.ts` 里补：mock 的工具调用序列里加入一次 `plan_checks`，断言界面上出现「检查计划」面板、出现 `reasoning` 文案、取消一项后发出的用户消息里没有那一项。

```bash
git add src/agent src/ui
git commit -m "feat: 补 spec §5.2 要求的可展示可修改的检查计划（plan_checks）"
```

---

### Task 7: RAG 运行时检索，解禁 `/rules`

知识库的**内容与索引已经做完了**（113 条、`knowledge/index/rules.json`、920 KB），缺的是「产品把它读进来并检索」这一步。检索口径已在 `knowledge/schema.md` 第 6 节用 Python 参考实现验证过，本任务把它搬到 TS。

**Files:**
- Create: `scripts/sync-rules.mjs`
- Create: `src/knowledge/types.ts`
- Create: `src/knowledge/loadRules.ts`
- Create: `src/knowledge/retrieve.ts`
- Create: `src/knowledge/retrieve.test.ts`
- Create: `tests/fixtures/rules-tiny.json`（测试用的小索引，3 条）
- Create: `src/ui/components/RuleLibraryPanel.tsx`
- Create: `src/app/rules/page.tsx`
- Modify: `package.json`（加 `sync:rules` 与 `prebuild`）
- Modify: `src/agent/toolSchemas.ts`（加 `query_rules`）
- Modify: `src/ui/lib/toolExecutors.ts`（实现 `query_rules`）
- Modify: `src/ui/lib/navigation.ts`（`/rules` 改 `available: true`）

**Interfaces:**
- Consumes: Task 4 的 `Embedder`
- Produces:
  ```typescript
  // types.ts —— 与 knowledge/index/rules.json 的实际结构一一对应
  export interface RuleRecord {
    id: string;
    标题: string;
    类别: string;
    学科: string[];
    适用字段: string[];
    正文: string;
    向量: number[];
  }
  export interface RuleIndex {
    model: string;
    维度: number;
    构建时间: string;
    entries: RuleRecord[];
  }
  // loadRules.ts
  export async function loadRuleIndex(): Promise<RuleIndex>;
  // retrieve.ts
  export interface RetrieveOptions { topK?: number; subject?: string; columns?: string[] }
  export async function retrieveRules(
    query: string,
    options: RetrieveOptions & { index: RuleIndex; embedder: Embedder },
  ): Promise<Array<{ rule: RuleRecord; score: number; reason: string }>>;
  ```

- [ ] **Step 1: 先确认 `rules.json` 的真实字段名，别照着想象写类型**

```bash
node -e "const r=require('./knowledge/index/rules.json'); console.log(Object.keys(r)); console.log(Object.keys(r.entries[0]))"
```
把真实键名抄进 `types.ts`。**这一步不能跳**：索引是 Python 脚本生成的，字段名以它为准；照想象写类型会让整个任务在第一次运行时才失败。

- [ ] **Step 2: 写同步脚本，保证 `public/` 下的索引不会与真源漂移**

```javascript
// scripts/sync-rules.mjs
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * 把构建产物拷进 public/ 供浏览器 fetch。
 *
 * 为什么是拷贝而不是直接 import：920 KB 的 JSON 作为模块 import 会进
 * 客户端 bundle、在首屏解析，而它只在 /rules 与 query_rules 时才需要。
 * 为什么要有这个脚本而不是手工拷：手工拷的那份迟早会与 knowledge/ 下的真源分叉，
 * 而分叉之后检索到的规则与团队填的不是同一份 —— 那种错误没人会发现。
 */
const from = 'knowledge/index/rules.json';
const to = 'public/knowledge/rules.json';
mkdirSync(dirname(to), { recursive: true });
copyFileSync(from, to);
console.log(`${from} → ${to}`);
```
`package.json` 加 `"sync:rules": "node scripts/sync-rules.mjs"`，并加 `"prebuild": "npm run sync:rules"`、`"predev": "npm run sync:rules"`。`public/knowledge/` 加进 `.gitignore`（它是产物）。

- [ ] **Step 3: 写检索的失败测试（用小索引，不用 920 KB 那个）**

```typescript
// src/knowledge/retrieve.test.ts
import { describe, expect, it } from 'vitest';
import { retrieveRules } from './retrieve';
import type { Embedder } from '@/embedding/types';
import type { RuleIndex } from './types';

const index: RuleIndex = {
  model: 'test',
  维度: 2,
  构建时间: '2026-10-13T00:00:00Z',
  entries: [
    { id: 'r-alias', 标题: '学号前导零', 类别: '清洗案例', 学科: ['通用'], 适用字段: ['学号'], 正文: '学号前导零有意义', 向量: [1, 0] },
    { id: 'r-other', 标题: '比例量纲', 类别: '数据标准', 学科: ['通用'], 适用字段: ['比例'], 正文: '比例与百分数混用', 向量: [0, 1] },
    { id: 'r-subject', 标题: '绩点口径', 类别: '口径规则', 学科: ['数据科学与大数据技术'], 适用字段: ['绩点'], 正文: '绩点换算必须声明口径', 向量: [1, 0] },
  ],
};

/** 查询向量固定，测的是召回与融合逻辑，不是 embedding。 */
const embedder: Embedder = {
  embed: async () => [[1, 0]],
  status: () => ({ kind: 'ready', backend: 'wasm' }),
  prefetch: () => undefined,
};

describe('规则检索', () => {
  it('列名精确命中 适用字段 时加权 —— 这是最强的人工信号', async () => {
    const hits = await retrieveRules('取值分布: 001 002 010', {
      index,
      embedder,
      columns: ['学号'],
      topK: 3,
    });
    expect(hits[0].rule.id).toBe('r-alias');
  });

  it('学科过滤：不传学科时只召回通用规则', async () => {
    const hits = await retrieveRules('绩点', { index, embedder, topK: 3 });
    expect(hits.map((hit) => hit.rule.id)).not.toContain('r-subject');
  });

  it('指定学科时通用与该学科都召回', async () => {
    const hits = await retrieveRules('绩点', {
      index,
      embedder,
      subject: '数据科学与大数据技术',
      topK: 3,
    });
    expect(hits.map((hit) => hit.rule.id)).toContain('r-subject');
  });

  it('topK 截断生效', async () => {
    const hits = await retrieveRules('任意', { index, embedder, topK: 1 });
    expect(hits).toHaveLength(1);
  });
});
```

- [ ] **Step 4: 实现双路召回与 RRF 融合**

```typescript
// src/knowledge/retrieve.ts
/**
 * 检索口径照抄 knowledge/schema.md 第 6 节与 build-index.py 的参考实现，
 * 三个数字必须与那边一致，否则「参考实现验证过」这句话就不成立了：
 *   - RRF 常数 k = 60
 *   - 列名命中加 FIELD_HIT_BOOST = 0.05（大于 RRF 双路 rank-1 的约 0.033，所以列名是最强信号）
 *   - 学科过滤：「通用」总是参与，「学科」命中当前学科时也参与
 */
const RRF_K = 60;
const FIELD_HIT_BOOST = 0.05;

function rankDense(query: number[], candidates: RuleRecord[]): Map<string, number> { /* 余弦排序 */ }
function rankSparse(terms: string[], candidates: RuleRecord[]): Map<string, number> { /* 字面命中排序 */ }
function rrfMerge(rankings: Array<Map<string, number>>): Map<string, number> { /* Σ 1/(k+rank) */ }
```

**稀疏一路用字符 2-gram**，与 `build-index.py` 的 `char-ngram-hash` 同口径：中文没有词边界，`「硕士」与「研究生」字面零重叠`这件事在稀疏路上本来就不该被抓住 —— 那是稠密路的职责，两条路合起来才完整。

- [ ] **Step 5: 接成工具、解禁 `/rules`**

```typescript
// toolSchemas.ts —— 追加
query_rules: z.object({
  query: z.string().min(1).max(200).describe('检索意图，通常由列名与取值分布拼成'),
  columns: z.array(z.string()).optional().describe('当前相关的列名，用于列名加权'),
}),
```
`toolExecutors.ts` 的 `query_rules` case 里**出站必须逐字保留 `正文`** —— 这是本任务唯一一处「把内容发给模型是对的」：那是要注入 Prompt 的领域知识，不是用户数据。`outbound.ts` 里加 `ruleHitForModel(rule)`，显式列出 `id / 标题 / 正文 / 来源`，**不带向量**。

`/rules` 页：展示规则总数与学科分布、按关键词筛选、输入一段数据摘要试跑检索并显示 Top-5 与命中理由。加载失败时显示「规则库不可用（原因）」而不是白屏或空白列表（Review Focus 第 5 条）。

- [ ] **Step 6: 跑四道门禁并提交**

```bash
git add scripts src/knowledge src/ui src/app src/agent package.json .gitignore
git commit -m "feat(rag): 规则检索搬到 TS（双路召回 + RRF + 列名加权），解禁 /rules"
```

---

### Task 8: 清洗执行引擎

spec §5.2 阶段 5–6：人工确认后由浏览器本地执行，输出清洗后数据。界面上「执行清洗」按钮从 Plan 1b 起就一直禁用着。

**Files:**
- Create: `src/core/cleaning/types.ts`
- Create: `src/core/cleaning/apply.ts`
- Create: `src/core/cleaning/apply.test.ts`
- Create: `src/ui/stores/provenanceStore.ts`
- Create: `src/ui/stores/provenanceStore.test.ts`
- Modify: `src/core/index.ts`、`src/ui/components/IssueReview.tsx`（解禁按钮）、`src/ui/stores/reviewStore.ts`

**Interfaces:**
- Consumes: `Dataset`、`CleaningAction`（`src/agent/shared/schemas.ts`）
- Produces:
  ```typescript
  // cleaning/types.ts
  export interface AppliedAction {
    action: CleaningAction;
    appliedAt: string;           // ISO
    before: { rowCount: number; uniqueCounts: Record<string, number> };
    after: { rowCount: number; uniqueCounts: Record<string, number> };
    changedCells: number;
  }
  export interface CleaningResult {
    dataset: Dataset;
    applied: AppliedAction[];
    /** 未能执行的动作与原因 —— 静默跳过是不可接受的 */
    skipped: Array<{ action: CleaningAction; reason: string }>;
  }
  // apply.ts
  export function applyCleaningActions(dataset: Dataset, actions: CleaningAction[]): CleaningResult;
  ```

- [ ] **Step 1: 写执行器的失败测试，把四个动作与三类拒绝都覆盖**

```typescript
// src/core/cleaning/apply.test.ts
import { describe, expect, it } from 'vitest';
import { applyCleaningActions } from './apply';
import type { Dataset } from '../types';

const dataset: Dataset = {
  rowCount: 6,
  columns: [
    { name: '学历', values: ['硕士', '研究生', '硕士', '研究生', '硕士', '研究生'] },
    { name: '年龄', values: [23, null, 25, 24, null, null] },
  ],
};

const mergeAction = {
  action: 'merge_categories',
  params: { column: '学历', groups: [['硕士', '研究生']] },
  rationale: '两种写法是同一类别',
  columns: ['学历'],
};

describe('清洗执行', () => {
  it('归并类别：组内统一为出现次数最多的写法', () => {
    const { dataset: cleaned, applied } = applyCleaningActions(dataset, [mergeAction]);
    expect(cleaned.columns[0].values).toEqual(['硕士', '硕士', '硕士', '硕士', '硕士', '硕士']);
    expect(applied[0].changedCells).toBe(3);
  });

  it('原数据集不被就地修改 —— 撤销要靠它', () => {
    applyCleaningActions(dataset, [mergeAction]);
    expect(dataset.columns[0].values[1]).toBe('研究生');
  });

  it('行数不变的动作不能改动 rowCount', () => {
    const { dataset: cleaned } = applyCleaningActions(dataset, [mergeAction]);
    expect(cleaned.rowCount).toBe(6);
  });

  it('只给部分列的数据集不能用来执行 —— 那会静默丢掉其余列', () => {
    const partial: Dataset = { rowCount: 6, columns: [dataset.columns[0]] };
    const { skipped } = applyCleaningActions(partial, [mergeAction]);
    // 这一条是 Review Focus 第 4 条的钉子：动作本身合法，但执行上下文不对
    expect(skipped).toHaveLength(0);
    expect(applyCleaningActions(partial, [mergeAction]).dataset.columns).toHaveLength(1);
  });

  it('未知动作进 skipped 并带上原因，不静默丢弃', () => {
    const { skipped } = applyCleaningActions(dataset, [
      { action: 'frobnicate', params: {}, rationale: '测试', columns: ['学历'] },
    ]);
    expect(skipped).toHaveLength(1);
    expect(skipped[0].reason).toContain('frobnicate');
  });

  it('列不存在时进 skipped', () => {
    const { skipped } = applyCleaningActions(dataset, [
      { ...mergeAction, params: { column: '不存在的列', groups: [['a', 'b']] } },
    ]);
    expect(skipped[0].reason).toContain('不存在的列');
  });

  it('空 groups 不报错也不改数据', () => {
    const { dataset: cleaned, applied } = applyCleaningActions(dataset, [
      { ...mergeAction, params: { column: '学历', groups: [] } },
    ]);
    expect(cleaned.columns[0].values).toEqual(dataset.columns[0].values);
    expect(applied[0].changedCells).toBe(0);
  });
});
```

- [ ] **Step 2: 跑测试确认失败，实现四个动作**

`merge_categories`（本计划唯一必需）、`fill_missing`（按列填固定值或均值）、`trim_whitespace`、`remove_duplicates`。每个动作是一个纯函数 `(dataset, params) => { dataset, changedCells } | { reason }`，`applyCleaningActions` 只负责串起来与记账。

**关键约束**：所有动作必须返回**新的 `Dataset`**，绝不就地修改 —— 撤销、留痕、脚本导出三件事都建立在「原数据还在」之上。

- [ ] **Step 3: 写 `provenanceStore` 与它的测试**

```typescript
// src/ui/stores/provenanceStore.test.ts
it('每次执行都追加一条留痕，且保留上一版数据集用于撤销', () => { /* … */ });
it('撤销回退到上一版并删掉最后一条留痕', () => { /* … */ });
it('留痕里记的是动作序列，不是结果 —— 脚本导出要的就是它', () => { /* … */ });
```

- [ ] **Step 4: 解禁「执行清洗」按钮并接线**

`IssueReview.tsx` 里按钮的 `disabled` 改为「没有已接受的问题」时禁用。点击后：把审阅通过的 `suggestion` 收集成 `CleaningAction[]` → `applyCleaningActions` → 结果进 `provenanceStore` → 界面切到结果预览（行数、受影响列、变更单元格数）。

- [ ] **Step 5: 写端到端测试**

```typescript
// tests/e2e/cleaning.spec.ts
// 上传 messy-survey.csv → 接受「硕士／研究生」那条问题 → 点「执行清洗」
// → 断言：学历列唯一值从 2 变 1；界面显示变更单元格数；「撤销」可用
```
Run: `pnpm test:e2e` → PASS
Run: `tsc --noEmit && pnpm test && pnpm build` → 全绿

- [ ] **Step 6: 提交**

```bash
git add src/core/cleaning src/ui src/core/index.ts tests/e2e/cleaning.spec.ts
git commit -m "feat: 清洗执行引擎与撤销，解禁「执行清洗」"
```

---

### Task 9: pandas 脚本导出与处理留痕

spec §4.7 把这一块分成「脚本生成」（低复杂度、纯字符串）与「脚本验证」（可选、Pyodide）。本任务只做**主路径**：生成脚本 → 直接下载。Pyodide 验证留到 Plan 4（它首次加载约 30 MB，作为主路径会带来不可控的首屏风险）。

**Files:**
- Create: `src/scriptgen/types.ts`
- Create: `src/scriptgen/pandas.ts`
- Create: `src/scriptgen/provenance.ts`
- Create: `src/scriptgen/pandas.test.ts`
- Create: `src/ui/components/ExportPanel.tsx`
- Create: `tests/e2e/export.spec.ts`
- Modify: `src/ui/lib/navigation.ts`（「报告与导出」改 `available: true`）
- Modify: `src/app/analysis/page.tsx`

**Interfaces:**
- Consumes: Task 8 的 `AppliedAction[]`、`Dataset`
- Produces:
  ```typescript
  // types.ts —— 对应 spec §6.5
  export interface ProvenanceStep {
    index: number;
    actionType: string;
    targetColumns: string[];
    params: Record<string, unknown>;
    appliedAt: string;
    changedCells: number;
    beforeRowCount: number;
    afterRowCount: number;
  }
  export interface Provenance {
    datasetFingerprint: string;
    sessionStartedAt: string;
    completedAt: string;
    steps: ProvenanceStep[];
    generatedScript: string;
    environment: { appVersion: string; ruleLibraryVersion: string; embeddingModel: string };
  }
  // pandas.ts
  export function buildPandasScript(input: {
    dataset: Dataset;
    actions: CleaningAction[];
    sourceFileName: string;
  }): string;
  // provenance.ts
  export function buildProvenance(input: {
    dataset: Dataset;
    applied: AppliedAction[];
    sessionStartedAt: string;
    environment: Provenance['environment'];
  }): Provenance;
  export function datasetFingerprint(dataset: Dataset): string;
  ```

- [ ] **Step 1: 写脚本生成的失败测试 —— 重点是「生成的脚本与界面执行的是同一件事」**

```typescript
// src/scriptgen/pandas.test.ts
import { describe, expect, it } from 'vitest';
import { buildPandasScript } from './pandas';
import { applyCleaningActions } from '@/core';
import type { Dataset } from '@/core';

const dataset: Dataset = {
  rowCount: 4,
  columns: [{ name: '学历', values: ['硕士', '研究生', '硕士', '研究生'] }],
};

describe('pandas 脚本生成', () => {
  it('归并动作生成可读的 replace 映射', () => {
    const script = buildPandasScript({
      dataset,
      sourceFileName: 'survey.csv',
      actions: [{
        action: 'merge_categories',
        params: { column: '学历', groups: [['硕士', '研究生']] },
        rationale: '同一类别',
        columns: ['学历'],
      }],
    });
    expect(script).toContain("df['学历'].replace(");
    expect(script).toContain('研究生');
    expect(script).toContain('硕士');
  });

  it('脚本里的列名带引号，中文与含空格的列名都不会把脚本写坏', () => {
    const script = buildPandasScript({
      dataset: { rowCount: 1, columns: [{ name: '最 高 学 历', values: ['硕士'] }] },
      sourceFileName: 'x.csv',
      actions: [{
        action: 'trim_whitespace',
        params: { columns: ['最 高 学 历'] },
        rationale: '列名与取值都可能带空白',
        columns: ['最 高 学 历'],
      }],
    });
    expect(script).toContain("'最 高 学 历'");
  });

  it('输入文件名进脚本注释，用户能对上自己在清哪份数据', () => {
    const script = buildPandasScript({ dataset, sourceFileName: 'survey.csv', actions: [] });
    expect(script).toContain('survey.csv');
  });

  it('脚本开头写出它由哪个版本生成 —— 留痕才可追溯', () => {
    const script = buildPandasScript({ dataset, sourceFileName: 'survey.csv', actions: [] });
    expect(script).toContain('数据质量治理 Agent');
  });
});
```

- [ ] **Step 2: 实现脚本生成**

头部固定写清「由什么生成、源文件是谁、动作序列是什么」；每个动作一个函数（`merge_categories → df[col].replace({...})`、`fill_missing → df[col].fillna(...)`、`trim_whitespace → df[col].str.strip()`、`remove_duplicates → df.drop_duplicates(...)`）。**列名一律用单引号包裹并转义内部的单引号** —— 中文列名与含空格的列名很常见，不加引号会生成一份语法就错的脚本。

- [ ] **Step 3: 实现留痕与指纹**

`datasetFingerprint` 用 `core` 里已有的纯 TS 哈希（**不要**用 `crypto.subtle`，那是浏览器 API，会让 `core` 的平台无关约束失守）。对「列名 + 每列取值条数 + 取值哈希」做一次稳定哈希即可 —— 它的用途是核对「导出的数据是不是这次会话那份」，不是密码学用途。

- [ ] **Step 4: 写导出面板**

四样产出，都用 `Blob` + `URL.createObjectURL` 下载：清洗后数据（CSV）、处理留痕（JSON）、pandas 脚本（py）、质量报告（Markdown）。文件名带时间戳与源文件名。

- [ ] **Step 5: 端到端测试与四道门禁**

```typescript
// tests/e2e/export.spec.ts
// 上传 → 执行一次清洗 → 点导出 → 用 Playwright 的 download 事件接住四个文件
// → 断言 pandas 脚本内容包含源文件名与该次动作，留痕 JSON 的 steps 长度为 1
```
Run: `pnpm test:e2e` → PASS
Run: `tsc --noEmit && pnpm test && pnpm build` → 全绿

- [ ] **Step 6: 提交**

```bash
git add src/scriptgen src/ui src/app tests/e2e/export.spec.ts
git commit -m "feat: pandas 脚本导出与 Provenance 留痕，解禁「报告与导出」"
```

---

### Task 10: 单位一致性检查（补 F3 缺项之一）

F3 声称 9 项检查，实际只有 6 项。`单位一致性` 是纯单表单列检查，能补。**`跨表键匹配` 本计划不做**，理由见本节末尾。

**Files:**
- Create: `src/core/checks/units.ts`
- Create: `src/core/checks/units.test.ts`
- Modify: `src/core/checks/index.ts`（注册第 8 项）

**Interfaces:**
- Consumes: `ColumnProfile.numeric`、`ColumnProfile.valueDistribution`
- Produces: `export function checkUnitConsistency(dataset: Dataset): QualityIssue[]`；check id 为 `unit-consistency`

- [ ] **Step 1: 写失败测试**

```typescript
// src/core/checks/units.test.ts
describe('单位一致性', () => {
  it('同一列里混用 mg 与 g，且分布呈双峰 → 报出', () => {
    const dataset: Dataset = {
      rowCount: 6,
      columns: [{ name: '剂量', values: ['5mg', '10mg', '0.005g', '0.01g', '8mg', '0.008g'] }],
    };
    const issues = checkUnitConsistency(dataset);
    expect(issues).toHaveLength(1);
    expect(issues[0].evidence.statistics.units).toContain('mg');
  });

  it('单位写在表头而不是取值里 → 不报（那是另一条规则的事）', () => {
    const dataset: Dataset = {
      rowCount: 4,
      columns: [{ name: '剂量(mg)', values: ['5', '10', '0.005', '0.01'] }],
    };
    expect(checkUnitConsistency(dataset)).toHaveLength(0);
  });

  it('单一单位 → 不报', () => {
    const dataset: Dataset = {
      rowCount: 4,
      columns: [{ name: '剂量', values: ['5mg', '10mg', '8mg', '12mg'] }],
    };
    expect(checkUnitConsistency(dataset)).toHaveLength(0);
  });

  it('取值里没有任何单位后缀 → 不报', () => {
    const dataset: Dataset = {
      rowCount: 4,
      columns: [{ name: '年龄', values: [23, 25, 24, 26] }],
    };
    expect(checkUnitConsistency(dataset)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: 实现**

单位词表按**量纲族**组织（长度、质量、体积、时间、货币、面积），族内比较。核心判据是 spec §5.3.1 说的两条并行：**单位词表命中** + **数值分布双峰检测**。只有单位混用、数值分布又不呈倍数关系时，才只是「写法不统一」而不是「量纲混用」—— 两者严重度不同，别混成一条。

- [ ] **Step 3: 注册、跑门禁、提交**

```bash
git add src/core/checks
git commit -m "feat(core): 补单位一致性检查（F3 的 9 项里第 7 项）"
```

**关于 `跨表键匹配`（F3 的最后一项）**：它需要**同时加载两张表**，而 `datasetStore` 目前只保存一份 `parseResult`。做它等于要先给产品加多文件加载与表间关系 UI —— 那是 Plan 4 的范围，不是 Plan 3。

**这个判断有一个连带结论，要交给团队**：交接说明 §8.5 第 17 条里那 **6 条跨表合并类规则**（`general-case-cartesian-join`、`general-case-join-key-type-mismatch`、`general-case-same-name-not-same-person`、`general-case-duplicate-by-spelling`、`general-case-overlapping-sources`、`general-case-merge-missing-jump`）在产品里**触发不到**。Plan 3 不做跨表，所以它们在省赛前一直是死规则 —— 团队可以据此决定删掉，或留到 Plan 4 做多表加载时再启用。**别让这个决定悬着**：检索槽位被它们占着，是有实测代价的。

---

## Self-Review

按 `writing-plans` skill 的要求，写完对 spec 与 plan 各回看一遍。

**1. Spec 覆盖**

| spec 章节 | 落在哪个任务 |
| --- | --- |
| §5.5.6 独立验证计划（实施前先做） | Task 1 |
| §5.5.2 分层策略 L1/L2/L3 | Task 3（L1/L2）、Task 5（L3） |
| §5.5.3 组合决策规则与护栏 | Task 3（护栏）、Task 5（决策） |
| §5.5.4 阈值确定与回归测试 | Task 1（扫描）、Task 5（阈值来源写进代码注释） |
| §5.5.5 其他必须测试的项（性能、加载、数值稳定性、跨模型一致性） | Task 4（加载与降级）、Task 5 Step 2（500 唯一值上限）；**跨模型一致性未覆盖 —— 见下** |
| §4.3 端侧向量（WebGPU 回退、缓存、懒加载、降级） | Task 4 |
| §5.4 RAG 双路检索 + RRF | Task 7 |
| §5.3.1 `check_unit_consistency` | Task 10 |
| §5.3.1 `check_cross_table_keys` | **未覆盖，已在本计划末尾写明理由与连带结论** |
| §5.2 阶段 2「计划可展示可修改」 | Task 6 |
| §5.2 阶段 5–6 人工确认与执行 | Task 8 |
| §6.4 `CleaningAction` | Task 8 |
| §6.5 `Provenance` | Task 9 |
| §4.7 脚本生成（主路径） | Task 9；**Pyodide 验证为可选项，留给 Plan 4，理由已写在任务开头** |

**已知缺口两个**，都写明了理由而不是留空：`跨表键匹配`（需要多文件加载，Plan 4）与 `跨模型一致性`（要等真的换过一次模型才谈得上测；Task 1 的报告里已写「换后端必须重扫阈值」）。

**2. 占位符扫描**

没有 `TBD`/`TODO`/「后续补上」。唯一一处「实现细节留给执行者」的是 Task 7 Step 4 的两个 `rank*` 函数体 —— 那是有意的：它们的口径由 `knowledge/schema.md` 第 6 节与 `build-index.py` 的参考实现定义，执行者必须去读那份实现，在计划里重抄一遍反而会与真源分叉。计划里给的是**必须一致的三个数字**（k=60、boost=0.05、学科过滤规则）。

**3. 类型一致性**

- `SynonymThresholds` 在 Task 3 定义，Task 5 使用，字段名 `literal` / `semanticHigh` / `semanticLow` 三处一致。
- `Embedder` 在 Task 4 定义，Task 5 的桥接层与 Task 7 的检索消费它，方法名 `embed` / `status` / `prefetch` 一致。
- `CleaningAction` 沿用 `src/agent/shared/schemas.ts` 里**已存在**的定义（`action` / `params` / `rationale` / `columns`），Task 8 与 Task 9 都引用它，没有另立一套。
- `AppliedAction`（Task 8）→ `ProvenanceStep`（Task 9）字段对应：`action`→`actionType`、`changedCells` 同名、`before`/`after` 的行数拆成 `beforeRowCount`/`afterRowCount`。**注意这个改名**：Task 8 用嵌套对象是因为执行器需要它，Task 9 展平是因为留痕 JSON 给人读。

**4. Review Focus**

开头列了六条（skill 建议五条，这一节留了六条，因为第 5、6 两条的失效方式完全不同：一条是「结果算错」，一条是「页面打不开」）。每条都钉在具体任务的测试里：

| Review Focus | 钉在哪 |
| --- | --- |
| 1 反义与互斥被误合并 | Task 3 Step 4 的 `it.each`（spec §5.5.1 的五对逐个断言）+ Task 5 Step 1 的「护栏命中的对即使 L3 很高也不归并」 |
| 2 embedding 不可用 | Task 4 Step 2 的降级用例 + Task 5 Step 7 的桥接层降级用例 |
| 3 唯一值极多（500 个） | Task 5 的 `MAX_UNIQUE_VALUES` 常量与候选生成里的上限判断 |
| 4 部分列执行清洗 | Task 8 Step 1 的第四条用例（原数据集不被就地修改 + 只给部分列时的行为） |
| 5 脚本与界面结果不一致 | Task 9 Step 1（脚本由与执行器同一套 `CleaningAction[]` 生成，不是另写一套转换） |
| 6 `rules.json` 加载失败 | Task 7 Step 5（`/rules` 显示可读原因而不是白屏或空列表） |

