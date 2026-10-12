'use client';

import { useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls } from 'ai';
import { PHASES } from '@/agent/phases';
import { executeToolCall } from '@/ui/lib/toolExecutors';
import { derivePhase, describeToolPart } from '@/ui/lib/agentPhase';
import { useDatasetStore } from '@/ui/stores/datasetStore';
import { Button } from '@/ui/components/base/Button';
import { Card, CardBody } from '@/ui/components/base/Card';
import { Spinner } from '@/ui/components/base/Spinner';

/** 当前支持的工具。与 src/agent/toolSchemas.ts 的键一一对应。 */
const SUPPORTED_TOOLS = ['run_checks', 'describe_column'] as const;
type SupportedTool = (typeof SUPPORTED_TOOLS)[number];

function isSupportedTool(name: string): name is SupportedTool {
  return (SUPPORTED_TOOLS as readonly string[]).includes(name);
}

/**
 * 工具部分的宽松视图。
 *
 * 消息里的工具部分是按工具名区分的一个联合类型，逐个写死分支会重复三遍
 * 同样的渲染逻辑。这里只取渲染真正用到的那几个字段 —— 服务端新增工具时
 * 界面也不会因为没同步类型而崩，只是显示通用文案。
 */
interface ToolPartView {
  type: string;
  toolCallId?: string;
  state?: string;
  output?: unknown;
  errorText?: string;
}

function ToolPart({ part }: { part: ToolPartView }) {
  const label = describeToolPart(part.type);

  switch (part.state) {
    case 'input-streaming':
    case 'input-available':
      return (
        <p className="flex items-center gap-2 text-xs text-neutral-500">
          <Spinner />
          {label}…
        </p>
      );
    case 'output-available': {
      const count =
        typeof part.output === 'object' && part.output !== null && 'count' in part.output
          ? (part.output as { count: number }).count
          : null;
      return (
        <p className="rounded bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
          {label} · 完成{count === null ? '' : `，发现 ${count} 条问题`}
        </p>
      );
    }
    case 'output-error':
      return (
        <p role="alert" className="rounded bg-red-50 px-3 py-2 text-xs text-red-700">
          {label} · 失败：{part.errorText ?? '未给出原因'}
        </p>
      );
    case 'output-denied':
      return (
        <p className="rounded bg-amber-50 px-3 py-2 text-xs text-amber-800">{label} · 已拒绝执行</p>
      );
    default:
      return (
        <p className="flex items-center gap-2 text-xs text-neutral-500">
          <Spinner />
          {label}…
        </p>
      );
  }
}

export function AgentPanel() {
  const [input, setInput] = useState('');
  const parseResult = useDatasetStore((state) => state.parseResult);
  const profile = useDatasetStore((state) => state.profile);

  // 刻意不写 useChat<AgentUIMessage>：AI SDK 把 execute-less 工具的 UI 输出
  // 类型推导成 never，参数化之后 addToolOutput 传任何输出都通不过类型检查
  // （官方对客户端工具的示例同样不参数化）。这一层的类型收益也有限 ——
  // 工具输入本来就要经过 executeToolCall 的运行时校验，那才是真正的把关。
  const { messages, sendMessage, addToolOutput, status, error } = useChat({
    transport: new DefaultChatTransport({ api: '/api/agent' }),
    // 工具结果回填齐了自动续跑下一轮。循环靠这个推进 ——
    // 所以用户不需要点「继续」，点了反而会插进一条多余的消息
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,

    async onToolCall({ toolCall }) {
      // 动态工具先放行，否则 TypeScript 无法收窄 toolName
      if (toolCall.dynamic) return;
      if (!parseResult || !profile) return;

      const toolName = toolCall.toolName;
      if (!isSupportedTool(toolName)) {
        // 服务端加了新工具但界面没跟上时，回填一句可读的失败，
        // 而不是让会话停在这里等一个永远不会来的结果
        addToolOutput({
          tool: toolName,
          toolCallId: toolCall.toolCallId,
          state: 'output-error',
          errorText: `界面还不认识工具「${toolName}」，本次调用已跳过。`,
        });
        return;
      }

      const result = executeToolCall(toolName, toolCall.input, {
        dataset: parseResult.dataset,
        profile,
      });

      if (result.ok) {
        // 不 await：await 会和 sendAutomaticallyWhen 抢同一个时机，
        // 容易卡住整个会话
        addToolOutput({
          tool: toolName,
          toolCallId: toolCall.toolCallId,
          output: result.output,
        });
        return;
      }

      // 失败也必须回填。不回填的话，会话会永远停在「等待工具结果」，
      // 用户看到的是一个再也不会动的界面
      addToolOutput({
        tool: toolName,
        toolCallId: toolCall.toolCallId,
        state: 'output-error',
        errorText: result.error,
      });
    },
  });

  const phase = derivePhase(messages);
  const busy = status === 'submitted' || status === 'streaming';

  return (
    <Card>
      <CardBody>
        {/* 阶段指示：用户随时能看出 AI 走到哪一步了。
            已发出去的阶段额外标一句，因为这是用户最在意的事 */}
        <ol className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          {PHASES.filter((item) => item.id === 'profiling' || item.id === 'planning' || item.id === 'execution' || item.id === 'synthesis').map(
            (item) => {
              const active = item.id === phase;
              return (
                <li
                  key={item.id}
                  aria-current={active ? 'step' : undefined}
                  className={active ? 'font-medium text-neutral-900' : 'text-neutral-400'}
                >
                  {active ? '● ' : '○ '}
                  {item.label}
                  {item.usesLlm ? <span className="text-neutral-400">（会联网）</span> : null}
                </li>
              );
            },
          )}
        </ol>

        <div className="mt-5 space-y-3">
          {messages.length === 0 ? (
            <p className="text-sm text-neutral-500">
              点下面的按钮开始分析。大模型只会收到统计摘要，检查在你的浏览器内执行。
            </p>
          ) : null}

          {messages.map((message) => (
            <div key={message.id}>
              <p className="text-xs text-neutral-400">{message.role === 'user' ? '你' : '分析助手'}</p>
              <div className="mt-1 space-y-2">
                {message.parts.map((part, index) => {
                  if (part.type === 'text') {
                    return (
                      <p key={index} className="whitespace-pre-wrap text-sm text-neutral-800">
                        {part.text}
                      </p>
                    );
                  }
                  if (part.type === 'step-start') {
                    return (
                      <hr key={index} className="border-neutral-100" aria-hidden="true" />
                    );
                  }
                  if (part.type.startsWith('tool-') || part.type === 'dynamic-tool') {
                    return <ToolPart key={index} part={part as ToolPartView} />;
                  }
                  return null;
                })}
              </div>
            </div>
          ))}
        </div>

        {error ? (
          <p role="alert" className="mt-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700">
            分析中断了：{error.message}
          </p>
        ) : null}

        <form
          className="mt-5 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const text = input.trim();
            if (!text || busy) return;
            sendMessage({ text });
            setInput('');
          }}
        >
          <label className="sr-only" htmlFor="agent-input">
            想了解这份数据的什么
          </label>
          <input
            id="agent-input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="例如：这份问卷数据有什么质量问题"
            className="min-w-0 flex-1 rounded-md border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400"
          />
          <Button type="submit" size="sm" disabled={busy || input.trim() === ''}>
            {busy ? '分析中…' : '开始分析'}
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
