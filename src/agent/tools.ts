import { listChecks } from '@/core';
import { TOOL_INPUT_SCHEMAS } from './toolSchemas';

/**
 * 交给大模型的工具定义。
 *
 * 这里刻意不写 execute —— 没有 execute 的工具，AI SDK 不会在服务端执行，
 * 而是终止本轮循环、把工具调用交给客户端。客户端执行完用 addToolOutput
 * 回填，再由 sendAutomaticallyWhen 续跑下一轮。
 *
 * 这条路径是「原始数据不出浏览器」能成立的技术前提：工具一旦有 execute，
 * 数据就必须上传到 Node 侧才能执行。改动前请先看 tools.test.ts 里那条断言。
 *
 * 输入契约从 toolSchemas 取，与浏览器执行器共用同一个对象，
 * 避免「服务端说参数是 A、客户端按 B 解析」这类静默错位。
 */

/**
 * 可用检查项清单，从 core 动态生成。
 *
 * 不写死在这里：Plan 3 补齐单位一致性、类别归并、跨表键之后，
 * 工具描述与阶段 2 的提示会自动跟上，不需要改这个文件。
 */
const availableChecks = listChecks()
  .map((check) => `- ${check.id}（${check.title}）：${check.description}`)
  .join('\n');

export const agentTools = {
  run_checks: {
    description: `在用户浏览器内运行确定性数据质量检查，原始数据不会上传。一次可以传多个检查项。可用检查项：
${availableChecks}`,
    inputSchema: TOOL_INPUT_SCHEMAS.run_checks,
  },
  describe_column: {
    description:
      '读取某一列的详细画像（类型、缺失率、取值分布、数值统计）。需要判断某个字段该怎么处理时用它。',
    inputSchema: TOOL_INPUT_SCHEMAS.describe_column,
  },
  submit_issue: {
    description:
      '提交一条问题，结束当前这条结论。每发现一条问题就调用一次，最多 8 条。检查做得差不多就提交，不要憋到最后 —— 一次只提交一条，各字段都写得简短一些。提交完再用一小段文字总结。',
    inputSchema: TOOL_INPUT_SCHEMAS.submit_issue,
  },
} as const;

export type AgentToolName = keyof typeof agentTools;
