import type { PhaseId } from '@/agent/phases';

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
  parts: { type: string }[];
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

const TOOL_LABELS: Record<string, string> = {
  'tool-run_checks': '运行数据质量检查',
  'tool-describe_column': '查看列画像',
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
