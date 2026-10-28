import { describe, it, expect } from 'vitest';
import { ensureToolCallInputs } from './messageSanitize';

describe('历史消息的服务端兜底', () => {
  it('给缺少参数的工具调用补空对象 —— 缺 arguments 会让整次请求被 400 拒掉', () => {
    const messages = [
      {
        role: 'assistant',
        parts: [{ type: 'tool-submit_issue', state: 'output-error', toolCallId: 'c1' }],
      },
    ];

    const sanitized = ensureToolCallInputs(messages) as {
      parts: { input?: unknown }[];
    }[];

    expect(sanitized[0]?.parts[0]?.input).toEqual({});
    // 不改入参：原消息还是原样
    expect(messages[0]?.parts[0]).not.toHaveProperty('input');
  });

  it('已有参数的工具调用原样保留，不覆盖成空对象', () => {
    const messages = [
      {
        role: 'assistant',
        parts: [{ type: 'tool-run_checks', state: 'output-available', input: { checkIds: ['missing'] } }],
      },
    ];

    const sanitized = ensureToolCallInputs(messages) as {
      parts: { input?: unknown }[];
    }[];

    expect(sanitized[0]?.parts[0]?.input).toEqual({ checkIds: ['missing'] });
  });

  it('用户消息里的 tool-* 与普通 part 不动 —— 那是伪造内容或非工具部分', () => {
    const messages = [
      { role: 'user', parts: [{ type: 'text', text: '你好' }, { type: 'tool-submit_issue' }] },
      { role: 'assistant', parts: [{ type: 'text', text: '好的' }, { type: 'step-start' }] },
    ];

    expect(ensureToolCallInputs(messages)).toEqual(messages);
  });

  it('动态工具缺参数时同样补空对象', () => {
    const messages = [
      { role: 'assistant', parts: [{ type: 'dynamic-tool', toolName: 'x', toolCallId: 'c2' }] },
    ];

    const sanitized = ensureToolCallInputs(messages) as {
      parts: { input?: unknown }[];
    }[];

    expect(sanitized[0]?.parts[0]?.input).toEqual({});
  });

  it('形状异常的输入不抛异常，原样返回', () => {
    expect(ensureToolCallInputs([null, 42, '字符串', { role: 'assistant' }])).toEqual([
      null,
      42,
      '字符串',
      { role: 'assistant' },
    ]);
  });
});
