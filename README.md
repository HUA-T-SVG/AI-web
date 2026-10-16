# 科研数据质量治理 Agent

> 全国高校AI Web开发挑战赛 · AI Native Web 前端应用
>
> **把"数据清洗"这件没法写进论文方法学的事，变成一份可复现、可追溯、可引用的处理记录。**

## 这个项目解决什么问题

高校实证研究（问卷、实验、多来源数据合并）中，数据清洗普遍卡在三个地方：

| 问题 | 表现 |
| --- | --- |
| 过程不可复现 | 靠手搓 Excel，几个月后自己都说不清做过哪些处理；论文方法学只能写"数据经清洗后……" |
| 审稿人无法核验 | 期刊要求提供数据处理代码，手工处理的课题组交不出来 |
| 数据不敢上云 | 涉及被试身份、健康、心理等信息，伦理审查不允许上传第三方平台 |

现有工具要么是通用清洗工具、不懂学科语境，要么要求数据上传云端。**没有一个同时解决"可复现"和"不出本地"。**

## 三根支柱

1. **数据不出浏览器** —— 原始数据全程本地计算，只有聚合后的「结构摘要」参与 AI 推理
2. **可复现** —— 导出的 pandas 脚本是真跑过的，处理过程有完整留痕
3. **领域感知的判断** —— 不是通用缺失率，而是"第 7 题有 3 个被试选了不存在的选项"

## 当前状态

**开发中**。五条主线全部可用：导入 → 本地解析 → 质量检查 → AI 分析（含检查计划、规则检索）→ 清洗执行 → 报告与导出，可在浏览器里直接使用。

| 已完成 | 说明 |
| --- | --- |
| `src/core/` | 平台无关的检查引擎：9 项检查（含类别同义归并、单位一致性）、列画像、统计原语、清洗执行与撤销 |
| `src/parser/` | CSV（UTF-8/GBK/UTF-16 自动识别）与 .xlsx 解析，运行在 Web Worker，不可用时降级主线程 |
| `src/embedding/` | 端侧 `bge-small-zh-v1.5`（WebGPU → WASM 回退、缓存、不可用时明示降级） |
| `src/agent/` | Agent 工作流：检查计划、问题逐条提交与审阅、`/api/agent` 代理（`shared/` 与 `server/` 已分层） |
| `src/knowledge/` | 领域规则库运行时检索：双路召回 + RRF 融合 + 列名/学科加权，`/rules` 页可当场试跑 |
| `src/scriptgen/` | 清洗后 CSV、处理留痕 JSON、等价的 pandas 脚本（与界面同源） |
| `src/ui/` | 状态机、拖拽上传、虚拟滚动表格、列画像侧栏、问题审阅、检查计划面板 |
| 测试 | 577 个单元测试（Vitest）+ 54 个端到端测试（Playwright，其中 1 条真实调用默认跳过） |
| 评测 | L1 检查引擎：Precision 93.3% / Recall 100% · L3 检索：Hit@1 94.7% / Hit@5 100% / MRR 0.9737（`knowledge/reports/`，均由测试产出可复现） |

**已知欠账**：MCP Server、多模态、跨表键匹配与多表加载、Python 侧运行（Pyodide）验证脚本；完整清单见[交接说明](docs/开发交接说明.md) §8.5、§8.8、§8.9 与 §8.10。

📄 **设计文档**：[docs/superpowers/specs/2026-10-09-data-quality-agent-design.md](docs/superpowers/specs/2026-10-09-data-quality-agent-design.md)

该文档包含：产品定位、需求分析、系统架构、模块设计、AI 技术方案、评分点对照、风险取舍、里程碑。

📘 **代码导读**：[docs/代码导读与TS学习.md](docs/代码导读与TS学习.md) —— 按模块讲解「做什么、为什么、涉及哪些 TypeScript 语法、答辩可能怎么问」。

## 技术栈

| 层 | 选型 |
| --- | --- |
| 框架 | Next.js 16（App Router）+ React 19 + TypeScript strict |
| 样式 | Tailwind CSS 4 + 手写组件（clsx / tailwind-merge / CVA） |
| 状态 | Zustand |
| 表格 | @tanstack/react-virtual（虚拟滚动）+ 自绘表格 |
| 解析 | PapaParse（CSV）+ read-excel-file（.xlsx），运行在 Web Worker |
| 单元测试 | Vitest |
| 端到端测试 | Playwright |
| 包管理 | pnpm |

**规划中**：Vercel AI SDK（大模型编排）、Transformers.js（端侧 embedding）、ECharts（报告图表）。

两处刻意的选型调整，理由记在计划里：

- **不用 SheetJS（`xlsx`）**：npm 上的版本停留在 0.18.5，两个已公开 CVE 的修复版只发布在其自建源。改用维护活跃的 `read-excel-file`，代价是不支持老式 `.xls`（界面会提示另存为 `.xlsx`）。
- **不用组件库 CLI**：shadcn/ui 本质是把组件源码复制进项目，而我们只需要几个简单组件。引入 CLI 会连带一套主题系统与几十个 CSS 变量，且其 registry 在境内访问缓慢。复杂交互组件（Dialog、Select）后续会直接用 Radix 原语。

## 架构要点

```
浏览器（界面 + 绝大部分计算）
   ├ 文件解析（Web Worker）
   ├ 质量检查引擎（core，纯 TS 平台无关包）
   └ 端侧 embedding
        │ 仅传「结构摘要」，原始数据不出门
        ↓
Node 接入层（Next.js API Routes，代码量极少）
   └ LLM 代理与 Agent 编排，持有 API Key
        ↓
云端 LLM（DeepSeek）
```

**关键设计**：`core/` 是平台无关的纯 TypeScript 包，浏览器与 MCP Server 共用同一份实现，从架构上杜绝「界面显示结果」与「导出脚本结果」不一致。

## 团队

| 角色 | 成员 |
| --- | --- |
| （待补充） | （待补充） |

指导教师：（待补充）

## 文档导航

| 文档 | 说明 |
| --- | --- |
| [开发交接说明](docs/开发交接说明.md) | **给新会话看的第一份文档**：当前状态、这台机器的特殊情况、开发流程、已知欠账（§8.5/§8.8/§8.9） |
| [设计文档](docs/superpowers/specs/2026-10-09-data-quality-agent-design.md) | 完整设计，含架构、AI 方案、评分点对照 |
| [代码导读与 TS 学习](docs/代码导读与TS学习.md) | 按模块讲解「做什么、为什么、涉及哪些 TS 语法、答辩可能怎么问」 |
| [知识库填写说明](knowledge/README.md) | 给团队看的：收录判据、逐列怎么填、交付前自查清单 |
| [Skills 候选清单](skills-候选清单.md) | 开发过程中采用的 Agent Skills 调研记录 |

## 开发说明

```bash
pnpm install      # 安装依赖
pnpm dev          # 本地开发（http://localhost:3000）
pnpm build        # 生产构建
pnpm start        # 以生产模式启动
pnpm test         # 单元测试（Vitest）
pnpm test:e2e     # 端到端测试（Playwright）
pnpm typecheck    # 类型检查
```

环境变量配置见 `.env.example`。**任何密钥都不得提交到仓库。**

### 端到端测试的浏览器路径

本机把 Playwright 的浏览器缓存固定在 D 盘（C 盘空间紧张），运行前需设置：

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH='D:\ms-playwright'
pnpm test:e2e
```

其他机器用默认位置即可，不需要设这个变量。

---

## 部署检查清单

> 部署由团队成员负责。本项目代码按「平台无关」编写，不需要为特定平台改动。

### 部署前本地验证

```bash
pnpm install
pnpm typecheck   # 必须 0 错误
pnpm test        # 单元测试必须全绿
pnpm test:e2e    # 端到端测试必须通过
pnpm build       # 生产构建必须成功
```

### 平台必须满足的条件

| 条件 | 为什么 |
| --- | --- |
| 支持 Next.js API Routes（Serverless / Node 运行时） | 纯静态托管不可用，会逼你把密钥放进前端 |
| 中国大陆可稳定访问 | 评审在境内，访问不了等于没有演示地址 |
| 免费额度能覆盖整个评审期 | 评审是持续的，不是一次性的 |
| 不会长时间休眠 | 冷启动会让评审第一次打开等很久 |

### 部署后必须实测的四件事

1. 从中国大陆的网络打开演示地址，确认首屏在 3 秒内出现可交互界面
2. 上传一个 1 MB 左右的 CSV，确认解析、画像与问题清单都能正常出现
3. 上传一个 GBK 编码的中文 CSV，确认表头与内容不乱码
4. 打开浏览器控制台，确认没有报错

### 数据隐私的验证方法

打开浏览器开发者工具的「网络」面板，上传一个文件，确认**没有任何请求携带文件内容**。解析与全部质量检查都在浏览器内完成，这是产品的核心承诺。
