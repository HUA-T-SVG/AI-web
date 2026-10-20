export interface LlmErrorInfo {
  title: string;
  detail: string;
  /** 重试有没有意义。false 时界面不给重试按钮，免得用户白点。 */
  retryable: boolean;
}

/**
 * 把各家供应商五花八门的报错，收敛成用户能据此行动的三句话。
 *
 * AI 的失败模式不止「请求失败」一种 —— 还有限流、余额耗尽、上下文超限、
 * 流到一半断掉。把它们都显示成「出错了」，用户既不知道能不能重试，
 * 也不知道是不是自己数据的问题。
 *
 * 认不出的错误原样带出来：套一句「调用失败」会把排查线索一起丢掉，
 * 而我们自己也可能没见过这个错。
 */
export function normalizeLlmError(error: unknown): LlmErrorInfo {
  const raw = error instanceof Error ? error.message : String(error);
  const text = raw.toLowerCase();

  // 本站自己的限流（route.ts 返回 429 时带这句话）。**必须排在供应商 429 之前**：
  // 否则「演示额度用完」会被说成「模型服务限流」，用户会去等模型恢复 —— 等多久都没用。
  if (text.includes('本站的演示额度')) {
    return {
      title: '请求太频繁',
      detail: '演示站对每个访客的调用次数有限制，等一会儿再试。这不是模型服务的问题。',
      retryable: true,
    };
  }

  if (text.includes('429') || text.includes('rate limit') || text.includes('too many')) {
    return {
      title: '请求过于频繁',
      detail: '模型服务暂时限流了。等十几秒再试一次；若反复出现，说明当前密钥的额度已用完。',
      retryable: true,
    };
  }

  if (
    text.includes('402') ||
    text.includes('insufficient') ||
    text.includes('balance') ||
    text.includes('quota')
  ) {
    return {
      title: '额度不足',
      detail: '密钥对应的账户余额或额度已经用完，需要到模型平台的账户里充值。重试没有用。',
      retryable: false,
    };
  }

  if (
    text.includes('401') ||
    text.includes('unauthorized') ||
    text.includes('invalid api key') ||
    text.includes('authentication')
  ) {
    return {
      title: '密钥无效',
      detail: '请检查 .env.local 里的 LLM_API_KEY 是否填对、是否已过期；改完需要重启开发服务器。',
      retryable: false,
    };
  }

  if (text.includes('context') && (text.includes('length') || text.includes('exceed'))) {
    return {
      title: '数据摘要太长，超出模型上下文',
      detail:
        '这份数据的列太多。可以先只选一部分列再分析，或改用上下文更大的模型（在 .env.local 里改 LLM_MODEL）。',
      retryable: false,
    };
  }

  if (text.includes('404') || text.includes('model not found') || text.includes('no such model')) {
    return {
      title: '模型标识不对',
      detail:
        '服务端不认识这个模型名。检查 .env.local 里的 LLM_MODEL 是否拼对，以及 LLM_BASE_URL 是否指向了正确的服务。',
      retryable: false,
    };
  }

  if (
    text.includes('fetch failed') ||
    text.includes('econnreset') ||
    text.includes('timeout') ||
    text.includes('etimedout') ||
    text.includes('socket')
  ) {
    return {
      title: '连接模型服务失败',
      detail: '可能是网络不通，或接口地址写错了。检查 .env.local 里的 LLM_BASE_URL 是否可达。',
      retryable: true,
    };
  }

  return {
    title: '调用大模型时出错',
    detail: raw,
    retryable: true,
  };
}
