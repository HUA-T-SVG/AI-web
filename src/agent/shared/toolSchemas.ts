import { z } from 'zod';
import { checkPlanSchema, issueSchema } from './schemas';

/**
 * 工具输入契约。
 *
 * 放在 agent/ 而不是 ui/：这是服务端（告诉模型该传什么）与浏览器
 * （照它校验后再执行）之间的契约，归 agent 所有，ui 只是实现方。
 * 反过来放，Node 侧的模块就要去 import 界面目录，层次就乱了。
 *
 * 描述文字会随 schema 一起交给模型，直接影响它填对参数的概率 ——
 * 所以 each 字段都写上「该填什么」，不要省。
 */
export const TOOL_INPUT_SCHEMAS = {
  run_checks: z.object({
    checkIds: z
      .array(z.string())
      .describe('要运行的检查项标识，取值必须是可用检查项之一，可传多个'),
    columns: z.array(z.string()).optional().describe('限定只在这几列上运行；不传表示跑全表'),
  }),
  describe_column: z.object({
    column: z.string().min(1).describe('列名，必须与数据里的列名完全一致'),
  }),
  /**
   * 提交一条问题。
   *
   * 刻意是「一条」而不是「一份报告」：整份报告塞进一次调用时，工具输入会
   * 流不完、永远停在 input-streaming，用户一条结论都拿不到（真模型实测过）。
   * 一次一条，载荷小，而且审阅列表能边查边填。
   */
  submit_issue: issueSchema,
  /**
   * 提交检查计划。
   *
   * spec §5.2 阶段 2 的明文要求：用户要能看到 AI「打算做什么」，并能在执行前干预。
   * 与 `submit_issue` 同一个载荷理由：一次最多 8 条、每条理由 120 字，
   * 够用且不会流不完。
   */
  plan_checks: checkPlanSchema,
} as const;

export type ToolName = keyof typeof TOOL_INPUT_SCHEMAS;
