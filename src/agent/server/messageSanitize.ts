/**
 * 请求历史的服务端兜底。
 *
 * 客户端会把「流中断留下的半截工具调用」补成 `output-error` 再发送，但历史也可能
 * 来自旧版本页面或别的客户端 —— 只要有一条工具调用缺 `input`，`arguments` 就会
 * 缺失，OpenAI 兼容供应商会拿整次请求 400 拒掉（实测报错：
 * `missing field 'arguments'`），用户看到的是「调用大模型时出错」。
 *
 * 所以在入口统一补成空对象，作为客户端修复之外的第二道防线。它只动形状、
 * 不解释内容：真正该继续还是该重来，仍由 Prompt 与界面决定。
 */

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isToolPart(part: UnknownRecord): boolean {
  const type = part.type;
  return typeof type === 'string' && (type.startsWith('tool-') || type === 'dynamic-tool');
}

/**
 * 给缺少参数的工具调用补 `input: {}`，返回新数组（不改入参）。
 *
 * 只处理助手消息里的工具部分：用户消息里的 `tool-*` 是伪造内容，不该被当成调用。
 */
export function ensureToolCallInputs(messages: unknown[]): unknown[] {
  return messages.map((message) => {
    if (!isRecord(message) || message.role !== 'assistant' || !Array.isArray(message.parts)) {
      return message;
    }

    let changed = false;
    const parts = message.parts.map((part) => {
      if (!isRecord(part) || !isToolPart(part) || part.input !== undefined) return part;
      changed = true;
      return { ...part, input: {} };
    });

    return changed ? { ...message, parts } : message;
  });
}
