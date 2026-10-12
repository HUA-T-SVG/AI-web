import { ToolLoopAgent, isStepCount, type InferAgentUIMessage } from 'ai';
import { getChatModel } from './provider';
import { SYSTEM_INSTRUCTIONS } from './prompt';
import { agentTools } from './tools';

/**
 * 步数上限。
 *
 * 有了「工具不带 execute」这条机制，本轮循环在第一次工具调用后就会停下，
 * 所以这个上限平时碰不到 —— 它的作用是兜底：万一某个模型在一步里既输出
 * 文本又反复发起调用，不至于无限循环烧 token。
 */
const MAX_STEPS = 8;

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
