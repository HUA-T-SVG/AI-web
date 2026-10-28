import { listChecks } from '@/core';
import { TOOL_INPUT_SCHEMAS } from '../shared/toolSchemas';

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
  plan_checks: {
    description:
      '开始检查之前，先提交你的检查计划：说明打算查哪些列、为什么。用户会看到这份计划，并可以取消其中几项。' +
      '计划要具体到列名与现象（例如「学历列出现『硕士』与『研究生』两种写法」），不要写「检查数据质量问题」这种空话。' +
      '计划提交后按它执行；用户取消了某几项，就不要跑那几项。',
    inputSchema: TOOL_INPUT_SCHEMAS.plan_checks,
  },
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
  query_rules: {
    description:
      '检索领域规则库，取回与当前列相关的学科口径、编码标准与清洗惯例。' +
      '判断某个字段的取值是否合理、两个类别该不该归并、某个编码是什么含义之前，先查一下 —— ' +
      '这些知识既不在你的训练数据里，也不能靠常识推断。命中结果里带「来源」与「权威度」，' +
      '引用依据时要说明它来自哪一条。',
    inputSchema: TOOL_INPUT_SCHEMAS.query_rules,
  },
  ask_clarification: {
    description:
      '当摘要里没有、但会显著改变结论的领域信息缺失时向用户确认：缺失值编码、单位、量表/满分制、重复测量结构、反向题。' +
      '一次最多 3 题、每题 ≤120 字、选项 ≤6 个。**必须单独占一步**，调用后停下等用户回答（回答后系统自动继续）。' +
      '每轮最多问 1 次；用户跳过时按现有信息继续并调低 confidence。摘要里已有的信息不要重复问。',
    inputSchema: TOOL_INPUT_SCHEMAS.ask_clarification,
  },
} as const;
