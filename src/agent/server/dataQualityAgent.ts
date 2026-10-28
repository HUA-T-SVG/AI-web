import { ToolLoopAgent, isStepCount, type InferAgentUIMessage } from 'ai';
import { getChatModel } from './provider';
import { SYSTEM_INSTRUCTIONS } from '../shared/prompt';
import { agentTools } from './tools';

/**
 * 步数上限。
 *
 * 原计划设 8，理由是「正常 3–5 步就该定下来」—— 真实模型推翻了这个估计：它会
 * 逐列 describe_column，一次分析很容易用满 8 步，而第 8 步恰好是 submit_issues 时，
 * 工具输入会被从中间截断，结果停在 input-streaming，用户一条结论都拿不到。
 * 所以先放宽到 SDK 默认的 20，靠指令引导「别乱查」。
 *
 * 2026-10-28 线上真实模型又撞了一次：7 项检查 + 逐列画像 + 逐条提交问题，
 * 20 步会在 submit_issue 处截断（紧接着的 400 死循环已另行修复）。所有者拍板
 * 提到 30 —— 代价是多轮历史会累积进输入，单次成本约 +20–40%；换来的是
 * 「该交的结论交得完」。批量提交仍未做，登记在 T11。
 */
const MAX_STEPS = 30;

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
