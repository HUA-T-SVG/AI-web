import { z } from 'zod';

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
    columns: z
      .array(z.string())
      .optional()
      .describe('限定只在这几列上运行；不传表示跑全表'),
  }),
  describe_column: z.object({
    column: z.string().min(1).describe('列名，必须与数据里的列名完全一致'),
  }),
} as const;

export type ToolName = keyof typeof TOOL_INPUT_SCHEMAS;
