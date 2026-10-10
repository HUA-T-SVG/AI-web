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

> 代码尚未开始。以下为规划中的命令，实施后更新。

```bash
pnpm install      # 安装依赖
pnpm dev          # 本地开发（http://localhost:3000）
pnpm build        # 生产构建
pnpm test         # 单元测试
pnpm test:e2e     # 端到端测试
```

环境变量配置见 `.env.example`（实施阶段提供）。**任何密钥都不得提交到仓库。**
