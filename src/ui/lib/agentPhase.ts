import type { PhaseId } from '@/agent/shared/phases';

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
      (part.state === 'input-streaming' || part.state === 'input-available'),
  );
}

const TOOL_LABELS: Record<string, string> = {
  'tool-run_checks': '运行数据质量检查',
  'tool-describe_column': '查看列画像',
  'tool-submit_issue': '提交问题清单',
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
