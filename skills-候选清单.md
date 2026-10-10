# AI Web 挑战赛 —— 可用 Skills 候选清单

> 调研时间：2026 年（省赛提交截止 **2026-11-18**）
> 这里的 "skill" 指 **Agent Skills（`SKILL.md` 格式）**：写给 AI 编程 Agent 的"专业说明书"。装上后 Agent 在该领域按专家级规范干活。
> 适用工具：Claude Code / Cursor / Codex / Windsurf / VS Code Copilot / DSH 等。

---

# ⭐ 最终选定：只装这 6 个

**决策依据**：本机已有 22 个 skill，已覆盖「工程方法论 / 前端审美 / 测试 / 文档产出 / 代码风格」；AI 技术深度（35%）那一侧**完全空白**。所以这 6 个只补 AI 能力侧，且**彼此不重叠**，每个对应一条独立的评分细则。

| # | Skill | 装什么 | 对应评分点 | 为什么是它 |
| --- | --- | --- | --- | --- |
| 1 | [aleph23/Natasha](https://github.com/aleph23/Natasha/tree/main/skills/ai-sdk) | `ai-sdk` | 大模型集成质量 8% + Agent 工具循环 + 多模态输入 | AI SDK 全覆盖：`streamText`、`ToolLoopAgent` 工具调用、结构化输出、embedding、多 provider。**技术栈的心脏，优先级最高** |
| 2 | [borghei/Claude-Skills](https://github.com/borghei/Claude-Skills) | `rag-architect` | RAG 技术应用 6% | 混合检索 + rerank。你的「数据标准 / 口径规则库」必须靠它，否则 RAG 只能做到"向量库塞文本" |
| 3 | [hamelsmu/evals-skills](https://github.com/hamelsmu/evals-skills) | 整套 | AI 安全与可控性 4% | LLM 评测领域权威出品。产出**量化评测表**（准确率 / 幻觉率 / 延迟 / 成本）——多数队伍只会说"效果不错" |
| 4 | [Paldom/mcp-server-skills](https://github.com/Paldom/mcp-server-skills) | 整套 | MCP / 工具集成 4% | MCP 全链路：tools / resources / prompts / transports / authz / testing / deploy。把"数据质量检查"做成 MCP server 很自然 |
| 5 | [loadingx865-star/dashboard-craft](https://github.com/loadingx865-star/dashboard-craft) | 整套 | 前端工程质量 10% + 实用性 10% | **中文**。数据看板工程化规范：图表组件统一、多分辨率验证、交付门禁。质量报告页直接用 |
| 6 | [thedaviddias/ux-patterns-for-developers](https://github.com/thedaviddias/ux-patterns-for-developers) | `ux-patterns-for-developers` | AI 交互体验 3% | 含 `ai-chat` / `ai-loading-states` / `ai-error-states`，**逐条命中"流式渲染 + 思考状态可视化 + 错误边界"** |

### ✅ 已安装（2026-10-09 完成）

实际落地 **6 个 SKILL.md**，位于 `D:\dsh-skills\`，DSH 已能识别。安装方式为**从 GitHub 浅克隆后直接复制**（不走 npx），全程落 D 盘。

| 目录 | 来源 | 许可 | 实测体积 |
| --- | --- | --- | --- |
| `ai-sdk` | [aleph23/Natasha](https://github.com/aleph23/Natasha) | ⚠️ 仓库根目录无 LICENSE | 24.7 KB |
| `evaluate-rag` | [hamelsmu/evals-skills](https://github.com/hamelsmu/evals-skills) | MIT | 7.6 KB |
| `error-analysis` | [hamelsmu/evals-skills](https://github.com/hamelsmu/evals-skills) | MIT | 8.2 KB |
| `mcp-server-implementation` | [Paldom/mcp-server-skills](https://github.com/Paldom/mcp-server-skills) | MIT | 40 KB |
| `dashboard-craft` | [loadingx865-star/dashboard-craft](https://github.com/loadingx865-star/dashboard-craft) | MIT | 129.4 KB |
| `streaming-response` | [thedaviddias/ux-patterns-for-developers](https://github.com/thedaviddias/ux-patterns-for-developers) | MIT（双许可，非商业走 MIT） | 16.4 KB |

技能库总计 **28 个 skill / 6.2 MB**。

**砍掉的**：[borghei/Claude-Skills](https://github.com/borghei/Claude-Skills) 的 `rag-architect` —— 该仓库为 **MIT + Commons Clause**（禁止 Sell），而 `evals-skills`（纯 MIT）的 `evaluate-rag` 覆盖同一评分点，故弃用。

**备用素材**：浅克隆的原始仓库留在 `D:\tmp\repos\`（99.3 MB），内含 Natasha 的 `statistical-analysis`（统计检验选择 + 假设检查 + 功效分析 + APA 报告，MIT）、`timesfm-forecasting`（时间序列预测）、`matplotlib` 等专业相关 skill，需要时可随时复制过来。

### 明确不装

- **工程方法论类**：你已有 superpowers 全套 9 个（brainstorming / writing-plans / executing-plans / subagent-driven-development …），再装是重复。
- **审美设计类**：已有 `frontend-design`（中文版，专治 AI 味）+ `theme-factory` + `brand-guidelines`。
- **3D / 动效 / 移动端**：Three.js、GSAP、Framer Motion —— 场景用不上，只会抢占上下文。
- **文档产出类**：已有 `doc-coauthoring`、`pptx-author`、`cli-anything-wps`、`theme-factory`。

> 下面第 1–11 节是完整调研存档（100+ 候选），**只作备查**，不必通读。

---

## ⚠️ 可信度说明（先读这个）

| 标记 | 含义 |
| --- | --- |
| ✅ | 我直接打开了页面确认存在 |
| ⚠️ | 仅由搜索结果摘要确认，**未逐文件核实仓库内容** |
| ❓ | 来源为二手镜像站，**仓库真实性待你点击确认** |

- **Star 数一律不写**。镜像站（SkillsLLM / skills.rest / star-history）给出的数字互相矛盾且明显失真（如声称某些仓库 18 万–29 万 star），**不要写进文档或答辩 PPT**。
- 清单里的**内容描述来自项目自述和搜索摘要**，装之前请点开仓库看一眼 `SKILL.md` 实际写了什么。

---

## 0. 一句话结论

评分权重：**AI 技术深度 35%**、创新性 25%、前端工程质量 10%、实用性 10%、用户体验 10%、社会价值 10%。

该装的 skill 分三类，按投入产出排序：

1. **AI 能力类** —— Agent / RAG / MCP / 多模态 / 安全兜底，直接对应 35%
2. **工程纪律类** —— 让 AI 别乱写、有测试、有真实 Git 记录，撑住工程质量与实用性
3. **审美与体验类** —— 专治"AI 味"界面，决定评委第一印象

---

## 1. 安装命令与发现入口

```bash
npx skills add <owner>/<repo>              # 装整个仓库的 skills
npx skills add <owner>/<repo>@<skill-name> # 只装其中一个
npx skills list                            # 查看已装
```

工具来源：[antfu/skills-cli](https://github.com/antfu/skills-cli)、[justjavac/skills](https://github.com/justjavac/skills)

### 目录站 / 合集（先在这里挑，别盲装）

| 入口 | 说明 | 验证 |
| --- | --- | --- |
| [skills.sh](https://www.skills.sh/) | Vercel 维护的 Agent Skills 目录 + 全站排行榜 | ✅ |
| [skills.rest](https://skills.rest/best-skills) | 分类清晰，带一键安装命令 | ✅ |
| [helloianneo/awesome-claude-code-skills](https://github.com/helloianneo/awesome-claude-code-skills) | **中文精选**，50+ 按场景分类 + 推荐等级 + 复制即装 | ⚠️ |
| [finfin/awesome-frontend-skills](https://github.com/finfin/awesome-frontend-skills) | **前端专用**，70+ skills / 12 分类，全部可 `npx skills add` | ✅（发了 dev.to 介绍文） |
| [yzfly/awesome-skills-zh](https://github.com/yzfly/awesome-skills-zh) | 中文 Skills / Agent Skills 精选 | ⚠️ |
| [itgoyo/awesome-agent-skills](https://github.com/itgoyo/awesome-agent-skills) | 中文，收集全网最热 Agent Skills | ⚠️ |
| [VoltAgent/awesome-agent-skills](https://github.com/VoltAgent/awesome-agent-skills) | 1000+ 官方与社区 skills | ⚠️ |
| [travisvn/awesome-claude-skills](https://github.com/travisvn/awesome-claude-skills) | 英文策展清单 | ⚠️ |
| [Shubhamsaboo/awesome-llm-apps](https://github.com/Shubhamsaboo/awesome-llm-apps) | **100+ AI Agent / RAG 应用样板**（找架构灵感用，不能直接交） | ✅ |
| [zhuyansen/skill-blue-book](https://github.com/zhuyansen/skill-blue-book) | 《Skill 蓝皮书 2026》，基于 6 万+ skill 数据做避坑研究 | ⚠️ |
| [gw769/agentic-skills-guide](https://github.com/gw769/agentic-skills-guide) | 中文教程：如何按需使用 2000+ SKILL.md | ⚠️ |
| [EverMind-AI/SkillCorpus](https://github.com/EverMind-AI/SkillCorpus) | 把散落 SKILL.md 做成可检索语料 + 评测工具 | ⚠️ |
| [AIProductHub · Skill技能推荐](https://aiproducthub.cn/s/skill/) | **中文推荐源**，每周更新 + 中文测评文章 | ✅ |

**中文精读（装之前先看，省时间）**
- [拒绝 Vibe Coding：Matt Pocock 工程级 Skills 仓库精读](https://cloud.tencent.cn/developer/article/2704288)
- [UI 丑，可能是 Skill 没用对：给 Agent 装一套 UI 工作标准](https://developer.aliyun.com/article/1761167)
- [Claude Code 时代 Skill 怎么选？50+ 精选清单](https://aiproducthub.cn/s/21537.html)
- [Taste Skill 深度解析：反模板规则让 AI 生成更有品味的前端](https://jimo.studio/blog/taste-skill-deep-dive-how-anti-template-rules-transform-ai-generated-frontend/)
- [Awesome Frontend Agent Skills 官方介绍](https://dev.to/finfin/awesome-frontend-agent-skills-a-curated-list-of-skillmd-for-frontend-dev-2oha)

---

## 2. 【第一优先】AI 技术深度 35%

### 2.1 大模型集成 / 流式输出 / 生成式 UI（对应"大模型集成质量 8%"）

| Skill | 来源 | 用途 | 验证 |
| --- | --- | --- | --- |
| `ai-sdk` | [aleph23/Natasha](https://github.com/aleph23/Natasha/tree/main/skills/ai-sdk) | Vercel AI SDK 专家：`generateText`/`streamText`/`ToolLoopAgent`/`embed`/`useChat`，多 provider、结构化输出、embeddings。**比赛规则里 Vercel AI SDK 就是推荐首选** | ✅ |
| `ai-sdk-v6-ui` | [blockmatic](https://skills.rest/skill/ai-sdk-v6-ui) | 流式 React 聊天界面 | ⚠️ |
| `building-ai-chat` | [ancoleman/ai-design-components](https://github.com/ancoleman/ai-design-components) | AI 聊天界面完整设计组件方案 | ⚠️ |
| `langchain` | [hoodini](https://skills.rest/skill/langchain-hoodini) | LangChain + LangGraph 端到端 LLM 应用 | ⚠️ |
| `thesys-generative-ui` | [jackspace](https://www.skill-gallery.jp/en/skills/jackspace/thesys-generative-ui) | **生成式 UI**：让 AI 直接生成界面而非只出文本 → 命中"交互模式创新 7%" | ⚠️ |
| `cn-model-gateway` | [agent-skill-observatory](https://github.com/imMamdouhaboammar/agent-skill-observatory) | 国产大模型网关（智谱/通义/DeepSeek），省 API 对接时间 | ⚠️ |
| `ai-sdk-patterns` | [akashp1712/ai-sdk-patterns](https://github.com/akashp1712/ai-sdk-patterns) | AI SDK v6 可组合模式，拼成完整 Next.js 全栈应用 | ⚠️ |
| `ai-sdk` | [vercel/vercel-plugin](https://github.com/vercel/vercel-plugin) | Vercel 官方插件里的 AI SDK skill | ⚠️ |
| `json-render-generative-ui` | [LeoYeAI/openclaw-master-skills](https://github.com/LeoYeAI/openclaw-master-skills) | 生成式 UI / 流式 UI 组件 | ⚠️ |
| `prompt engineering` 整包 | [theultimate-dev/skills](https://github.com/theultimate-dev/skills) | 按 plugin 分组：foundations / product design / product engineering / **prompt engineering** | ❓ |

### 2.2 RAG（对应"RAG 技术应用 6%"）

| Skill | 来源 | 用途 | 验证 |
| --- | --- | --- | --- |
| `rag-implementation` | [stefan-jansen/claude-code-toolkit](https://github.com/stefan-jansen/claude-code-toolkit) | RAG 落地实现（作者是知名量化领域作者） | ⚠️ |
| `rag-implementation` | [skills.rest / amurata](https://skills.rest/skill/rag-implementation-amurata) | 向量库选型 + embedding + 检索 | ⚠️ |
| `rag-architect` | [borghei/Claude-Skills](https://github.com/borghei/Claude-Skills) | **hybrid retrieval + reranking** 检索策略 | ⚠️ |
| `rag-observability-evals` | [BagelHole/DevOps-Security-Agent-Skills](https://github.com/BagelHole/DevOps-Security-Agent-Skills/blob/main/devops/ai/rag-observability-evals/SKILL.md) | **RAG 可观测性与评测**——能证明"检索增强确实提升生成质量"，评审很吃这套 | ⚠️ |
| chonkie 生态 skills | [feyninc/skills](https://github.com/feyninc/skills) | **chunking 分块策略**（chonkie 是流行文本分块库） | ⚠️ |
| `vector-databases` | [Antigravity-Agent-Toolkit](https://github.com/Daniel-da-Silva-Alves/Antigravity-Agent-Toolkit) | 向量数据库选型与用法 | ⚠️ |
| `rag-infrastructure` | [BagelHole/DevOps-Security-Agent-Skills](https://github.com/BagelHole/DevOps-Security-Agent-Skills) | 自托管 RAG 基础设施（离线部署 + 成本控制叙事） | ⚠️ |
| `ai-rag` | [echohaoran/AI-AGENT-Skills](https://github.com/echohaoran/AI-AGENT-Skills) | **中文** AI AGENT 常用 skills 集合 | ⚠️ |
| RAG 文档"入仓前审查" | [AIProductHub 介绍文](https://aiproducthub.cn/s/65469.html) | 治"LLM 把猜测当事实"，提升知识库可信度 | ✅（文章） |
| `Mnemon` | [AIProductHub 介绍文](https://aiproducthub.cn/s/64278.html) | LLM 监督式长期记忆，跨会话不失忆 | ✅（文章） |

### 2.3 Agent / 多 Agent 编排（对应"Agent/工作流设计 8%"）

| Skill | 来源 | 用途 | 验证 |
| --- | --- | --- | --- |
| `obra/superpowers` | [obra/superpowers](https://github.com/obra/superpowers) | 方法论型：`brainstorming` → `writing-plans` → `subagent-driven-development` → `verification-before-completion`。**"Agent 规划 / 自主决策"最直观的演示证据** | ⚠️ |
| `garrytan/gstack` | [garrytan/gstack](https://github.com/garrytan/gstack) | 把单个 Agent 变成"一整个工程团队"（PM/设计/前后端/测试分工），59 skills | ⚠️ |
| `council-of-high-intelligence` | [0xNyk](https://skills.rest/repo/0xNyk/council-of-high-intelligence) | **18 个 AI 专家人格评审决策**——多 Agent 辩论的现成范式，可直接借鉴进作品 | ⚠️ |
| `openInvest` | [AIProductHub 介绍文](https://aiproducthub.cn/s/67015.html) | 本地多代理投资决策引擎，"AI 委员会辩论"架构可迁移 | ✅（文章） |
| `langchain-skillkit` | [rsmdt/langchain-skillkit](https://github.com/rsmdt/langchain-skillkit) | LangChain/LangGraph 的 skill 实现，把技能接进工作流 | ⚠️ |
| `agent-workflow-automation` | [ruvnet/ruflo](https://github.com/ruvnet/ruflo) | Agent 工作流自动化规范写法 | ⚠️ |
| Multi-Agent Skills Catalog | [louislau-art.github.io](https://louislau-art.github.io/multi-agent-skills-catalog/) | 多 Agent 技能目录，找角色分工 | ⚠️ |
| n8n 官方 skills | [n8n-io/n8n](https://skills.rest/repo/n8n-io/n8n) | 1500+ 应用连接的 Agent / 自动化工作流（工具调用灵感） | ⚠️ |

### 2.4 MCP / Function Calling 工具集成（对应"MCP/工具集成 4%"）

| 资源 | 链接 | 说明 | 验证 |
| --- | --- | --- | --- |
| `mcp-builder` | [anthropics/skills](https://github.com/anthropics/skills) | 官方：教 Agent 怎么写 MCP server。**规范底座** | ✅ |
| `mcp-server-skills` | [Paldom/mcp-server-skills](https://github.com/Paldom/mcp-server-skills) | MCP 全链路：server 架构 / tools / resources / prompts / transports / authorization / testing / deployment。**这一档最对口** | ⚠️ |
| `function-calling` | [e-t-y-b/etyb-skills](https://github.com/e-t-y-b/etyb-skills) | Function Calling 规范与模式 + `stacks/vercel/ai-sdk.md` | ⚠️ |
| `mcp-builder` | [runlayer/plugins](https://github.com/runlayer/plugins) | 另一份 MCP builder 实现，可对比 | ⚠️ |
| `skills-as-mcp` | [windht/skills-as-mcp](https://github.com/windht/skills-as-mcp) | 把 skill 目录转成 MCP tools/resources/prompts，做"自研 MCP 网关"的好素材 | ⚠️ |
| `agent-skills-mcp` | [alibugatekinn/agent-skills-mcp](https://github.com/alibugatekinn/agent-skills-mcp) | 用 Streamable HTTP 发布 SKILL.md 目录，演示"技能即服务" | ⚠️ |
| MCP 官方示例 | [modelcontextprotocol.io/examples](https://modelcontextprotocol.io/examples) | 官方 server 清单 | ⚠️ |
| Awesome MCP Servers | [bgizdov/awesome-mcp-servers](https://github.com/bgizdov/awesome-mcp-servers) | 自动生成、持续更新 | ⚠️ |
| Awesome-MCP-ZH | [yzfly/Awesome-MCP-ZH](https://github.com/yzfly/Awesome-MCP-ZH) | **中文 MCP 资源合集** | ⚠️ |
| GitHub MCP Registry | [github.com/mcp](https://github.com/mcp) | GitHub 官方 MCP 注册表 | ⚠️ |
| Smithery SDK | [AIProductHub 介绍文](https://aiproducthub.cn/s/64786.html) | MCP 服务器配置与认证从 50 行压到 10 行 | ✅（文章） |

### 2.5 多模态（对应"多模态能力 5%"）

| Skill | 来源 | 用途 | 验证 |
| --- | --- | --- | --- |
| `shotfun-creator` | [shotfun-ai/shotfun-creator](https://github.com/shotfun-ai/shotfun-creator) | 图像 / 视频 / 音频 / 数字人内容生产 agent skill 集合，一站式覆盖多模态 | ⚠️ |
| Remotion Skills | [AIProductHub 介绍文](https://aiproducthub.cn/s/19241.html) | 官方 11 个 skills，**用 React 写代码生成视频** | ✅（文章） |
| `silicogrove-video-skill` | [Rodert/silicogrove-video-skill](https://github.com/Rodert/silicogrove-video-skill) | **中文作者**：agent 通过 API 生成视频 | ⚠️ |
| `relay-imagegen` | [yfpgle-glitch/relay-imagegen](https://github.com/yfpgle-glitch/relay-imagegen) | **中文**：多供应商 AI 生图 + 参考图编辑 + 供应商路由（含兜底叙事） | ⚠️ |
| `speak-skills` | [farandclose/speak-skills](https://github.com/farandclose/speak-skills) | `/speak` + `/vocal`：把 agent 回复变成**语音输出（TTS）** | ⚠️ |
| `manim-skill` | [Yusuke710/manim-skill](https://github.com/Yusuke710/manim-skill) | 用 Manim 做动画/视频：**规划 → 写码 → 渲染 → 按反馈迭代，Agent 自主闭环的极佳演示** | ⚠️ |
| `interview-skills` | [giovannirco/interview-skills](https://github.com/giovannirco/interview-skills) | 录音 → **本地说话人标注转写（STT）**，语音模态现成实现 | ⚠️ |
| `multimodal-specialist` | [yonatangross/orchestkit](https://github.com/yonatangross/orchestkit) | 多模态专家 agent 定义 | ⚠️ |
| `hyperframes` | [heygen-com/hyperframes](https://www.skills.sh/) | HeyGen 的 AI 视频框架 skill | ✅（榜单） |
| `prompt-to-asset` | [AIProductHub 介绍文](https://aiproducthub.cn/s/64719.html) | 一句 brief 出全套视觉素材（logo / OG 图 / 配图） | ✅（文章） |
| `Tesseract` 4K 剪辑 | [AIProductHub 介绍文](https://aiproducthub.cn/s/64846.html) | AI 视频剪辑成片 | ✅（文章） |
| `codex-multimodal` | [kk3270529434/codex-multimodal](https://github.com/kk3270529434/codex-multimodal) | 多模态技能（内容细节未确认） | ❓ |

### 2.6 AI 安全与可控性 + 评估 + 成本（对应"AI 安全 4%"，最容易被忽略的加分项）

| Skill | 来源 | 用途 | 验证 |
| --- | --- | --- | --- |
| `evals-skills` | [hamelsmu/evals-skills](https://github.com/hamelsmu/evals-skills) | Hamel Husain（LLM 评估领域权威）出品。**评委认可度最高的评估类技能** | ⚠️ |
| `guardrails-ai-setup` | [a5c-ai/babysitter](https://github.com/a5c-ai/babysitter/blob/main/library/specializations/ai-agents-conversational/skills/guardrails-ai-setup/SKILL.md) | Guardrails AI 接入：输出校验、内容过滤、兜底 | ⚠️ |
| `ai-safety-guardrails` | [varunk130/ai-ux-skill-library](https://github.com/varunk130/ai-ux-skill-library) | 安全护栏 + AI UX | ⚠️ |
| `ai-redteam` | [Masriyan/gemini-security-skills](https://github.com/Masriyan/gemini-security-skills) | 红队 / 对抗测试 | ⚠️ |
| NVIDIA 三段式 Skill 评估框架 | [AIProductHub 介绍文](https://aiproducthub.cn/s/65451.html) | 评估 skill/Agent 到底有没有用 → 可写进技术文档的"AI 优化策略" | ✅（文章） |
| `Varlock` | [AIProductHub 介绍文](https://aiproducthub.cn/s/66598.html) | 防止 AI 偷看 `.env`。**比赛明文要求 API Key 不得进公开仓库**，直接对应合规 | ✅（文章） |
| Sentry skill 扫描器 | [AIProductHub 介绍文](https://aiproducthub.cn/s/65052.html) | 装 skill 前的安全扫描 | ✅（文章） |
| `prompt-caching-patterns` | [softspark/ai-toolkit](https://github.com/softspark/ai-toolkit) | Prompt Caching，直接降低成本，容易量化写进"商业潜力" | ⚠️ |
| `context-engineer` | [cacheforge-ai/cacheforge-skills](https://github.com/cacheforge-ai/cacheforge-skills) | 上下文工程 / 缓存命中优化 | ⚠️ |
| `agent-evals-and-observability` | [magnus919/agent-skills](https://github.com/magnus919/agent-skills) | 评估 + 可观测性 | ⚠️ |
| Cost / policy gates | [jscraik/Agent-Skills](https://github.com/jscraik/Agent-Skills) | Tessl cost/turn/token 指标提取 + live policy gates | ⚠️ |
| `awesome-ai-security` | [gmh5225/awesome-ai-security](https://github.com/gmh5225/awesome-ai-security) | 安全章节的调研引用清单 | ⚠️ |
| `ai-evaluation-skill` | [YLTsing/ai-evaluation-skill](https://github.com/YLTsing/ai-evaluation-skill) | AI 评估专用（细节未确认） | ❓ |

### 2.7 记忆 / 上下文工程

| Skill | 来源 | 用途 | 验证 |
| --- | --- | --- | --- |
| `agent-memory` | [Jannhsu/agent-memory](https://github.com/Jannhsu/agent-memory) | **纯 Markdown 做长期记忆，无向量库无 embedding**：轻量、可解释、零成本，适合做比赛"记忆"亮点 | ⚠️ |
| Context Engineering skills | [muratcankoylan/Agent-Skills-for-Context-Engineering](https://github.com/muratcankoylan/Agent-Skills-for-Context-Engineering) | 上下文工程，对应 Prompt 设计与上下文管理 | ⚠️ |
| `echomind_memory.skill` | [jasonatgit/echomind_memory.skill](https://github.com/jasonatgit/echomind_memory.skill) | 多智能体记忆系统（记住代码风格、修复、偏好） | ⚠️ |

---

## 3. 【第二优先】工程纪律与真实开发过程

比赛要求"保留完整 Git 提交历史，体现真实的开发过程"。这几个不是让 AI 更强，而是**让 AI 别乱来**。

| Skill 仓库 | 装什么 | 为什么值得 | 验证 |
| --- | --- | --- | --- |
| [mattpocock/skills](https://github.com/mattpocock/skills) | `grill-me`、`grill-with-docs`、`tdd`、`improve-codebase-architecture`、`domain-modeling`、`diagnosing-bugs`、`prototype`、`triage` | Matt Pocock（TypeScript 圈大 V）的 37 个 skill。`grill-me` 写码前反复追问需求，`diagnosing-bugs` 治"AI 瞎改代码" | ✅ |
| [obra/superpowers](https://github.com/obra/superpowers) | 整套 | 从想法到合并的完整纪律流程：TDD、子代理并行、代码审查、Git 工作流 | ⚠️ |
| [garrytan/gstack](https://github.com/garrytan/gstack) | 整套 | 把单个 Agent 变成整个工程团队，59 skills | ⚠️ |
| [anthropics/skills](https://github.com/anthropics/skills) | `skill-creator`、`webapp-testing`、`artifacts-builder` | 官方。`skill-creator` 教你怎么给项目写专属 skill | ✅ |
| [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) | `performance-optimization` 等 | Google Chrome 团队 Addy Osmani 出品，带独立 `evals/` 目录。**有中文本地化版** [vinvcn/addyosmani-agent-skills-zh](https://github.com/vinvcn/addyosmani-agent-skills-zh) | ⚠️ |
| [steveyegge/beads](https://github.com/steveyegge/beads) | 整套 | 给 Agent 做持久化 issue 跟踪 / 任务记忆，三人协作不会"忘了上周干了啥" | ⚠️ |
| [yevhens-hue/claude-skills-starter-kit](https://github.com/yevhens-hue/claude-skills-starter-kit) | 整套（20 个） | 自述覆盖 **LangGraph、RAG、GEO/AEO、MCP、security**，一份仓库补齐 35% 里三档 | ❓ |
| [aniruddhaadak80/skills](https://github.com/aniruddhaadak80/skills) | 按需 | 自述 521 个生产级 skills / 47 个职业，含 Agentic Methodology（TDD、subagent dispatch、design gates）、MCP building | ❓ |

---

## 4. 【第三优先】前端工程与用户体验（10% + 10%）

### 4.1 框架 / 架构 / 性能 / TypeScript

| Skill | 来源 | 说明 | 验证 |
| --- | --- | --- | --- |
| `vercel-react-best-practices`、`vercel-composition-patterns`、`vercel-optimize`、`vercel-react-view-transitions`、`web-design-guidelines`、`deploy-to-vercel` | [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) | **一发覆盖前端工程质量大半**：首屏/懒加载/缓存优化、compound components 可扩展组件 API、路由过渡动画、UI/a11y 评审、Vercel 部署 | ⚠️ |
| Next.js 官方 skills（22 个） | [vercel/next.js](https://github.com/vercel/next.js) | 构建、测试、发布全栈 React 应用。**比赛首选栈** | ⚠️ |
| `performance-optimization` | [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) | 前端性能权威。中文版见上 | ⚠️ |
| `performance-audit-skill` | [brunnocarpena/performance-audit-skill](https://github.com/brunnocarpena/performance-audit-skill) | PageSpeed / Lighthouse / Core Web Vitals 审计 | ⚠️ |
| `strict-typing` | [troykelly/claude-skills](https://github.com/troykelly/claude-skills) | TypeScript 严格化，对应"TypeScript 规范使用 4%" | ⚠️ |
| `state-management` | [jyjeanne/ai-setup-forge](https://github.com/jyjeanne/ai-setup-forge) | 状态管理规范 | ⚠️ |
| `react-specialist` | [johnefemer/skillfish](https://github.com/johnefemer/skillfish) | React 专家，含 ErrorBoundary / ErrorInfo 错误边界模式 | ⚠️ |
| 前端 skills 总索引 | [finfin/awesome-frontend-skills](https://github.com/finfin/awesome-frontend-skills) | 70+ skills / 12 分类：React/Angular/Vue/Next/Nuxt/Svelte/TanStack/Remix、Vite/Nx/Turborepo、Prisma/Supabase/Convex、Clerk/Auth0、Playwright/Cypress、Three.js/Framer Motion、Expo、Remotion | ✅ |
| 大型 subagents + skills 集合 | [wshobson/agents](https://github.com/wshobson/agents) | 184 skills，含 `tailwind-design-system`、`responsive-design`、`interaction-design` | ⚠️ |
| `bun` 官方 skills | [oven-sh/bun](https://skills.rest/repo/oven-sh/bun) | 运行时 / 打包 / 测试 / 包管理 | ⚠️ |
| Vue/Nuxt 全套 | [mvtandas/vue-claude-stack](https://github.com/mvtandas/vue-claude-stack) | 选 Vue 3 + Nuxt 3 时用 | ⚠️ |
| SvelteKit 2 + Svelte 5 + TW v4 | [claude-skills/sveltekit-svelte5-tailwind-skill](https://github.com/claude-skills/sveltekit-svelte5-tailwind-skill) | 选 Svelte 时用 | ⚠️ |
| `context7` | [intellectronica/agent-skills](https://github.com/intellectronica/agent-skills) | 让 Agent 实时拉取最新官方文档，避免写过时 API | ⚠️ |

### 4.2 设计品味 / 反"AI 味"（评委第一印象）

| Skill | 来源 | 说明 | 验证 |
| --- | --- | --- | --- |
| `frontend-design` | [anthropics/skills](https://github.com/anthropics/skills) | **官方标杆**，安装量榜前列。配色大胆、字体有辨识度、拒绝模板化默认值 | ✅ |
| `taste-skill`（`minimalist-ui` 等 13 个） | [Leonxlnx/taste-skill](https://skills.rest/repo/Leonxlnx/taste-skill) | 用**反模板硬规则**让 AI 前端有品味 | ⚠️ |
| `impeccable`（19 skills） | [pbakaus/impeccable](https://skills.rest/repo/pbakaus/impeccable) | 面向"AI 生成前端界面"的设计指导与质量检查 | ⚠️ |
| `ui-ux-pro-max-skill`（13 skills） | [nextlevelbuilder/ui-ux-pro-max-skill](https://skills.rest/repo/nextlevelbuilder/ui-ux-pro-max-skill) | 专业 UI / 品牌 / 演示的设计智能 | ⚠️ |
| `garden-skills` | [ConardLi/garden-skills](https://skills.rest/repo/ConardLi/garden-skills) | **国人作者**：网页、图片、文章、视频演示设计 | ⚠️ |
| `avoid-ai-design` | [funboy322/avoid-ai-design](https://github.com/funboy322/avoid-ai-design) | **审计 AI 生成前端**（紫色渐变 slop、奶油+陶土色、mono chrome），自带零依赖扫描器 | ⚠️ |
| `design-taste-frontend` | [changemaner/design-taste-frontend](https://github.com/changemaner/design-taste-frontend) | anti-slop 前端设计 + 30 套真实品牌素材库 + manifest 驱动选风格 + QA gate | ⚠️ |
| `ultimate-frontend-design-openclaw-skill` | [kesslerio](https://github.com/kesslerio/ultimate-frontend-design-openclaw-skill) | 反 AI slop、mobile-first、React+Tailwind+shadcn、单文件打包 | ⚠️ |
| `html-anything`（56 skills） | [nexu-io/html-anything](https://skills.rest/repo/nexu-io/html-anything) | 把笔记/数据变成精致 HTML 页面、幻灯片、海报 | ⚠️ |
| `ai-design-components` | [ancoleman/ai-design-components](https://github.com/ancoleman/ai-design-components) | UI/UX + 后端组件设计技能全集 | ⚠️ |
| `frontend-design` | [block/agent-skills](https://github.com/block/agent-skills) | Block 官方的前端设计 skill | ⚠️ |
| `sky-skills` | [TbusOS/sky-skills](https://github.com/TbusOS/sky-skills) | 设计 skill 集 + 独立 `design-review` 评审器（gate-chain 校验） | ⚠️ |

### 4.3 设计系统 / 组件库

| Skill | 来源 | 说明 | 验证 |
| --- | --- | --- | --- |
| `shadcn` + 官方 Skills 文档 | [shadcn-ui/ui](https://github.com/shadcn-ui/ui) · [ui.shadcn.com/docs/skills](https://ui.shadcn.com/docs/skills) | 比赛推荐组件库。**新增 AI 会话原语 `Message`/`Bubble`/`Message Scroller`/`Marker`/`Attachment`，直接服务流式聊天 UI** | ⚠️ |
| `tailwind-design-system` | [wshobson/agents](https://github.com/wshobson/agents) | Tailwind v4 + design tokens + 组件库 + 响应式 | ⚠️ |
| `Shadcnblocks-Skill` | [masonjames/Shadcnblocks-Skill](https://github.com/masonjames/Shadcnblocks-Skill) | 2500+ shadcn/ui blocks 的选取 / 安装 / 组合 | ⚠️ |
| `design-system-starter` | [softaworks/agent-toolkit](https://github.com/softaworks/agent-toolkit) | 设计系统起步模板 | ⚠️ |
| `ux-ui-agent-skills` | [sterlingpathological200](https://github.com/sterlingpathological200/ux-ui-agent-skills) | design tokens + 无障碍组件 + 生产级 React/Next.js 输出 | ⚠️ |

### 4.4 动效 / 交互（对应"动画过渡自然 3%" + "交互模式创新 7%"）

| Skill | 来源 | 说明 | 验证 |
| --- | --- | --- | --- |
| `animate`、`review-animations`、`improve-animations`、`find-animation-opportunities`、`animation-vocabulary`、`emil-design-eng`、`break-ui`、`mobile-native`、`apple-design` | [emilkowalski/skills](https://github.com/emilkowalski/skills) | **交互体验 3% + 交互模式创新 7% 的最强杠杆**。emilkowalski 是 Sonner/Vaul 作者，动效圈公认高手。`break-ui` 用极端数据/长文案/emoji 压测 UI 不崩 | ✅ |
| GSAP 官方 skills | [greensock/gsap-skills](https://github.com/greensock/gsap-skills) | **GSAP 官方** AI skills，含 `skills/llms.txt` 索引 | ⚠️ |
| `motion-design-skill` | [LottieFiles/motion-design-skill](https://github.com/LottieFiles/motion-design-skill) | 通用动效原则：timing、easing、编舞 + 迪士尼动画原则 UI 化 | ⚠️ |
| `micro-interactions-skill` | [solinkz/micro-interactions-skill](https://github.com/solinkz/micro-interactions-skill) | 20+ 微交互模式、弹簧物理、缓动曲线、可访问性与性能 | ⚠️ |
| Framer Motion skills | [C-Jeril/framer-motion-skills](https://github.com/C-Jeril/framer-motion-skills) | 比赛推荐动效库 | ⚠️ |
| `gsap-scrolltrigger` | [freshtechbro/claudedesignskills](https://github.com/freshtechbro/claudedesignskills) | GSAP ScrollTrigger | ⚠️ |
| `animate-skill` | [delphi-ai/animate-skill](https://github.com/delphi-ai/animate-skill) | 基于 Emil Kowalski 课程的 Next.js/React 动画 skill | ⚠️ |

### 4.5 AI 交互体验（对应"AI 交互体验 3%"，评分细则逐条命中）

| Skill | 来源 | 说明 | 验证 |
| --- | --- | --- | --- |
| `ux-patterns-for-developers`（93 个 pattern skills） | [thedaviddias/ux-patterns-for-developers](https://github.com/thedaviddias/ux-patterns-for-developers) | 含 `ai-chat`、`ai-loading-states`、**`ai-error-states`**、`context-window`、`ai-suggestions`、`command-palette`。**"流式输出渲染 + AI 思考状态可视化 + 错误边界"几乎逐条命中** | ⚠️ |
| `ai-elements-chatbot` | [secondsky/claude-skills](https://github.com/secondsky/claude-skills) | Vercel AI Elements 聊天 UI | ⚠️ |
| `ai-loading-ux` / `ai-loading-states` | [rohunvora/cool-claude-skills](https://github.com/rohunvora/cool-claude-skills) · [shipshitdev/ai-loading-ux-skills](https://github.com/shipshitdev/ai-loading-ux-skills) | AI 加载 / 思考状态 | ⚠️ |
| `ai-elements` | [laguagu/ai-elements](https://github.com/laguagu/ai-elements) | AI Elements 组件 | ⚠️ |

### 4.6 响应式 / 无障碍

| Skill | 来源 | 说明 | 验证 |
| --- | --- | --- | --- |
| `responsive-layout-master` | [curiositech/windags-skills](https://github.com/curiositech/windags-skills) | 响应式布局（同一仓库还有 `transformers-js-onnx-pipelines`） | ⚠️ |
| `web-design-guidelines` | [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) | review UI / check accessibility / audit design / review UX | ⚠️ |
| `accessibility-agent-skills` | [venkatvemuri28](https://github.com/venkatvemuri28/accessibility-agent-skills) | Web + 移动端无障碍评审与修复 | ⚠️ |
| `web-accessibility` | [magnus919/agent-skills](https://github.com/magnus919/agent-skills) | 无障碍（同仓还有 `three`、`web-accessibility`） | ⚠️ |
| `accessibility-a11y` | [Mindrally/skills](https://github.com/Mindrally/skills) | 无障碍（同仓还有 `gsap`） | ⚠️ |

### 4.7 3D / WebGL / 浏览器端 AI

| Skill | 来源 | 说明 | 验证 |
| --- | --- | --- | --- |
| Three.js 技能包（24 个） | [Impertio-Studio/Three.js-Claude-Skill-Package](https://github.com/Impertio-Studio/Three.js-Claude-Skill-Package) | WebGL、WebGPU、React Three Fiber、Drei、物理、IFC。**做 3D 才装** | ⚠️ |
| `transformers-js-onnx-pipelines` | [curiositech/windags-skills](https://github.com/curiositech/windags-skills) | **浏览器端本地模型推理**（比赛鼓励"端侧智能"技术前瞻性） | ⚠️ |
| `coding-frontend-onnx-webgpu` | [endman100/skill-router-nexus](https://github.com/endman100/skill-router-nexus) | ONNX + WebGPU 前端推理 | ⚠️ |
| `on-device-ai` | [omer-metin/skills-for-antigravity](https://github.com/omer-metin/skills-for-antigravity) | 端侧 AI | ⚠️ |
| `transformers-js` | [ultroncore/claude-skill-vault](https://skillsmp.com/creators/ultroncore/claude-skill-vault/skills-ai-ml-transformers-js) | Transformers.js（同源条目托管在 [HuggingFace](https://huggingface.co/buckets/olaservo/skills/tree/distribution/latest/transformers-js/SKILL.md)） | ⚠️ |
| `wasm-skills` | [derushio/wasm-skills](https://github.com/derushio/wasm-skills) | WebAssembly 集成（WASM 侧模型加速） | ⚠️ |
| 语音界面 / MediaPipe | — | **覆盖薄弱**：Web Speech API 与 MediaPipe 缺乏专精前端 skill，仅有 `voice-interface-builder`（[daffy0208/ai-dev-standards](https://github.com/daffy0208/ai-dev-standards)）、`hand-tracking-claude-skill`（[sam-vish](https://github.com/sam-vish/hand-tracking-claude-skill)）等零散条目 | ⚠️ |

### 4.8 测试 / 部署

| Skill | 来源 | 说明 | 验证 |
| --- | --- | --- | --- |
| `webapp-testing` | [anthropics/skills](https://github.com/anthropics/skills) | Playwright 驱动，验证前端功能、抓截图、读浏览器日志（本会话已可用） | ✅ |
| `webapp-testing` | [github/awesome-copilot](https://github.com/github/awesome-copilot) | GitHub 官方大仓里的同名技能 | ⚠️ |
| `frontend-testing` | [langgenius/dify](https://github.com/langgenius/dify) | **真实大厂前端测试 skill**（Dify 仓库内的 `.agents/skills/`） | ⚠️ |
| `tester-army/e2e` | [AIProductHub 介绍文](https://aiproducthub.cn/s/65099.html) | 用自然语言写 e2e 测试，跑一次后回归不再调模型 | ✅（文章） |
| Playwright / Cypress 官方 skills | [finfin/awesome-frontend-skills](https://github.com/finfin/awesome-frontend-skills) | 官方 E2E 测试规范 | ✅ |
| `skill-tester` | [AIProductHub 介绍文](https://aiproducthub.cn/s/64978.html) | 给已装 skill 打分，淘汰低质量 skill | ✅（文章） |
| `deploy-to-vercel` | [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) | 一键部署（**在线演示是可选的加分项**） | ⚠️ |

---

## 5. 交付物生产（README / 技术文档 PDF / 答辩 PPT / 演示视频）

比赛要交：代码仓库（README + 环境配置）、5–8 分钟 1080p 演示视频、≤30 页 PDF 技术文档。

| Skill | 来源 | 用途 | 验证 |
| --- | --- | --- | --- |
| `docx` / `pptx` / `xlsx` / `pdf` | [anthropics/skills](https://github.com/anthropics/skills) | 官方 Office 文档读写（本会话已可用） | ✅ |
| `ppt-master` | [hugohe3/ppt-master](https://skills.rest/repo/hugohe3/ppt-master) | 文档/主题 → **可编辑 PowerPoint，答辩 PPT 直接用** | ⚠️ |
| `frontend-slides` | [zarazhangrui/frontend-slides](https://skills.rest/repo/zarazhangrui/frontend-slides) | HTML 演示文稿（可导出/录制做视频素材） | ⚠️ |
| Remotion Skills | [AIProductHub 介绍文](https://aiproducthub.cn/s/19241.html) | **用 React 代码生成演示视频** | ✅（文章） |
| `theme-factory` / `brand-guidelines` | [anthropics/skills](https://github.com/anthropics/skills) | 统一视觉主题与品牌规范 → 文档、PPT、前端同一套设计系统（本会话已可用） | ✅ |
| `internal-comms` | [anthropics/skills](https://github.com/anthropics/skills) | 汇报/周报类文档，写"项目进展说明"省事 | ✅ |
| `canvas-design` / `algorithmic-art` | [anthropics/skills](https://github.com/anthropics/skills) | 封面、海报、视觉资产（本会话已可用） | ✅ |
| `arc-kit`（69 skills） | [tractorjuice/arc-kit](https://skills.rest/repo/tractorjuice/arc-kit) | 生成企业架构治理文档（架构图/文档规范化） | ⚠️ |

---

## 6. 按选题方向找的领域 skill

比赛给了 10 个方向。下面是检索到的**中文领域 skill**，价值在于"看它怎么结构化领域知识、怎么设计 Prompt 和输出校验"：

| 选题方向 | Skill | 链接 | 验证 |
| --- | --- | --- | --- |
| 5. AI 教育与学习平台 | AI 一对一私教学习法：费曼教学 + 误区库 + 解释视频 | [JasonHualun/hualun-ai-learning-accelerator](https://github.com/JasonHualun/hualun-ai-learning-accelerator) | ⚠️ |
| 5. AI 教育与学习平台 | 项目驱动学习 + 掌握度检查 + 权威信源 | [read2017/learn-anything-with-AI](https://github.com/read2017/learn-anything-with-ai) | ⚠️ |
| 4. AI 协同办公工具 | **中文**会议转写 → 结构化纪要 → 时间戳证据 → 追问问答（本地优先） | [bystander563/meeting-audio-notes-skill](https://github.com/bystander563/meeting-audio-notes-skill) | ⚠️ |
| 4. AI 协同办公工具 | 英文会议纪要 skill | [shalomb/agent-skills](https://github.com/shalomb/agent-skills) | ⚠️ |
| 6. AI 健康与生活服务 | 开源健身 Agent Skill 知识库 | [LZheng0411/Lzheng-fitness](https://github.com/LZheng0411/Lzheng-fitness) | ⚠️ |
| 8. AI 数据分析与可视化 | **中文**数据看板 / 大屏前端工程化规范与交付门禁（设计单一真源、图表组件统一、多分辨率多浏览器验证、质量门禁） | [loadingx865-star/dashboard-craft](https://github.com/loadingx865-star/dashboard-craft) | ⚠️ |
| 8. AI 数据分析与可视化 | 自然语言数据分析 | [akira-cloudjob-public/data-analysis-agent](https://github.com/akira-cloudjob-public/data-analysis-agent) | ⚠️ |
| 7. AI 代码开发辅助 | 代码审查、架构改进、调试、TDD 全套 | [mattpocock/skills](https://github.com/mattpocock/skills) · [obra/superpowers](https://github.com/obra/superpowers) · [garrytan/gstack](https://github.com/garrytan/gstack) | ✅ / ⚠️ |
| 1. AI Agent 智能助手 | 多 Agent 编排 | 见 2.3 节 | — |
| 2. RAG 知识问答系统 | RAG 实现 + 评测 | 见 2.2 节 | — |
| 3. 多模态 AI 创意平台 | 图像 / 语音 / 视频 | 见 2.5 节 | — |
| 9. AI 安全与内容治理 | Guardrails / 安全扫描 | 见 2.6 节 | — |
| 10. AI 社交与社区应用 | 多 Agent 推荐辩论思路可借用 `council-of-high-intelligence` | 见 2.3 节 | — |

> **正确用法**：学它怎么组织领域知识、怎么设计 Prompt 与输出校验，然后**在自己的 Web 应用里实现**。直接把 skill 当产品交付 = 不符合"作品须为原创"和"须以 Web 应用形态呈现"。

---

## 7. 建议的最小安装组合（先装这 8 个，别贪多）

```bash
# 1. 工程纪律：需求拷问 → 计划 → TDD → 验证（Matt Pocock，TypeScript 圈权威）
npx skills add mattpocock/skills

# 2. 官方前端设计审美（治"AI 模板感"的标杆）
npx skills add anthropics/skills@frontend-design

# 3. 反模板硬规则审美（与上面互补）
npx skills add Leonxlnx/taste-skill

# 4. UI 动效 + 交互打磨（对应"动画过渡自然"与"交互创新"）
npx skills add emilkowalski/skills

# 5. React / Next.js 最佳实践 + 组件架构 + 部署（一发覆盖工程质量大半）
npx skills add vercel-labs/agent-skills

# 6. AI 交互体验全套 pattern（ai-chat / ai-loading-states / ai-error-states）
npx skills add thedaviddias/ux-patterns-for-developers

# 7. Vercel AI SDK 流式对话 + 工具调用（AI 能力核心，比赛推荐首选栈）
npx skills add aleph23/Natasha --skill ai-sdk

# 8. MCP 全链路（把"MCP/工具集成"这一档做扎实、可现场演示）
npx skills add Paldom/mcp-server-skills

# 可选：让 Agent 自己发现并安装新 skill
npx skills add vercel-labs/skills@find-skills
```

**备选补位**：RAG 用 `stefan-jansen/claude-code-toolkit` 或 `borghei/Claude-Skills`（`rag-architect`）；评估用 `hamelsmu/evals-skills`；成本故事用 `softspark/ai-toolkit`（`prompt-caching-patterns`）；多模态一次到位用 `shotfun-ai/shotfun-creator`。

---

## 8. 使用注意（和比赛规则直接相关）

1. **API Key 绝不能进公开仓库**。比赛明文规定"须通过环境变量方式配置"。提交前用 `git log -p | Select-String -Pattern "sk-"` 之类自查，并配好 `.gitignore` 和 `.env.example`。
2. **作品必须原创**。"直接使用开源项目包装参赛"属违规。`awesome-llm-apps` 这类仓库只能用来**找架构灵感**，不能改个名字交上去。
3. **skill 本身是不受信任的内容**。`SKILL.md` 里可能藏指令或外联脚本，装之前扫一眼；不要盲目 `npx skills add` 一个"1000 个 skill 大合集"。
4. **不要一次装太多**。skill 太多会互相冲突、抢占上下文，反而让 Agent 变笨。按阶段装：设计阶段 → AI 能力阶段 → 交付阶段。
5. **别把"我们用了哪些 skill"当创新点写**。skill 是提效工具，评审看的是你自己的技术方案（Agent 架构、RAG 检索策略、Prompt 设计、兜底机制）。装完 skill 必须**真正跑通并理解代码**，否则答辩一问就穿。
6. **建议下一步**：把第 7 节的 8 个仓库 `git clone --depth 1` 下来，逐个打开 `SKILL.md` 确认内容和许可证（MIT / Apache-2.0 最稳），再决定装哪些。

---

## 9. 附录：长尾条目（全部为 ⚠️ / ❓，按需自取）

### 9.1 合集与索引（还想扩大搜索面时）

| 仓库 | 说明 |
| --- | --- |
| [Pupok462/awesome-claude-code-skills](https://github.com/Pupok462/awesome-claude-code-skills) | 中文 50+ 精选，按场景分类 + 推荐等级，选型效率高 |
| [enhansome/enhansome-claude-code-skills-zh](https://github.com/enhansome/enhansome-claude-code-skills-zh) | 中文 Claude Code Skills 索引 |
| [Delphoa/study-awesome-harness-engineering](https://github.com/Delphoa/study-awesome-harness-engineering) | harness 工程 awesome list：**evals、memory、MCP、permissions、observability、orchestration**，逐条对应 35% 技术深度，**适合写技术文档时做论证引用** |
| [sickn33/agentic-awesome-skills](https://github.com/sickn33/agentic-awesome-skills) | 大合集，newreleases 显示已到 v15.12.0，维护活跃 |
| [philipbankier/awesome-agent-skills](https://github.com/philipbankier/awesome-agent-skills) · [khasky/awesome-agent-skills](https://github.com/khasky/awesome-agent-skills) · [seb1n/awesome-ai-agent-skills](https://github.com/seb1n/awesome-ai-agent-skills) | 英文策展清单，跨平台（含 MCP servers、Cursor rules） |
| [aiskillstore/marketplace](https://github.com/aiskillstore/marketplace) | 技能市场，部分技能的镜像来源 |
| [majiayu000/claude-skill-registry](https://github.com/majiayu000/claude-skill-registry) | 技能注册表（含 `dev-test-playwright` 等测试技能） |
| [SimHacker/moollm](https://github.com/SimHacker/moollm) | 内含 Anthropic 官方技能目录镜像清单，可离线查阅（完整度未确认） |

### 9.2 AI 能力侧补充

| Skill | 来源 | 说明 |
| --- | --- | --- |
| `llm-structured-output` | [bouclem/skills](https://github.com/bouclem/skills) | **结构化输出 / Function Calling schema**（比赛"输出稳定可控"直接相关） |
| `structured-output` | [Zaveli/structured-output](https://github.com/Zaveli/structured-output) | 结构化输出（仓库细节未确认 ❓） |
| `guardrails-and-safety` | [cobusgreyling/agent-skills](https://skillsmp.com/creators/cobusgreyling/agent-skills/skills-guardrails-and-safety) | 护栏与安全（仓库归属未确认 ❓） |
| Trident-SecOps-Skills（24 个） | [Garyson26/Trident-SecOps-Skills](https://github.com/Garyson26/Trident-SecOps-Skills) | 安全能力集，含 **prompt improvement** |
| `observability` | [nikita-voloshyn/buyo-traffic](https://skillsmp.com/creators/nikita-voloshyn/buyo-traffic/claude-skills-observability) | 可观测性（仓库归属未确认 ❓） |

### 9.3 前端侧补充

| Skill | 来源 | 说明 |
| --- | --- | --- |
| `nextjs-mastery` | [rohitg00/awesome-claude-code-toolkit](https://github.com/rohitg00/awesome-claude-code-toolkit) | Next.js 精通 |
| `nextjs-app-router-patterns` | [ranbot-ai/awesome-skills](https://github.com/ranbot-ai/awesome-skills) | App Router 模式 |
| React/Next.js 性能 + UI 审计 + 部署 | [karon-hyppolite/agent-skills](https://github.com/karon-hyppolite/agent-skills) | 一站式 |
| `typescript` | [kimtth/agent-skill-100-lines-or-less](https://github.com/kimtth/agent-skill-100-lines-or-less) | TypeScript 规范 |
| `state-management` | [akillness/skills-template](https://github.com/akillness/skills-template) | 状态管理 |
| `perf-analyzer` | [hardikpandya/perf-analyzer](https://github.com/hardikpandya/perf-analyzer) | 性能分析 |
| `correctness-and-error-handling` | [cognitedata/builder-skills](https://github.com/cognitedata/builder-skills) | 正确性与错误处理 |
| `shadcn-labs/skills` | [shadcn-labs/skills](https://github.com/shadcn-labs/skills) | Shadcn Labs 自用 skill 集 |
| `design-tokens` | [oyi77/1ai-skills](https://github.com/oyi77/1ai-skills) | 设计 token |
| `ui-design-system` | [samhvw8/dot-claude](https://github.com/samhvw8/dot-claude) | UI 设计系统 |
| `shadcn-ui` | [podo/design-agent-skills](https://github.com/podo/design-agent-skills) | shadcn/ui 组件规范 |
| `web-accessibility` | [akillness/jeo-skills](https://github.com/akillness/jeo-skills) | 无障碍 |
| `accessibility-auditor` | [Wesleysmits/agent-skills](https://github.com/Wesleysmits/agent-skills) | 无障碍审计 |
| `accessibility-audit` | [kumaran-is/claude-code-onboarding](https://github.com/kumaran-is/claude-code-onboarding) | 无障碍审计 |
| `skills/motion` | [oakoss/agent-skills](https://github.com/oakoss/agent-skills) · [jezweb/claude-skills](https://github.com/jezweb/claude-skills) | 动效 |
| `threejs` | [mrgoonie/claudekit-skills](https://github.com/mrgoonie/claudekit-skills) | Three.js |
| `e2e-webapp-testing` | [johnmungandiall/kbcodev-skills](https://github.com/johnmungandiall/kbcodev-skills) | E2E 测试 |
| `vercel-deploy` | [Dokhacgiakhoa/Agent-Skills-4-Vibe-Coding-CLI](https://github.com/Dokhacgiakhoa/Agent-Skills-4-Vibe-Coding-CLI) | Vercel 部署 |
| `voice-agent-skills` | [RobStrayer/voice-agent-skills](https://github.com/RobStrayer/voice-agent-skills) | AI 语音 agent 设计与对话体验（偏整体设计） |
| `cv-webapp-starter` | [hipson47/hipson](https://skillsmp.com/de/creators/hipson47/hipson/skills-computer-vision-cv-webapp-starter) | 计算机视觉 Web 应用脚手架 |
| `07-mediapipe-tracking` | [aeren23/image-processing-skills](https://skillsmp.com/zh/creators/aeren23/image-processing-skills/skills-07-mediapipe-tracking) | MediaPipe 追踪（未确认 ❓） |

---

## 10. 本机安装约束（实测）

> **硬性要求（用户指定）：一切安装不得落到 C 盘。** C 盘 200 GB 只剩 33 GB，D 盘 275 GB 剩 171 GB。

### 各路径实测落点

| 路径 | 实际位置 | 盘 | 结论 |
| --- | --- | --- | --- |
| DSH 技能库 `~\.dsh\skills` | junction → `D:\dsh-skills` | **D** ✅ | 新 skill 装这里，天然满足要求 |
| npm cache | `D:\npm-cache` | **D** ✅ | 没问题 |
| pnpm store | `<工作区>\node_modules\.pnpm-store\v11` | **D** ✅ | 没问题 |
| npm prefix（`-g` 全局目录） | `C:\Users\lt\AppData\Roaming\npm` | **C** ⚠️ | **禁止用 `npm install -g`** |
| TEMP / TMP | `C:\Users\lt\AppData\Local\Temp\dsh-*` | **C** ⚠️ | npx 解包会用到；会话级、自清理。可临时改到 D 盘规避 |
| Codex 技能库 `~\.codex\skills` | 真实目录在 C 盘 | **C** ⚠️ | 不要往这里装 |

### 装机时的注意

1. `npx skills add` 默认装到项目的 `./.claude/skills`，**DSH 不读那里**，需显式指定目标或装完手动移到 `D:\dsh-skills\<skill名>\`。
2. 跑 npx 前先把临时目录改到 D 盘：
   ```powershell
   New-Item -ItemType Directory -Force D:\tmp | Out-Null
   $env:TEMP = 'D:\tmp'; $env:TMP = 'D:\tmp'
   ```
3. **绝不用 `npm install -g`**（落 C 盘）。需要全局 CLI 时用 `pnpm` 或直接 `npx`。
4. 当前沙箱是 workspace-write 模式，写 `D:\dsh-skills` / `D:\npm-cache` 会被拒（实测报 `EPERM ... [sandbox: file access denied]`）——安装时需一次性放宽文件权限。

### 待装机清单（用户确认后再执行）

```bash
npx skills add anthropics/skills --skill mcp-builder
npx skills add hamelsmu/evals-skills
npx skills add borghei/Claude-Skills               # rag-architect
npx skills add Paldom/mcp-server-skills
npx skills add aleph23/Natasha --skill ai-sdk
npx skills add loadingx865-star/dashboard-craft
```

可选：`theultimate-dev/skills`（prompt engineering）、`thedaviddias/ux-patterns-for-developers`（ai-loading / ai-error-states）

**明确不装**：Three.js、GSAP、Framer Motion、移动端相关 —— 场景用不上，且会抢占上下文。

### 本机现有 22 个 skill 的缺口诊断

**已有**：工程方法论 9 个（superpowers 系）· 前端设计 5 个（`frontend-design` 为中文版）· 测试 3 个（playwright 系）· 文档产出 4 个（`cli-anything-wps` 中文）· 代码风格 1 个（`human-code-style` 中文）

**缺口（AI 技术深度 35% 全在这一侧）**：Agent 多步工作流 / 工具调用 / RAG 检索 / 结构化输出 / LLM 评测 / 大模型 API 集成与流式对话 / 数据可视化看板 —— **一个都没有**。

**结论**：审美类、流程类、交付类无需再补；只补 AI 能力侧 6 个即可。

---

## 11. 未覆盖 / 薄弱环节

- **Web Speech API 专项前端 skill**、**MediaPipe 专精 skill**、**Vitest 专项 skill** 均未找到高质量独立仓库（Playwright 侧资源充足）。
- **中文内容过滤 / 敏感词审核 / 合规兜底**的成体系 skill 仓库未找到，现有均为英文 guardrails / red-team 类 → 对应"AI 安全与内容治理"选题方向，**建议自研，反而是创新点**。
- **独立"流式输出"专属 skill** 不存在，只作为 AI SDK 技能的组成部分出现。
- 「AI 社交与社区」方向缺乏现成领域 skill，建议自研。
- 所有 ❓ / ⚠️ 条目的**仓库真实性与内容深度未经逐文件核实**，使用前请自行打开确认。
- 本次调研中 `raw.githubusercontent.com` / `api.github.com` 在当前网络环境不可达，无法批量拉取仓库文件做逐条核对。**建议下一步在能联网的环境里 `git clone --depth 1` 把第 7 节的 8 个仓库拉下来逐个确认**。
