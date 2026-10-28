import { PHASES, type PhaseId } from '@/agent/shared/phases';
import { CLARIFICATION_DANGLING_TEXT } from './clarifications';

/**
 * 阶段与工具轨迹都从消息里派生，而不是另存一份状态。
 *
 * 消息本身就是完整的过程记录：谁说了什么、调了哪个工具、成功还是失败，
 * 全在 parts 里。再往 store 里存一份，就必须靠 effect 同步两处 ——
 * 而 effect 同步迟早会漏，漏了之后界面显示的阶段和实际发生的事对不上，
 * 这种错还很难查。派生就没有这个问题：只有一个真源。
 *
 * 这里只取渲染需要的字段，不绑定 AI SDK 的具体消息类型，
 * 于是这个纯函数不启浏览器就能测。
 */
export interface PhaseMessageLike {
  role: string;
  parts: { type: string; state?: string }[];
}

function isToolPart(type: string): boolean {
  return type.startsWith('tool-') || type === 'dynamic-tool';
}

/**
 * 判断当前处在哪个阶段。
 *
 * 只认助手消息里的 parts：用户消息里出现 `tool-xxx` 属于伪造内容
 * （提示注入的一种形态），不该影响界面状态。
 */
export function derivePhase(messages: PhaseMessageLike[]): PhaseId {
  const hasUserMessage = messages.some((message) => message.role === 'user');
  if (!hasUserMessage) return 'profiling';

  const parts = messages
    .filter((message) => message.role === 'assistant')
    .flatMap((message) => message.parts);

  let lastToolIndex = -1;
  parts.forEach((part, index) => {
    if (isToolPart(part.type)) lastToolIndex = index;
  });

  if (lastToolIndex === -1) return 'planning';

  // 工具调用之后又出文本，说明模型在汇总结果；否则还在执行
  const textAfterTool = parts.slice(lastToolIndex + 1).some((part) => part.type === 'text');
  return textAfterTool ? 'synthesis' : 'execution';
}

/**
 * 去掉重复的 part。
 *
 * 客户端工具 + 自动续跑时，AI SDK 会把后续步骤的内容并进**同一条**助手消息，
 * 而每一步带上来的 parts 都包含此前的内容 —— 直接渲染就会看到同一段文本、
 * 同一张工具卡出现好几次。这是实测出来的：一次真实分析里「提交问题清单」
 * 在界面上出现 2 次，而模型只提交了 1 条；mock 侧一轮文本也会被渲染 3 次。
 *
 * 去重规则：位置取第一次出现，内容取最后一次（后者状态更完整，
 * 例如工具从 input-streaming 变成 output-available）。没有标识的 part
 * （如 step-start）原样保留 —— 它们本来就是步骤分隔，重复出现也不误导。
 */
export function dedupeParts<T extends { type: string }>(parts: T[]): T[] {
  const result: T[] = [];
  const indexByKey = new Map<string, number>();

  for (const part of parts) {
    const record = part as { id?: unknown; toolCallId?: unknown };
    const key =
      typeof record.toolCallId === 'string'
        ? record.toolCallId
        : typeof record.id === 'string'
          ? record.id
          : null;

    if (key === null) {
      result.push(part);
      continue;
    }

    const existing = indexByKey.get(key);
    if (existing === undefined) {
      indexByKey.set(key, result.length);
      result.push(part);
    } else {
      result[existing] = part;
    }
  }

  return result;
}

/**
 * 判断是否有一个工具调用卡住了。
 *
 * 这是真模型实测出来的失败形态：单次工具调用的载荷太大时，工具输入会
 * 流不完，状态永远停在 input-streaming，onToolCall 从不触发。此时流已经
 * 结束（status 不再是 streaming），界面却什么都不说 —— 用户看到的是一个
 * 不会动的界面，只会以为程序坏了。所以要能认出来并给一次重试。
 *
 * 只看最后一条助手消息：历史消息里的旧状态不该反复触发同样的提示。
 */
export function hasStuckToolCall(messages: PhaseMessageLike[], isStreaming: boolean): boolean {
  if (isStreaming) return false;

  const lastAssistant = [...messages].reverse().find((message) => message.role === 'assistant');
  if (!lastAssistant) return false;

  return lastAssistant.parts.some(
    (part) =>
      (part.type.startsWith('tool-') || part.type === 'dynamic-tool') &&
      // 追问的 input-available 是**刻意**留下的暂停点：客户端不回填等用户回答。
      // 把它算成卡住，界面就会诱导用户点「重试一次」，那一下会把追问作废。
      // input-streaming 仍然算卡住 —— 那是输入没流完，问题根本没形成。
      (part.state === 'input-streaming' ||
        (part.state === 'input-available' && part.type !== 'tool-ask_clarification')),
  );
}

/** 工具调用的最小形状。比 PhaseMessageLike 多要几个字段：修复时要用到 id、工具名与参数。 */
export interface ToolPartLike {
  type: string;
  state?: string;
  toolCallId?: string;
  toolName?: string;
  /**
   * 工具参数。**流中断留下的半截调用可能没有这个字段**，而 OpenAI 兼容接口要求
   * `tool_calls[].arguments` 必须存在 —— 缺了它整次请求会被供应商 400 拒绝。
   */
  input?: unknown;
}

export interface DanglingToolCall {
  toolCallId: string;
  toolName: string;
}

/** 这条工具调用是否还没有结果（有调用、没回填）。 */
export function isDanglingToolPart(part: ToolPartLike): boolean {
  if (!part.type.startsWith('tool-') && part.type !== 'dynamic-tool') return false;
  if (part.toolCallId === undefined) return false;
  return (
    part.state !== 'output-available' &&
    part.state !== 'output-error' &&
    part.state !== 'output-denied'
  );
}

/**
 * 找出所有「有工具调用、却没有结果」的部分。
 *
 * 这是**重试时必然踩到的坑**：流在工具调用之后中断时，助手消息里留下了
 * `tool-call`，但客户端还没执行/回填 `tool-result`。此时再发一条用户消息，
 * AI SDK 的 `convertToModelMessages` 会直接抛
 * `MissingToolResultsError`（「Tool results are missing for tool calls …」），
 * 用户看到的是「调用大模型时出错」，其实模型一次都没被调用。
 *
 * 修法不是绕开错误，而是**先把这些调用补成「上一次中断、没有结果」**，
 * 让历史消息重新合法，再发重试指令。工具名从 `tool-xxx` 或动态工具的
 * `toolName` 取，两者都要认。
 */
export function findDanglingToolCalls(
  messages: { role: string; parts: ToolPartLike[] }[],
): DanglingToolCall[] {
  const calls: DanglingToolCall[] = [];
  for (const message of messages) {
    // 只认助手消息：用户消息里的 tool-* 是伪造内容，不该被当成真实调用
    if (message.role !== 'assistant') continue;
    for (const part of message.parts) {
      if (!isDanglingToolPart(part)) continue;
      const toolName =
        part.type === 'dynamic-tool' ? part.toolName : part.type.slice('tool-'.length);
      if (toolName === undefined || toolName === '') continue;
      calls.push({ toolCallId: part.toolCallId!, toolName });
    }
  }
  return calls;
}

/** 修复时写进工具结果的说明。界面与模型都能读懂「这里为什么没有结果」。 */
export const DANGLING_TOOL_REPAIR_TEXT =
  '上一次分析在这里中断了，这项工具调用没有返回结果；本次重试跳过它，继续后面的步骤。';

/**
 * 把残留的工具调用补成 `output-error`，返回一份新的消息数组。
 *
 * 补成失败结果而不是删掉：模型需要知道「这一步没跑完」，用户也能在界面上
 * 看到真实发生的事。纯函数方便单测「只修残留、不碰完整记录、不改入参」。
 *
 * 文案按工具选：追问的残留不是「工具坏了」，而是用户没回答就改口了 —— 那条
 * 文案要让模型按现有信息继续并降低 confidence，而不是重试同一个追问。
 * 调用方显式传 `errorText` 时以传入值为准。
 */
export function repairDanglingToolCalls<T extends { role: string; parts: ToolPartLike[] }>(
  messages: T[],
  errorText?: string,
): T[] {
  return messages.map((message) => {
    if (message.role !== 'assistant') return message;
    let repaired = false;
    const parts = message.parts.map((part) => {
      if (!isDanglingToolPart(part)) return part;
      repaired = true;
      const toolName =
        part.type === 'dynamic-tool' ? part.toolName : part.type.slice('tool-'.length);
      return {
        ...part,
        state: 'output-error',
        // 补一个空参数对象：流在参数传完之前中断时，part 上可能根本没有 input。
        // 只补 output-error 而不补 input，会让下一次请求的工具调用缺 `arguments`，
        // 供应商直接 400「missing field arguments」—— 于是重试永远失败（线上踩过）。
        input: part.input ?? {},
        errorText:
          errorText ??
          (toolName === 'ask_clarification'
            ? CLARIFICATION_DANGLING_TEXT
            : DANGLING_TOOL_REPAIR_TEXT),
      };
    });
    return repaired ? ({ ...message, parts } as T) : message;
  });
}

/** 失败后能续跑的环节。剖析在本机跑、没有网络请求可重试，所以不在其中。 */
export type RetryPhase = 'planning' | 'execution' | 'synthesis';

export interface RetryPlan {
  phase: RetryPhase;
  /** 按钮文案，例如「从制定检查计划重试」 */
  label: string;
  /** 点下去发给模型的续跑指令 */
  instruction: string;
}

function phaseLabel(phase: RetryPhase): string {
  return PHASES.find((item) => item.id === phase)?.label ?? phase;
}

/**
 * 从消息推断失败时断在哪个环节。
 *
 * 只给一个「重试一次」等于把已经拿到的结果全丢掉：用户看着检查跑了一半，
 * 点一下却要从规划重来，白等一次也白花一次调用。断在哪一步只有消息说得清，
 * 所以这里沿用 derivePhase 的观察结果，不另存状态。
 */
export function failureRetryPhase(messages: PhaseMessageLike[]): RetryPhase | null {
  const phase = derivePhase(messages);
  return phase === 'planning' || phase === 'execution' || phase === 'synthesis' ? phase : null;
}

/**
 * 每个环节的续跑指令。
 *
 * 都点名「已做完的不要重做」：模型看不到界面，只看到历史里一串工具结果，
 * 不说清的话它很可能把检查再跑一遍 —— 用户要为同样的检查再付一次调用费。
 */
const RETRY_NEXT_STEP: Record<RetryPhase, string> = {
  planning:
    '请根据上面的数据摘要重新给出检查计划，并调用 plan_checks 提交。已经查过的列画像不用再查。',
  execution: '请接着已经完成的检查继续，调用 run_checks 执行还没做的检查；已经跑完的项不必重跑。',
  synthesis: '检查结果已经拿到，请直接继续汇总，并用 submit_issue 提交问题清单，不要重新执行检查。',
};

export function retryInstructionFor(phase: RetryPhase): string {
  return `上一轮在「${phaseLabel(phase)}」这一步中断了。${RETRY_NEXT_STEP[phase]}`;
}

export function retryPlanFor(messages: PhaseMessageLike[]): RetryPlan | null {
  const phase = failureRetryPhase(messages);
  if (phase === null) return null;
  return {
    phase,
    label: `从${phaseLabel(phase)}重试`,
    instruction: retryInstructionFor(phase),
  };
}

/**
 * 工具标识到界面文案的对照表。
 *
 * **每登记一个新工具就必须在这里加一条**：漏了的话，`describeToolPart` 会退到
 * 「调用工具 <标识>」，把 `plan_checks` 这种内部名字直接摆在用户眼前。
 * 这句话原本写在函数的注释里，而它没有拦住任何人 —— Plan 3 新增的两个工具
 * 就一直显示成「调用工具 plan_checks…」，直到 `plan-and-rules.spec.ts` 才抓出来。
 * 下一个人不需要靠记性：那条测试遍历全部工具，漏一个就红。
 */
const TOOL_LABELS: Record<string, string> = {
  'tool-plan_checks': '提交检查计划',
  'tool-run_checks': '运行数据质量检查',
  'tool-describe_column': '查看列画像',
  'tool-submit_issue': '提交问题清单',
  'tool-query_rules': '检索领域规则',
  'tool-ask_clarification': '向你确认信息',
  'dynamic-tool': '调用工具',
};

/**
 * 工具部分的中文文案。
 *
 * 认不出的工具原样带出标识：界面上显示一个内部名字虽然不好看，
 * 但比什么都不显示强 —— 用户看到空白会以为界面卡住了。
 */
export function describeToolPart(type: string): string {
  const known = TOOL_LABELS[type];
  if (known) return known;
  return type.startsWith('tool-') ? `调用工具 ${type.slice('tool-'.length)}` : type;
}
