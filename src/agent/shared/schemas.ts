import { z } from 'zod';
import type { CleaningAction } from '@/core';

/**
 * 大模型输出的运行时契约。
 *
 * 这一层存在的理由只有一条：**大模型返回的是字符串**。TypeScript 的类型在
 * 运行时不存在，没有 Zod，一个多余的解释性前缀就会让整条链路崩在 JSON.parse
 * 上，而报错是「Unexpected token」这种没人看得懂的东西。
 *
 * 依赖方向：**agent → core，不能反过来**。清洗动作的类型契约归 core
 * （`core/cleaning/types.ts`），因为 core 要能被浏览器与将来的 MCP Server
 * 共用，不该依赖编排层。这里保留 `CleaningAction` 的再导出只是为了不改
 * 一堆既有 import 路径，**真源在 core**。
 */

/** 各文本字段的长度上限，见 issueSchema 上方的说明。 */
const MAX_TITLE = 60;
const MAX_DESCRIPTION = 300;
const MAX_RATIONALE = 200;

export const cleaningActionSchema = z.object({
  action: z.string().min(1),
  // 默认空对象：「删除重复行」这类动作本来就没有参数，
  // 强迫模型输出 params: {} 只是多一个能让整条链路崩掉的失败点
  params: z.record(z.string(), z.unknown()).default({}),
  /** 为什么建议这么做。用户要据此决定接不接受，不能是空话。 */
  rationale: z.string().min(1).max(MAX_RATIONALE),
  /** 受影响的列，界面用来定位到具体数据 */
  columns: z.array(z.string()),
});

/**
 * 把这份 schema 钉在 core 的类型契约上。
 *
 * **schema 是运行时校验，类型是编译期契约，两者必须一致**：只把类型搬进 core
 * 而不管 schema，就会出现「校验的和执行的不是同一个形状」——而这种漂移
 * 不会有任何运行时报错，只会在某天某个字段悄悄丢掉时才发现。
 * 写成 `satisfies` 而不是给 schema 标类型：前者在编译期检查形状一致，
 * 同时保留各自的推断结果。
 */
export const _cleaningActionShape = cleaningActionSchema satisfies z.ZodType<CleaningAction>;

/**
 * 一条问题。这也是「提交」工具的输入契约 —— 模型一次提交一条。
 *
 * 各文本字段都设了长度上限，而且这份 schema 是**单条**问题用的。
 * 两件事都为了压住一次工具调用的载荷。实测过：把整份报告（多条问题、
 * 每段描述都很长）塞进一次调用，工具输入会流不完、永远停在
 * input-streaming，用户一条结论都拿不到；改成一次一条就正常。
 * 上限不是洁癖，是这条链路的可靠性边界。
 *
 * `checkId` 与 `columns` 的合法性由 `toolExecutors.ts` 在执行器里校验，
 * 不在这里用 z.enum —— 那边的报错是中文的「不存在的检查项 X。当前可用：…」，
 * 模型下一轮才知道怎么改；Zod 的英文报错做不到这件事。
 */
export const issueSchema = z.object({
  checkId: z.string().min(1),
  severity: z.enum(['high', 'medium', 'low']),
  title: z.string().min(1).max(MAX_TITLE),
  description: z.string().min(1).max(MAX_DESCRIPTION),
  columns: z.array(z.string()),
  rowIndices: z.array(z.number().int().nonnegative()).optional(),
  // 必填：只说「这里有问题」而不给处理办法，用户看完还是不知道下一步做什么
  suggestion: cleaningActionSchema,
  confidence: z.number().min(0).max(1),
});

export type Issue = z.infer<typeof issueSchema>;
/** 真源在 `core`（见文件头）。这里再导出，只是让既有 import 路径不必全改。 */
export type { CleaningAction };

/**
 * 检查计划（spec §5.2 阶段 2 的产物、§6.2 的 CheckPlan）。
 *
 * 上限 8 条与 `submit_issue` 同一个理由：一次工具调用的载荷要小。
 * 实测过整份报告塞进一次调用会流不完 —— 计划同理，条目越多越容易卡在
 * `input-streaming`，而计划卡住的后果是用户连「AI 打算做什么」都看不到。
 */
export const checkPlanSchema = z.object({
  /** LLM 的规划理由，向用户展示。没有它，计划就成了一个没来由的清单 */
  reasoning: z.string().min(1).max(400),
  checks: z
    .array(
      z.object({
        checkId: z.string().min(1),
        /** 限定目标列；空数组表示整表 */
        targetColumns: z.array(z.string()).default([]),
        /** 为什么查这一项 —— 要具体到列名与现象，不能是「检查数据质量」这种空话 */
        reason: z.string().min(1).max(120),
        priority: z.enum(['high', 'medium', 'low']),
      }),
    )
    .min(1)
    .max(8),
});

export type CheckPlan = z.infer<typeof checkPlanSchema>;
