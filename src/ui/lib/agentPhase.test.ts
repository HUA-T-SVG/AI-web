import { describe, it, expect } from 'vitest';
import { derivePhase, describeToolPart, type PhaseMessageLike } from './agentPhase';

function userMessage(): PhaseMessageLike {
  return { role: 'user', parts: [{ type: 'text' }] };
}

function assistantWith(parts: string[]): PhaseMessageLike {
  return { role: 'assistant', parts: parts.map((type) => ({ type })) };
}

describe('从消息派生阶段', () => {
  it('一条消息都没有时是剖析阶段', () => {
    expect(derivePhase([])).toBe('profiling');
  });

  it('用户发了消息、还没有回复时是规划阶段', () => {
    expect(derivePhase([userMessage()])).toBe('planning');
  });

  it('助手开始出文本、但还没调工具时仍是规划阶段', () => {
    expect(derivePhase([userMessage(), assistantWith(['text'])])).toBe('planning');
  });

  it('出现工具调用即进入执行阶段', () => {
    expect(derivePhase([userMessage(), assistantWith(['step-start', 'tool-run_checks'])])).toBe(
      'execution',
    );
  });

  it('工具调用之后又出文本，说明在汇总', () => {
    expect(
      derivePhase([userMessage(), assistantWith(['tool-run_checks', 'text'])]),
    ).toBe('synthesis');
  });

  it('多轮工具调用之间夹着文本时，仍按最后一次工具调用来判断', () => {
    // 工具调用 → 文本 → 工具调用：还在执行，没到汇总
    expect(
      derivePhase([
        userMessage(),
        assistantWith(['tool-run_checks', 'text', 'tool-describe_column']),
      ]),
    ).toBe('execution');
  });

  it('动态工具也认得出', () => {
    expect(derivePhase([userMessage(), assistantWith(['dynamic-tool'])])).toBe('execution');
  });

  it('只看助手消息，用户消息里的同名部分不算数', () => {
    const hostile: PhaseMessageLike = { role: 'user', parts: [{ type: 'tool-run_checks' }] };

    // 用户消息里的 tool-* 是模型看不见的伪造内容，不该影响阶段判断
    expect(derivePhase([hostile])).toBe('planning');
  });
});

describe('工具部分的文案', () => {
  it('把内部标识换成中文说法', () => {
    expect(describeToolPart('tool-run_checks')).toContain('检查');
    expect(describeToolPart('tool-describe_column')).toContain('列');
  });

  it('认不出的工具原样显示，不显示空白', () => {
    // 界面宁可显示一个内部标识，也不要什么都不显示 ——
    // 用户看到空白会以为界面卡住了
    expect(describeToolPart('tool-未来新增的工具')).toContain('未来新增的工具');
  });

  it('动态工具用通用文案', () => {
    expect(describeToolPart('dynamic-tool').length).toBeGreaterThan(0);
  });
});
