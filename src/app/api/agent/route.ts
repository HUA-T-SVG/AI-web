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
      // 把本次调用的 token 用量随流带回（原先是 finish 块只有 finishReason）。
      // 为什么要加：L4 评测的真实成本**测不到**，只能按调用次数估算 —— 而「一次分析
      // 花多少钱」是用户会问、答辩会被追问的东西。usage 由供应商在流末尾给出，
      // 这里原样转交，不做换算（单价随模型变，换模型要改的地方越少越好）。
      // 供应商没给 usage 时字段是 undefined：**不要填 0** —— 0 会被读成「不花钱」。
      messageMetadata: ({ part }) =>
        part.type === 'finish' ? { usage: part.totalUsage } : undefined,
      // 助手消息 id 由 SDK 决定，这里**刻意不传 generateMessageId**：传了也是空转。
      // 会话最后一条是助手消息时，SDK 会无条件覆盖它，回上一条助手消息的 id
      // （实测过）。于是规则是：首轮由客户端自己生成 id，续轮回上一条的 id ——
      // 客户端按 id 归并，一轮分析内部始终是同一条助手消息，这正是我们要的。
      // 真要改成服务端发号，得动客户端按 id 归并的那段逻辑，不是加一个选项的事。
      //
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
