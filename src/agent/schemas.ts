import { z } from 'zod';

/**
 * 大模型输出的运行时契约。
 *
 * 这一层存在的理由只有一条：**大模型返回的是字符串**。TypeScript 的类型在
 * 运行时不存在，没有 Zod，一个多余的解释性前缀就会让整条链路崩在 JSON.parse
 * 上，而报错是「Unexpected token」这种没人看得懂的东西。
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
export type CleaningAction = z.infer<typeof cleaningActionSchema>;
