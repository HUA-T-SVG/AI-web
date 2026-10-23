import { describe, it, expect } from 'vitest';
import { normalizeLlmError } from './errors';

describe('大模型错误归一化', () => {
  it('限流说明可以等一会儿重试', () => {
    const result = normalizeLlmError(new Error('429 Too Many Requests'));

    expect(result.title).toContain('频繁');
    expect(result.retryable).toBe(true);
  });

  it('本站自己的限流不会被说成「模型服务限流」——两者用户能做的事不同', () => {
    // 服务端返回 429 时 body 里是这句话；SDK 会把它带进 error.message
    const result = normalizeLlmError(
      new Error('AI_APICallError: 本站的演示额度有限：短时间内请求次数过多，请约 30 秒后再试'),
    );

    expect(result.title).toContain('频繁');
    // 关键：不能说成模型服务的问题 —— 用户去等模型恢复会白等
    expect(result.detail).toContain('不是模型服务的问题');
    expect(result.detail).not.toContain('额度已用完');
    expect(result.retryable).toBe(true);
  });

  it('密钥无效说明去哪儿改，并标成不可重试', () => {
    const result = normalizeLlmError(new Error('401 Unauthorized'));

    expect(result.detail).toContain('.env.local');
    // 重试一百次也是同样的结果，让用户白点更糟
    expect(result.retryable).toBe(false);
  });

  it('余额不足要说明是充值问题，不是重试问题', () => {
    const result = normalizeLlmError(new Error('402 Insufficient Balance'));

    expect(result.title).toContain('额度');
    expect(result.detail).toContain('充值');
    expect(result.retryable).toBe(false);
  });

  it('上下文超限说明可以少分析几列', () => {
    const result = normalizeLlmError(new Error('context_length_exceeded'));

    expect(result.detail).toContain('列');
    expect(result.retryable).toBe(false);
  });

  it('网络中断标记为可重试', () => {
    expect(normalizeLlmError(new Error('fetch failed')).retryable).toBe(true);
    expect(normalizeLlmError(new Error('ECONNRESET')).retryable).toBe(true);
    expect(normalizeLlmError(new Error('request timeout')).retryable).toBe(true);
  });

  it('模型名写错时指出是配置问题', () => {
    const result = normalizeLlmError(new Error('404 model not found'));

    expect(result.detail).toContain('LLM_MODEL');
    expect(result.retryable).toBe(false);
  });

  it('历史里残留工具调用时，说明是上一次中断而不是模型故障', () => {
    // 真实现场：流断在工具调用之后，再点「从执行检查重试」就报这句英文；
    // 用户以为是模型坏了，实际是历史消息缺 tool-result、请求根本没发出去
    const result = normalizeLlmError(
      new Error(
        'Tool results are missing for tool calls call_00_abc, call_01_def. ' +
          'Please add tool results for all tool calls before sending the next message.',
      ),
    );

    expect(result.title).toContain('上一次分析');
    expect(result.detail).toContain('中断');
    expect(result.detail).not.toContain('余额');
    expect(result.retryable).toBe(true);
  });

  it('认不出的错误原样保留，不吞掉信息', () => {
    // 套一句「调用失败」会把排查线索也一起丢掉，而我们自己也可能没见过这个错
    const result = normalizeLlmError(new Error('某个没见过的错误'));

    expect(result.detail).toContain('某个没见过的错误');
  });

  it('非 Error 值也能处理，不抛异常', () => {
    for (const value of ['字符串错误', null, undefined, 42, { reason: '对象' }]) {
      expect(() => normalizeLlmError(value)).not.toThrow();
    }
  });

  it('每种结果都有标题与说明，不会给出空文案', () => {
    const samples = [
      new Error('429'),
      new Error('401'),
      new Error('402'),
      new Error('context_length_exceeded'),
      new Error('fetch failed'),
      new Error('随便什么'),
    ];

    for (const sample of samples) {
      const result = normalizeLlmError(sample);
      expect(result.title.length).toBeGreaterThan(0);
      expect(result.detail.length).toBeGreaterThan(0);
    }
  });
});
