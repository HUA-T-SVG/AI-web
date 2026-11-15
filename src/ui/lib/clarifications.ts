import { clarificationSchema, type Clarification } from '@/agent/shared/schemas';
import { SUMMARY_OPEN } from '@/agent/shared/prompt';
import {
  clarificationOutputForModel,
  MAX_ANSWER_LENGTH,
  type ClarificationToolOutput,
} from '@/agent/shared/outbound';

/**
 * 追问暂停点的派生逻辑 —— 全是纯函数。
 *
 * 暂停状态从消息里派生，不新增 store：与阶段（`agentPhase`）同一个理由。
 * 消息的 parts 序列本身就编码了「模型问过、用户还没答」，再存一份就要靠
 * effect 同步，而同步迟早会漏。
 *
 * **这些函数每次返回新对象 / 新数组，禁止直接塞进 zustand selector**：
 * `planStore.ts` 已经因为 selector 每次返回新数组而白屏过一次，这里不重演。
 */

export interface ClarificationPartLike {
  type: string;
  state?: string;
  toolCallId?: string;
  input?: unknown;
  output?: unknown;
  /** 用户消息里的文本，用来识别「带摘要的开始分析」这条轮次起点 */
  text?: string;
}

export interface ClarificationMessageLike {
  role: string;
  parts: ClarificationPartLike[];
}

export interface PendingClarification {
  toolCallId: string;
  tool: 'ask_clarification' | 'submit_issue';
  questions: Clarification['questions'];
  /** 这次追问来自一条「疑似缺失码」的建议：可以直接确认成本批口径再重新分析 */
  policyContext?: PendingPolicyContext;
}

/** 追问里可结构化的口径上下文：只认单列 + 明确编码，避免乱猜。 */
export interface PendingPolicyContext {
  column: string;
  code: string;
}

function policyContextOf(part: ClarificationPartLike): PendingPolicyContext | null {
  if (!part.input || typeof part.input !== 'object') return null;
  const input = part.input as Record<string, unknown>;
  const columns = Array.isArray(input.columns)
    ? input.columns.filter((item): item is string => typeof item === 'string' && item.trim() !== '')
    : [];
  const code = typeof input.comparisonCode === 'string' ? input.comparisonCode.trim() : '';
  return columns.length === 1 && code.length > 0 ? { column: columns[0]!, code } : null;
}

export function clarificationFromPart(part: ClarificationPartLike): Clarification | null {
  if (part.type === 'tool-ask_clarification') {
    const parsed = clarificationSchema.safeParse(part.input);
    return parsed.success ? parsed.data : null;
  }
  if (part.type !== 'tool-submit_issue' || !part.input || typeof part.input !== 'object' ||
      !('disposition' in part.input) || part.input.disposition !== 'needs_clarification' ||
      !('clarification' in part.input)) return null;
  const parsed = clarificationSchema.safeParse(part.input.clarification);
  return parsed.success ? parsed.data : null;
}

/** 追问必须单独占一步；同一步里夹着别的工具时，暂停点会说不清是哪一步。 */
export const CLARIFICATION_STEP_VIOLATION_TEXT =
  '追问必须单独占一步：这一次调用里还有其它工具。请重新调用 ask_clarification，或在现有信息下继续分析。';

/**
 * 用户没回答、直接改口时写进工具结果的说明。
 *
 * 与通用的「上一次分析中断了」区分开：那条文案会让模型以为工具坏了，
 * 而这里的事实是用户主动放弃了这个问题。
 */
export const CLARIFICATION_DANGLING_TEXT =
  '用户没有回答这个追问，而是改为直接补充要求；本次追问作废。请按现有信息继续分析，不要重复追问，并把受影响结论的 confidence 调低。';

function isToolPart(part: ClarificationPartLike): boolean {
  return part.type.startsWith('tool-') || part.type === 'dynamic-tool';
}

/** 只看最后一个 step-start 之后的 parts —— 与 SDK「最后一步」的口径一致。 */
function lastStepParts(parts: ClarificationPartLike[]): ClarificationPartLike[] {
  let start = 0;
  parts.forEach((part, index) => {
    if (part.type === 'step-start') start = index + 1;
  });
  return parts.slice(start);
}

/**
 * 从消息里找出「正在等用户回答」的那次追问。
 *
 * 只认最后一条助手消息的最后一步：更早的追问要么已经答过、要么已经作废，
 * 都不该再弹面板。最后一条是用户消息时也返回 null —— 等待期用户又发了消息，
 * 说明他已经改口，追问不该继续挡路。
 */
export function pendingClarificationOf(
  messages: ClarificationMessageLike[], submitted?: ReadonlyMap<string, Clarification>,
): PendingClarification | null {
  const last = messages[messages.length - 1];
  if (!last || last.role !== 'assistant') return null;

  for (const part of lastStepParts(last.parts)) {
    if (!part.toolCallId || part.state !== 'input-available') continue;
    const clarification = part.type === 'tool-submit_issue' && submitted
      ? submitted.get(part.toolCallId) : clarificationFromPart(part);
    if (!clarification) continue;
    const policyContext = part.type === 'tool-submit_issue' ? policyContextOf(part) : null;
    return { toolCallId: part.toolCallId,
      tool: part.type === 'tool-ask_clarification' ? 'ask_clarification' : 'submit_issue',
      questions: clarification.questions,
      ...(policyContext ? { policyContext } : {}) };
  }
  return null;
}

/**
 * 这条用户消息是不是一次新分析的起点。
 *
 * 判据是「带结构摘要」：只有点「开始分析」发出的那条消息才附带摘要块
 * （`buildSummaryBlock` 的标记）。「按此计划执行」、失败重试发的都是普通
 * 用户消息，不能算新的一轮 —— 否则它们会把追问预算悄悄重置。
 */
function isAnalysisStart(message: ClarificationMessageLike): boolean {
  return (
    message.role === 'user' &&
    message.parts.some((part) => typeof part.text === 'string' && part.text.includes(SUMMARY_OPEN))
  );
}

/** 一轮分析的起点下标：最后一条带摘要的用户消息；没有时退回最后一条用户消息。 */
function currentRunStart(messages: ClarificationMessageLike[]): number {
  let withSummary = -1;
  let lastUser = -1;
  messages.forEach((message, index) => {
    if (isAnalysisStart(message)) withSummary = index;
    else if (message.role === 'user') lastUser = index;
  });
  return withSummary === -1 ? lastUser : withSummary;
}

/**
 * 本轮分析是否已经追问过一次。
 *
 * 预算按**一轮分析**计，而「一轮」= 一条带摘要的「开始分析」消息。为什么不用
 * 「最后一条用户消息」：用户点「按此计划执行」、或从失败处重试时，界面发出的
 * 也是一条用户消息 —— 用后者会把预算悄悄重置，于是那一轮可以第二次追问。
 * 计划里明确写了「按此计划执行不重置预算」，这里必须跟它一致。
 *
 * 只有**真正问过用户**（`output-available`）才用掉预算：被界面挡回去的追问
 * （格式不对、同一步有别的工具）用户根本没看见。
 */
export function clarificationUsedInCurrentRun(
  messages: ClarificationMessageLike[],
): boolean {
  const start = currentRunStart(messages);
  return messages.slice(start + 1).some(
    (message) =>
      message.role === 'assistant' &&
      message.parts.some(
        (part) => part.state === 'output-available' && (part.type === 'tool-ask_clarification' ||
          (part.type === 'tool-submit_issue' && !!part.output && typeof part.output === 'object' &&
            'clarificationResult' in part.output)),
      ),
  );
}

/**
 * 追问那一步里是否还夹着别的工具。
 *
 * Prompt 里写明了「必须单独占一步」，但那只是提示。同一步里同时跑 run_checks 时，
 * 用户回答前后会混进别的工具结果，暂停点就说不清是哪一步了。
 */
export function clarificationSharesStep(messages: ClarificationMessageLike[], pending = pendingClarificationOf(messages)): boolean {
  if (pending === null) return false;
  const last = messages[messages.length - 1];
  if (!last) return false;
  return lastStepParts(last.parts).filter(isToolPart).length > 1;
}

/** 每题一个空草稿。返回新数组，不共享同一份引用。 */
export function emptyDrafts(count: number): string[] {
  return Array.from({ length: count }, () => '');
}

/** 写入第 index 题的草稿，返回新数组 —— 就地改会让 React 认为状态没变。 */
export function applyDraft(drafts: string[], index: number, value: string): string[] {
  return drafts.map((draft, current) => (current === index ? value : draft));
}

/**
 * 把草稿变成要回填的工具结果。
 *
 * 超长在这里拒绝、不悄悄截断：截断会让用户以为发出去的是全文。全空也拒绝 ——
 * 发一个空结果给模型等于让它猜，不如让用户明确选「跳过」。
 */
export function buildClarificationOutput(
  questions: string[],
  drafts: string[],
): { ok: true; output: ClarificationToolOutput } | { ok: false; error: string } {
  for (let index = 0; index < questions.length; index += 1) {
    const length = (drafts[index] ?? '').trim().length;
    if (length > MAX_ANSWER_LENGTH) {
      return {
        ok: false,
        error: `第 ${index + 1} 题的回答有 ${length} 字，超过 ${MAX_ANSWER_LENGTH} 字上限，请精简后再提交。`,
      };
    }
  }

  const output = clarificationOutputForModel(questions, drafts);
  if (output.answers.length === 0) {
    return {
      ok: false,
      error: '还没有回答任何问题。至少回答一个问题，或者点「跳过，按现有信息继续」。',
    };
  }

  return { ok: true, output };
}
