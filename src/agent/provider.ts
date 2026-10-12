import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

/**
 * 服务端模型客户端。
 *
 * 全项目只有这一处读 LLM_* 环境变量。集中在一处有两个作用：换供应商时
 * 只改这个文件；以及不会有人顺手在客户端组件里读它 —— 那几个变量没有
 * NEXT_PUBLIC_ 前缀，Next.js 不会把它们打进客户端包。
 */

/** 三个变量缺一不可。缺了就不是「降级运行」，而是这个功能根本没法用。 */
export function isLlmConfigured(): boolean {
  return Boolean(process.env.LLM_API_KEY && process.env.LLM_BASE_URL && process.env.LLM_MODEL);
}

/**
 * 没配置时给用户看的指引。
 *
 * 写清「缺哪一项」「去哪儿补」—— 只抛一句「未配置大模型」的话，
 * 用户既不知道该动哪个文件，也不知道改完要不要重启。
 */
export function llmConfigHint(): string {
  const missing = [
    !process.env.LLM_API_KEY && 'LLM_API_KEY',
    !process.env.LLM_BASE_URL && 'LLM_BASE_URL',
    !process.env.LLM_MODEL && 'LLM_MODEL',
  ].filter(Boolean);

  return `AI 分析需要先配置大模型接口，当前缺少：${missing.join('、')}。请在项目根目录的 .env.local 里补齐（可参照 .env.example），然后重启开发服务器。`;
}

export function getChatModel() {
  if (!isLlmConfigured()) {
    // 不返回一个到调用时才崩的假对象：早失败早报错。
    // 否则用户看到的是「流了一半断掉」这种没法诊断的现象。
    throw new Error(llmConfigHint());
  }

  const provider = createOpenAICompatible({
    name: 'llm',
    baseURL: process.env.LLM_BASE_URL as string,
    apiKey: process.env.LLM_API_KEY as string,
    // 让流式响应也带上 token 用量。评测体系的 L5 要统计单次分析的
    // token 消耗与成本，不打开这个开关，流式调用就拿不到用量。
    includeUsage: true,
  });

  return provider.chatModel(process.env.LLM_MODEL as string);
}
