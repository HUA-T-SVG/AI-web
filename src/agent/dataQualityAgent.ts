import { ToolLoopAgent, isStepCount, type InferAgentUIMessage } from 'ai';
import { getChatModel } from './provider';
import { SYSTEM_INSTRUCTIONS } from './prompt';
import { agentTools } from './tools';

/**
 * 步数上限。
 *
 * 用 SDK 的默认值 20，不收紧。原计划设 8，理由是「正常 3–5 步就该定下来」——
 * 真实模型推翻了这个估计：它会逐列 describe_column，一次分析很容易用满 8 步，
 * 而第 8 步恰好是 submit_issues 时，工具输入会被从中间截断，
 * 结果停在 input-streaming，用户一条结论都拿不到。
 *
 * 所以「别乱查」要靠指令去引导，不能靠把上限压到刚好够用来卡 ——
 * 卡住的代价是整次分析作废。
 */
const MAX_STEPS = 20;

/**
 * 构造数据质量分析 Agent。
 *
 * 做成工厂函数而不是模块级常量，是因为 getChatModel() 在未配置密钥时会抛错。
 * 模块级构造会让任何 import 它的文件在导入阶段就炸 —— 接口层连「返回 503
 * 并给出配置指引」的机会都没有，用户看到的会是一整页 500。
 *
 * 构造本身很轻（只是记住设置），不需要缓存。
 */
export function createDataQualityAgent() {
  return new ToolLoopAgent({
    model: getChatModel(),
    instructions: SYSTEM_INSTRUCTIONS,
    tools: agentTools,
    stopWhen: isStepCount(MAX_STEPS),
  });
}

/** 客户端 useChat 的消息类型，从 Agent 定义推导，保证两边工具名一致。 */
export type AgentUIMessage = InferAgentUIMessage<ReturnType<typeof createDataQualityAgent>>;
