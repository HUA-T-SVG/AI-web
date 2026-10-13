import { createAgentUIStreamResponse } from 'ai';
import { createDataQualityAgent } from '@/agent/server/dataQualityAgent';
import { isLlmConfigured, llmConfigHint } from '@/agent/server/provider';

/**
 * 大模型调用的最长时间。
 *
 * 一次完整分析要走「规划 → 若干次工具调用 → 汇总」，中间有多次往返。
 * 60 秒留了余量；若目标平台上限更低，改这一个常量即可。
 */
export const maxDuration = 60;

/**
 * 全项目唯一的服务端接口。
 *
 * 它只做三件事：检查配置、校验请求、把流原样转发回去。
 * 它拿不到原始数据 —— 工具在浏览器执行，Node 侧只见结构摘要。
 */
export async function POST(request: Request) {
  if (!isLlmConfigured()) {
    // 503 而不是 500：这是「服务没配好」，用户自己能修；
    // 500 会让人以为代码坏了，只能等我们修
    return Response.json({ error: llmConfigHint() }, { status: 503 });
  }

  let messages: unknown[];
  try {
    const body = (await request.json()) as { messages?: unknown };
    if (!Array.isArray(body.messages)) {
      return Response.json(
        { error: '请求里缺少 messages 字段，或者它不是数组。' },
        { status: 400 },
      );
    }
    messages = body.messages;
  } catch {
    return Response.json({ error: '请求体不是合法的 JSON。' }, { status: 400 });
  }

  try {
    // 必须 await：createAgentUIStreamResponse 返回的是 Promise<Response>，
    // 直接 return 的话它的拒绝会绕过这个 try/catch，用户最终拿到一句
    // 没有信息的 500 —— 排查线索全丢。
    return await createAgentUIStreamResponse({
      agent: createDataQualityAgent(),
      uiMessages: messages,
      // 流已经开始之后才发生的错误（网络中断、供应商限流、上下文超限）
      // 走这里。它们进不了上面的 try/catch，只能在这里变成可读文案。
      onError: (error) =>
        `调用大模型时出错：${error instanceof Error ? error.message : String(error)}`,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return Response.json(
      { error: `调用大模型失败：${reason}。请检查 .env.local 里的接口地址与密钥是否有效。` },
      { status: 502 },
    );
  }
}
