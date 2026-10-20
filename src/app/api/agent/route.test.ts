import { describe, it, expect, vi, afterEach } from 'vitest';

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  // 限流器是模块级单例：不重置的话，一个用例调的额度会漏给下一个
  const { resetAgentRateLimitForTest } = await import('./route');
  resetAgentRateLimitForTest();
});

function makeRequest(body: string): Request {
  return new Request('http://localhost/api/agent', { method: 'POST', body });
}

function stubConfigured() {
  // 密钥必须是纯 ASCII：它会被塞进 Authorization 请求头，
  // 用中文当假密钥会让请求在构造请求头时就抛 ByteString 错误，
  // 于是测试「通过」了，但走的根本不是它想测的那条路径。
  vi.stubEnv('LLM_API_KEY', 'sk-test-key');
  vi.stubEnv('LLM_BASE_URL', 'https://api.example.com');
  vi.stubEnv('LLM_MODEL', 'test-model');
}

function stubUnconfigured() {
  vi.stubEnv('LLM_API_KEY', '');
  vi.stubEnv('LLM_BASE_URL', '');
  vi.stubEnv('LLM_MODEL', '');
}

describe('流式接口 · 配置检查', () => {
  it('未配置密钥时返回 503 与中文指引，而不是 500', async () => {
    stubUnconfigured();
    const { POST } = await import('./route');

    const response = await POST(makeRequest(JSON.stringify({ messages: [] })));

    // 503 而不是 500：这是「服务没配好」，用户自己能修；
    // 500 会让人以为代码坏了，只能等我们修
    expect(response.status).toBe(503);
    const body = (await response.json()) as { error: string };
    expect(body.error).toContain('LLM_API_KEY');
    expect(body.error).toContain('.env.local');
  });

  it('只缺其中一项时，指引里只列缺的那一项', async () => {
    vi.stubEnv('LLM_API_KEY', 'sk-test-key');
    vi.stubEnv('LLM_BASE_URL', '');
    vi.stubEnv('LLM_MODEL', 'test-model');
    const { POST } = await import('./route');

    const body = (await (await POST(makeRequest(JSON.stringify({ messages: [] })))).json()) as {
      error: string;
    };

    expect(body.error).toContain('LLM_BASE_URL');
    expect(body.error).not.toContain('LLM_API_KEY');
  });
});

describe('流式接口 · 请求校验', () => {
  it('请求体不是合法 JSON 时给出明确说明', async () => {
    stubConfigured();
    const { POST } = await import('./route');

    const response = await POST(makeRequest('这不是 JSON'));

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toContain('JSON');
  });

  it('缺少 messages 字段时返回 400', async () => {
    stubConfigured();
    const { POST } = await import('./route');

    const response = await POST(makeRequest(JSON.stringify({ 别的字段: 1 })));

    expect(response.status).toBe(400);
  });

  it('messages 不是数组时返回 400', async () => {
    stubConfigured();
    const { POST } = await import('./route');

    const response = await POST(makeRequest(JSON.stringify({ messages: '不是数组' })));

    expect(response.status).toBe(400);
  });
});

describe('流式接口 · 正常路径', () => {
  const userMessage = {
    messages: [{ id: '1', role: 'user', parts: [{ type: 'text', text: '开始分析' }] }],
  };

  it('配置齐全且请求合法时返回 SSE 流', async () => {
    stubConfigured();
    // 在网络边界拦掉对模型服务的真实调用：单测不该花钱，也不该依赖外网
    const fetchMock = vi.fn(
      async () =>
        new Response(
          // 最后一段带 usage：验证「finish 时把 token 用量随 message-metadata 带回」。
          // 不带 usage 的供应商是允许的（客户端会显示未知），但这条路径必须被覆盖
          'data: {"choices":[{"delta":{"content":"好"}}]}\n\n' +
            'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":12,"completion_tokens":7,"total_tokens":19}}\n\n' +
            'data: [DONE]\n\n',
          {
            status: 200,
            headers: { 'content-type': 'text/event-stream' },
          },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { POST } = await import('./route');

    const response = await POST(makeRequest(JSON.stringify(userMessage)));

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('event-stream');

    // 必须把响应体读掉：流式响应是惰性的，不消费它，模型请求根本不会发起。
    // 只查响应头会让这条测试在「请求压根没出门」的情况下也变绿。
    const streamed = await response.text();

    expect(fetchMock).toHaveBeenCalled();
    expect(streamed.length).toBeGreaterThan(0);
    // 模型吐的字要真的流到客户端，而不只是建立了一条空管道
    expect(streamed).toContain('好');
    // T2：usage 必须随 finish 块的 messageMetadata 出来，否则 L4 的真实成本又只能靠估算
    const chunks = streamed
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .filter((payload) => payload !== '' && payload !== '[DONE]')
      .map((payload) => JSON.parse(payload) as { type: string; messageMetadata?: unknown });
    const finish = chunks.find((chunk) => chunk.type === 'finish');
    expect(finish).toBeDefined();
    expect(finish?.messageMetadata).toEqual({
      usage: expect.objectContaining({ inputTokens: 12, outputTokens: 7, totalTokens: 19 }),
    });
  });

  it('模型服务连不上时给出可读说明，而不是抛异常', async () => {
    stubConfigured();
    const fetchMock = vi.fn(async () => {
      throw new Error('fetch failed');
    });
    vi.stubGlobal('fetch', fetchMock);
    const { POST } = await import('./route');

    const response = await POST(makeRequest(JSON.stringify(userMessage)));

    // 流式接口的大模型调用是惰性的，错误可能以两种形态出现：
    // 直接拒绝（502）或进入流内（200 + 流里的错误）。两种都不该变成
    // 一句无信息的 500，所以这里接受任一形态，但内容必须可读。
    // 注意断言顺序：必须先消费响应体，请求才真的发出去。
    if (response.status === 502) {
      const body = (await response.json()) as { error: string };
      expect(fetchMock).toHaveBeenCalled();
      // 断言真正由 reason 决定的部分。原先只断言 '.env.local'，
      // 而那句话是 route.ts 里硬编码的 —— 无论错误归一化是否工作都必然通过
      expect(body.error).toContain('fetch failed');
      expect(body.error).toContain('.env.local');
    } else {
      expect(response.status).toBe(200);
      const text = await response.text();
      expect(fetchMock).toHaveBeenCalled();
      expect(text).toContain('fetch failed');
    }
  });
});

describe('流式接口 · 限流', () => {
  const userMessage = {
    messages: [{ id: '1', role: 'user', parts: [{ type: 'text', text: '开始分析' }] }],
  };

  function mockModelOnce(): void {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response('data: {"choices":[{"delta":{"content":"好"}}]}\n\ndata: [DONE]\n\n', {
            status: 200,
            headers: { 'content-type': 'text/event-stream' },
          }),
      ),
    );
  }

  it('超过额度时返回 429 + 可执行的中文，而不是让用户去等模型', async () => {
    stubConfigured();
    mockModelOnce();
    const { POST, configureAgentRateLimitForTest } = await import('./route');
    configureAgentRateLimitForTest({ max: 2, windowMs: 60_000 });

    // 前两次照常
    for (const attempt of [1, 2]) {
      const response = await POST(makeRequest(JSON.stringify(userMessage)));
      expect(response.status, `第 ${attempt} 次应当放行`).toBe(200);
      await response.text();
    }

    const blocked = await POST(makeRequest(JSON.stringify(userMessage)));
    expect(blocked.status).toBe(429);
    // Retry-After 要有：客户端/代理据此退避，而不是立刻重试再被拒
    const retryAfter = Number(blocked.headers.get('retry-after'));
    expect(Number.isFinite(retryAfter)).toBe(true);
    expect(retryAfter).toBeGreaterThan(0);

    const body = (await blocked.json()) as { error: string };
    // 说清「是本站限制、不是模型坏了」—— 两种原因用户能做的事不同
    expect(body.error).toContain('本站的演示额度');
    expect(body.error).toContain('不是模型服务出错');
  });

  it('窗口过后恢复（按真实时钟走，不睡：只验证响应里给出了等待时长）', async () => {
    stubConfigured();
    mockModelOnce();
    const { POST, configureAgentRateLimitForTest } = await import('./route');
    // 窗口设成 1 秒：等它过去再发一次，验证「不是永久封禁」
    configureAgentRateLimitForTest({ max: 1, windowMs: 1_000 });

    await (await POST(makeRequest(JSON.stringify(userMessage)))).text();
    const blocked = await POST(makeRequest(JSON.stringify(userMessage)));
    expect(blocked.status).toBe(429);

    await new Promise((resolve) => setTimeout(resolve, 1_100));

    const recovered = await POST(makeRequest(JSON.stringify(userMessage)));
    expect(recovered.status).toBe(200);
    await recovered.text();
  });
});
