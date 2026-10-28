import { z } from 'zod';
import { checkPlanSchema, clarificationSchema, issueSchema } from './schemas';

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
  /**
   * 检索领域规则库。
   *
   * 为什么需要它：学科口径与编码标准既无法通过微调获得，也不适合硬编码进 Prompt
   * （设计文档 §5.4 的「预答」）。检索结果里含规则正文与来源，供模型在给出
   * 判断时引用依据。
   */
  query_rules: z.object({
    query: z
      .string()
      .min(1)
      .max(200)
      .describe('检索意图，通常由列名与该列的取值分布拼成，例如「学历 硕士 研究生 本科」'),
    columns: z
      .array(z.string())
      .optional()
      .describe('当前相关的列名。列名命中规则声明的别名时会加权，这是最可靠的信号'),
    subject: z
      .string()
      .min(1)
      .optional()
      .describe(
        '当前数据的学科，可选。取值必须是规则库里真实存在的学科名 —— ' +
          '传了该学科的条目会排得更前，传错会被拦下并告知可用的有哪些。' +
          '不确定就不要传：不传时全部学科的规则都可被召回，只是不做加权',
      ),
  }),
  /**
   * 向用户追问。
   *
   * 与其他工具的区别：不执行计算、不产生业务结果，只把一次工具调用变成
   * 界面的暂停点。所以它必须单独占一步，客户端也刻意不回填结果。
   */
  ask_clarification: clarificationSchema,
} as const;

export type ToolName = keyof typeof TOOL_INPUT_SCHEMAS;
