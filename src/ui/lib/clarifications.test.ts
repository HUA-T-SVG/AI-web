import { describe, it, expect } from 'vitest';
import {
  CLARIFICATION_DANGLING_TEXT,
  CLARIFICATION_STEP_VIOLATION_TEXT,
  applyDraft,
  buildClarificationOutput,
  clarificationSharesStep,
  clarificationUsedInCurrentRun,
  emptyDrafts,
  pendingClarificationOf,
  type ClarificationMessageLike,
  type ClarificationPartLike,
} from './clarifications';

const CLARIFY_INPUT = {
  questions: [{ question: '「重点」指什么？', options: ['重点高中', '省重点'] }],
};

const user = (text = ''): ClarificationMessageLike => ({
  role: 'user',
  parts: [{ type: 'text', text }],
});
/** 「开始分析」发出的那条消息：带结构摘要标记，是追问预算的轮次起点 */
const analysisUser = (): ClarificationMessageLike =>
  user('<数据集摘要>\n规模：2 行 × 2 列\n</数据集摘要>');
const assistant = (parts: ClarificationPartLike[]): ClarificationMessageLike => ({
  role: 'assistant',
  parts,
});
const askPart = (state: string, toolCallId = 'c-clarify'): ClarificationPartLike => ({
  type: 'tool-ask_clarification',
  state,
  toolCallId,
  input: CLARIFY_INPUT,
});

describe('待回答的追问', () => {
  it('从最后一条助手消息的最后一步取出', () => {
    const pending = pendingClarificationOf([
      user(),
      assistant([
        { type: 'step-start' },
        { type: 'text' },
        { type: 'tool-plan_checks', state: 'output-available', toolCallId: 'c-plan' },
        { type: 'step-start' },
        askPart('input-available', 'c-ask'),
      ]),
    ]);

    // 前面那一步的问句不该被当成待回答 —— 只看最后一个 step-start 之后
    expect(pending).toEqual({ toolCallId: 'c-ask', questions: CLARIFY_INPUT.questions });
  });

  it('已经回填过结果的追问不再是待回答', () => {
    expect(pendingClarificationOf([user(), assistant([askPart('output-available')])])).toBeNull();
  });

  it('被拒绝或出错的追问不再是待回答', () => {
    expect(pendingClarificationOf([user(), assistant([askPart('output-error')])])).toBeNull();
  });

  it('最后一条是用户消息时没有待回答 —— 用户已经改口了', () => {
    // 等待期用户仍可能发消息；那条新消息让工具结果回填失效，追问也随之作废
    expect(
      pendingClarificationOf([user(), assistant([askPart('input-available')]), user()]),
    ).toBeNull();
  });

  it('问题结构不合契约时按没有待回答处理，而不是抛异常', () => {
    expect(
      pendingClarificationOf([
        user(),
        assistant([
          {
            type: 'tool-ask_clarification',
            state: 'input-available',
            toolCallId: 'c-bad',
            input: { questions: [] },
          },
        ]),
      ]),
    ).toBeNull();
  });
});

describe('追问预算：每轮分析最多问一次', () => {
  it('本轮已经答过一次时预算已用', () => {
    expect(
      clarificationUsedInCurrentRun([analysisUser(), assistant([askPart('output-available')])]),
    ).toBe(true);
  });

  it('被拒绝的追问不算用掉预算', () => {
    // 拒绝是界面/校验把它挡回去了，模型还没有真正问过用户
    expect(
      clarificationUsedInCurrentRun([analysisUser(), assistant([askPart('output-error')])]),
    ).toBe(false);
  });

  it('新一轮「开始分析」之后预算归零', () => {
    expect(
      clarificationUsedInCurrentRun([
        analysisUser(),
        assistant([askPart('output-available')]),
        analysisUser(),
      ]),
    ).toBe(false);
  });

  it('计划指令与重试消息不重置预算 —— 它们不是新的一轮', () => {
    // 计划里写明「按此计划执行不重置预算」。若按「最后一条用户消息」计，
    // 用户点一下计划面板就能在同一轮里第二次追问 —— 审查复现过。
    expect(
      clarificationUsedInCurrentRun([
        analysisUser(),
        assistant([askPart('output-available')]),
        user('请按以下计划执行检查：\n1. missing —— 缺失率是否异常'),
      ]),
    ).toBe(true);
  });
});

describe('追问是否单独占一步', () => {
  it('同一步里还有别的工具时算违规', () => {
    expect(
      clarificationSharesStep([
        user(),
        assistant([
          { type: 'step-start' },
          askPart('input-available'),
          { type: 'tool-run_checks', state: 'input-available', toolCallId: 'c-run' },
        ]),
      ]),
    ).toBe(true);
  });

  it('那一步只有追问时不算违规', () => {
    expect(
      clarificationSharesStep([
        user(),
        assistant([
          { type: 'step-start' },
          { type: 'text' },
          askPart('input-available'),
        ]),
      ]),
    ).toBe(false);
  });
});

describe('提交回答', () => {
  it('空题丢弃、已回答的题保持原顺序', () => {
    const built = buildClarificationOutput(
      ['第一题', '第二题', '第三题'],
      ['', '  答案二  ', ''],
    );

    expect(built.ok).toBe(true);
    if (built.ok) {
      expect(built.output.answers).toEqual([{ question: '第二题', answer: '答案二' }]);
      expect(built.output.answeredCount).toBe(1);
      expect(built.output.skipped).toBe(false);
    }
  });

  it('一题都没答时提示可以跳过，而不是把空结果发出去', () => {
    const built = buildClarificationOutput(['第一题', '第二题'], ['', '   ']);

    expect(built.ok).toBe(false);
    if (!built.ok) expect(built.error).toContain('跳过');
  });

  it('单题超过 500 字时明确拒绝，不悄悄截断', () => {
    const built = buildClarificationOutput(['第一题'], ['长'.repeat(501)]);

    expect(built.ok).toBe(false);
    if (!built.ok) expect(built.error).toContain('500');
  });

  it('恰好 500 字是允许的', () => {
    const built = buildClarificationOutput(['第一题'], ['长'.repeat(500)]);

    expect(built.ok).toBe(true);
    if (built.ok) expect(built.output.answers[0]?.answer).toHaveLength(500);
  });
});

describe('草稿与文案', () => {
  it('emptyDrafts 给出指定数量的空草稿', () => {
    expect(emptyDrafts(3)).toEqual(['', '', '']);
  });

  it('applyDraft 不改入参 —— React 状态要的是新数组', () => {
    const drafts = ['', ''];
    const next = applyDraft(drafts, 1, '回答');

    expect(drafts).toEqual(['', '']);
    expect(next).toEqual(['', '回答']);
  });

  it('两条常量都是能直接给用户看的中文', () => {
    expect(CLARIFICATION_STEP_VIOLATION_TEXT).toContain('单独');
    expect(CLARIFICATION_DANGLING_TEXT).toContain('追问');
  });
});
