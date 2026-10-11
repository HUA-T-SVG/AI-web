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

**设计阶段**。代码尚未开始编写。

📄 **设计文档**：[docs/superpowers/specs/2026-10-09-data-quality-agent-design.md](docs/superpowers/specs/2026-10-09-data-quality-agent-design.md)

该文档包含：产品定位、需求分析、系统架构、模块设计、AI 技术方案、评分点对照、风险取舍、里程碑。

## 技术栈（规划）

| 层 | 选型 |
| --- | --- |
| 框架 | Next.js 16（App Router）+ React 19 + TypeScript strict |
| 样式 | Tailwind CSS 4 + shadcn/ui |
| AI 编排 | Vercel AI SDK 7 + Zod |
| 端侧推理 | Transformers.js（中文 embedding 小模型） |
| 状态 | Zustand |
| 表格 / 图表 | TanStack Table / ECharts |
| 解析 | PapaParse（CSV）+ SheetJS（Excel），运行在 Web Worker |
| 包管理 | pnpm |

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
| [设计文档](docs/superpowers/specs/2026-10-09-data-quality-agent-design.md) | 完整设计，含架构、AI 方案、评分点对照 |
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
