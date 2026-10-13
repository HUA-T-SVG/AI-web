import { describe, it, expect } from 'vitest';
import {
  dedupeParts,
  derivePhase,
  describeToolPart,
  hasStuckToolCall,
  type PhaseMessageLike,
} from './agentPhase';
import { TOOL_INPUT_SCHEMAS } from '@/agent/shared/toolSchemas';

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
    expect(derivePhase([userMessage(), assistantWith(['tool-run_checks', 'text'])])).toBe(
      'synthesis',
    );
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

describe('卡住的工具调用', () => {
  const assistantWith = (parts: { type: string; state?: string }[]): PhaseMessageLike => ({
    role: 'assistant',
    parts,
  });

  it('流还在继续时不算卡住', () => {
    const messages = [assistantWith([{ type: 'tool-run_checks', state: 'input-streaming' }])];

    expect(hasStuckToolCall(messages, true)).toBe(false);
  });

  it('会话已停、工具却还在等输入，就是卡住了', () => {
    // 真模型实测到的形态：单次工具调用载荷太大时输入流不完，
    // 状态永远停在 input-streaming，onToolCall 从不触发
    const messages = [assistantWith([{ type: 'tool-submit_issue', state: 'input-streaming' }])];

    expect(hasStuckToolCall(messages, false)).toBe(true);
  });

  it('等客户端回填结果的状态也算卡住', () => {
    const messages = [assistantWith([{ type: 'tool-run_checks', state: 'input-available' }])];

    expect(hasStuckToolCall(messages, false)).toBe(true);
  });

  it('工具都拿到结果就不算卡住', () => {
    const messages = [assistantWith([{ type: 'tool-run_checks', state: 'output-available' }])];

    expect(hasStuckToolCall(messages, false)).toBe(false);
  });

  it('失败的调用不算卡住 —— 那是明确的结果，界面另有呈现', () => {
    const messages = [
      assistantWith([{ type: 'tool-run_checks', state: 'output-error' }]),
      assistantWith([{ type: 'tool-run_checks', state: 'output-denied' }]),
    ];

    expect(hasStuckToolCall(messages, false)).toBe(false);
  });

  it('只看最后一条助手消息，历史里的旧状态不重复报警', () => {
    const messages = [
      assistantWith([{ type: 'tool-run_checks', state: 'input-streaming' }]),
      assistantWith([{ type: 'tool-run_checks', state: 'output-available' }]),
    ];

    expect(hasStuckToolCall(messages, false)).toBe(false);
  });

  it('没有助手消息时不报警', () => {
    expect(hasStuckToolCall([], false)).toBe(false);
    expect(hasStuckToolCall([{ role: 'user', parts: [{ type: 'text' }] }], false)).toBe(false);
  });
});

describe('工具部分的文案', () => {
  it('把内部标识换成中文说法', () => {
    expect(describeToolPart('tool-run_checks')).toContain('检查');
    expect(describeToolPart('tool-describe_column')).toContain('列');
    expect(describeToolPart('tool-submit_issue')).toContain('问题');
  });

  it('认不出的工具原样显示，不显示空白', () => {
    // 界面宁可显示一个内部标识，也不要什么都不显示 ——
    // 用户看到空白会以为界面卡住了
    expect(describeToolPart('tool-未来新增的工具')).toContain('未来新增的工具');
  });

  it('每个已登记的工具都有中文文案，一个都不许漏', () => {
    // 漏登记的后果不是「显示得不好看」，而是把内部标识摆到用户眼前：
    // fallback 的产物是「调用工具 plan_checks…」。靠注释提醒没有用 ——
    // Plan 3 新增的两个工具就这么漏了，直到 E2E 才抓出来。这条测试遍历
    // 契约本身，下次加工具时不加文案就直接红。
    for (const toolName of Object.keys(TOOL_INPUT_SCHEMAS)) {
      const label = describeToolPart(`tool-${toolName}`);
      expect(label).not.toContain(toolName);
      expect(label).not.toContain('调用工具');
    }
  });

  it('动态工具用通用文案', () => {
    expect(describeToolPart('dynamic-tool').length).toBeGreaterThan(0);
  });
});

describe('去掉重复的 part', () => {
  it('空数组返回空数组', () => {
    expect(dedupeParts([])).toEqual([]);
  });

  it('没有重复时原样返回，顺序不变', () => {
    const parts = [
      { type: 'text', id: 'a' },
      { type: 'text', id: 'b' },
    ];

    expect(dedupeParts(parts)).toEqual(parts);
  });

  it('同一个文本 id 出现多次只留一个', () => {
    // SDK 在客户端工具续跑时会把每一步的 parts 并进同一条消息，
    // 同一段文本因此会出现好几次 —— 直接渲染就是重复内容
    const parts = [
      { type: 'text', id: 'a', text: '第一版' },
      { type: 'text', id: 'a', text: '第二版' },
    ];

    const result = dedupeParts(parts);
    expect(result).toHaveLength(1);
    // 取最后一次：状态更完整
    expect(result[0]?.text).toBe('第二版');
  });

  it('同一个工具调用只留一张卡，且取最后的状态', () => {
    const parts = [
      { type: 'tool-run_checks', toolCallId: 'c1', state: 'input-available' },
      { type: 'tool-run_checks', toolCallId: 'c1', state: 'output-available' },
    ];

    const result = dedupeParts(parts);
    expect(result).toHaveLength(1);
    expect(result[0]?.state).toBe('output-available');
  });

  it('不同工具调用各自保留', () => {
    const parts = [
      { type: 'tool-run_checks', toolCallId: 'c1', state: 'output-available' },
      { type: 'tool-describe_column', toolCallId: 'c2', state: 'output-available' },
    ];

    expect(dedupeParts(parts)).toHaveLength(2);
  });

  it('位置取第一次出现的地方，不会把内容挪到末尾', () => {
    const parts = [
      { type: 'text', id: 'a', text: '甲' },
      { type: 'tool-run_checks', toolCallId: 'c1', state: 'input-available' },
      { type: 'text', id: 'a', text: '甲更新' },
    ];

    const result = dedupeParts(parts);
    expect(result.map((part) => part.type)).toEqual(['text', 'tool-run_checks']);
    expect((result[0] as { text: string }).text).toBe('甲更新');
  });

  it('没有标识的 part 原样保留，重复也保留', () => {
    // step-start 是步骤分隔，本来就会随步骤出现多次，去掉反而丢信息
    const parts = [{ type: 'step-start' }, { type: 'step-start' }];

    expect(dedupeParts(parts)).toHaveLength(2);
  });
});
