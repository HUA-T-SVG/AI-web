# 评测数据集

> 给 Plan 4（`docs/superpowers/plans/2026-10-16-plan4-evaluation-and-polish.md`）用。
> 设计文档 §5.9.2 规定的方法是**注入已知缺陷**：从干净数据出发，按清单注入已知质量问题、
> 记录标准答案，再评系统能否全部检出且不误报。

## 怎么来的

```
base-clean.csv   ← 干净底表（1000 行 × 8 列），由 injector.mjs --make-base 生成
      │
      │  按 defects.json 注入
      ↓
messy-eval.csv   ← 脏数据（1002 行 × 9 列）
answers.json     ← 标准答案（15 条）
```

**唯一产出者是 `injector.mjs`。** 不要手改这两个产物 —— 手改之后它们与
`defects.json` 就分叉了，而分叉不会报错，只会让指标悄悄失去意义。

```bash
node knowledge/eval/dataset/injector.mjs --make-base   # 只在要改底表时跑
node knowledge/eval/dataset/injector.mjs --write       # 注入 → 两个产物
node knowledge/eval/dataset/injector.mjs --verify      # 核对答案与数据一致
node knowledge/eval/dataset/injector.mjs --self-test   # 确定性、形状、篡改检测、两类拒绝
```

改完数据集要跑：`injector.mjs --self-test` + `pnpm test`（后者含
`src/core/evaluate/dataset.test.ts`，它做语义验证）。

## 谁保证什么

| 事项 | 谁保证 | 为什么不能换个地方 |
| --- | --- | --- |
| 产物形状、确定性、答案与数据一致 | `injector.mjs --self-test` / `--verify` | 这些不需要跑 TS 实现 |
| **底表真的干净** | `src/core/evaluate/dataset.test.ts` | 要调 `runAllChecks`，而它是 TS —— Node 跑不了 `src/core`（无扩展名的目录导入）。硬要为脚本造一条路，就会有人去「抄一份 core」，而**标准答案与实现同源正是评测最该避免的自欺** |
| **注入的缺陷真的会被检出** | 同上（同时是检出率基线） | 同上 |

## 缺陷清单与预期

| # | kind（＝core 的 checkId） | 处数 | 作用域 | 计分 | 预期 |
| --- | --- | --- | --- | --- | --- |
| 1 | `missing`（备注，10%） | 1 | 列级 | ❌ 对照 | **不报** —— 低于 0.2 阈值 |
| 2 | `missing`（组别，15%） | 1 | 列级 | ❌ 对照 | **不报** —— 低于 0.2 阈值 |
| 3 | `missing`（身高，201 行 = 20.06%） | 1 | 列级 | ✅ | 报 medium |
| 4 | `outliers`（身高 999 / 1） | 2 | 行级 | ✅ | 报 2 行 |
| 5 | `type-consistency`（剂量混入文本） | 3 | 列级 | ✅ | 报「剂量」列 |
| 6 | `unit-consistency`（剂量混 mg/g） | 4 | 列级 | ✅ | 报「剂量」列 |
| 7 | `outliers`（年龄 999 / -1） | 2 | 行级 | ✅ | 报 2 行 |
| 8 | `range-rules`（同上两点，需传年龄 0–120 规则） | 2 | 行级 | ✅ | 报 2 行 |
| 9 | `category-synonyms`（学历的 3 种写法） | 1 | 列级 | ✅ | 报「学历」列 |
| 10 | `duplicates`（复制第 400/500 行） | 2 | 行级 | ✅ | 报重复组 |
| 11 | `duplicate-column-names` | 1 | 整表级 | ✅ | 报「学号」重复 |

**`scored: false` 的两条是对照**：正确答案就是「不报」。它们守的是**误报率** ——
若实现把 10% 的缺失也报出来，那两条会被算成误报。

## 评比时必须知道的三件事

**1. 答案的作用域跟着检查的作用域走。** `missing` / `type-consistency` /
`unit-consistency` / `category-synonyms` 是**列级**问题（core 一条问题覆盖整列、
证据里不给 `rowIndices`），所以它们的答案只记列名；`outliers` / `range-rules` /
`duplicates` 是**行级**，逐个记行号。这一点踩过一次：按单元格给列级检查记答案，
200 行缺失会变成 200 条永远匹配不上的答案，测出来「200 处漏报」——漏的是评分口径。

**2. `range-rules` 必须传入领域规则**（年龄 0–120）。不传时它拿到空规则表直接跳过，
那样「值域越界」永远算漏报，而原因根本不在实现里。

**3. 一处数据可能被两项检查各报一次。** 年龄的 999 同时命中 `outliers` 与
`range-rules`（答案里也是两条，从两个角度记）。**评分时不能算成两次独立命中**，
否则召回会虚高。

## 本轮**不**评的东西（写明，而不是放进评测集让它永远算漏报）

| 不评 | 原因 |
| --- | --- |
| 跨表键匹配 | 产品只处理单数据集，不做连接（spec §12 的 Plan 3 明确不做） |
| 多表加载与合并 | 同上 |
| 语义归并的 L3（embedding） | 评测集里**不注入需要语义才能发现的缺陷**：那会让指标依赖端侧模型是否下载成功，而单测不该碰网络。L2 的阈值另有 `synonym-labels.json`（34 字段 / 242 正例 / 911 负例）与 `literal-scan.test.ts` |
| `missing` 的缺失机制判断（MCAR/MAR/MNAR） | 那是 LLM 承担的语义判断，属于 Agent 层（Task 5），不是确定性检查 |

## 底表的列设计（为什么它能「干净」）

| 列 | 取值域 | 为的是不触发哪一项 |
| --- | --- | --- |
| 学号 | 6 位定长数字串 | 全唯一 → `duplicates` 不报；纯数字 → 不触发类型检查 |
| 年龄 | 20–30 | 分布正常，IQR 边界外无值 |
| 性别 / 学历 / 组别 | 各 2–4 个高频值 | 低基数 → 是分类列；取值两两足够不像 → `category-synonyms` 不报 |
| 身高 | 155–185 | 同上（数值列） |
| 剂量 | 40–100（**不带单位**） | 单位写在表头里 → `unit-consistency` 不报 |
| 备注 | 4 个高频值 | 低基数，不触发「全唯一文本列」的判定 |

这些性质由 `dataset.test.ts` 的第一条测试守着（底表跑全量检查一条问题都不报）。
**改底表的生成规则之后一定要跑它** —— 底表一旦不干净，评测的「误报」里就会混进
我们自己的数据问题。
