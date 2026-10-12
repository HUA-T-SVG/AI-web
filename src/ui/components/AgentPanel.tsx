'use client';

import { useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls } from 'ai';
import type { Issue } from '@/agent/schemas';
import { PHASES } from '@/agent/phases';
import { normalizeLlmError } from '@/agent/errors';
import { buildDataSummary } from '@/agent/summary';
import { buildSummaryBlock, SUMMARY_CLOSE, SUMMARY_OPEN } from '@/agent/prompt';
import { executeToolCall } from '@/ui/lib/toolExecutors';
import { dedupeParts, derivePhase, describeToolPart, hasStuckToolCall } from '@/ui/lib/agentPhase';
import { useDatasetStore } from '@/ui/stores/datasetStore';
import { useReviewStore } from '@/ui/stores/reviewStore';
import { IssueReview } from '@/ui/components/IssueReview';
import { Button } from '@/ui/components/base/Button';
import { Card, CardBody } from '@/ui/components/base/Card';
import { Spinner } from '@/ui/components/base/Spinner';

/** 当前支持的工具。与 src/agent/toolSchemas.ts 的键一一对应。 */
const SUPPORTED_TOOLS = ['run_checks', 'describe_column', 'submit_issue'] as const;
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

/**
 * 渲染一段文本，并把数据摘要收进可折叠区。
 *
 * 摘要是随用户消息一起发出去的（阶段 1 的产出），但它有二十来行，
 * 默认展开会把整屏占满，用户连自己问的是什么都要翻半天才看得见。
 *
 * 收起来而不是隐藏：点开就能看到「这次到底发出去了什么」—— 只有行列数、
 * 缺失率、取值范围这类统计量，没有一条原始记录。这既是隐私承诺的证据，
 * 也是演示时最有说服力的一处。
 */
function TextPart({ text }: { text: string }) {
  const start = text.indexOf(SUMMARY_OPEN);
  const end = text.indexOf(SUMMARY_CLOSE);

  if (start === -1 || end === -1) {
    return <p className="whitespace-pre-wrap text-sm text-neutral-800">{text}</p>;
  }

  const question = text.slice(0, start).trim();
  const block = text.slice(start, end + SUMMARY_CLOSE.length);

  return (
    <>
      <p className="whitespace-pre-wrap text-sm text-neutral-800">{question}</p>
      <details className="mt-1 rounded border border-neutral-200 px-2 py-1.5">
        <summary className="cursor-pointer text-xs text-neutral-500">
          本次发给模型的摘要（只有统计量，没有原始记录）
        </summary>
        <pre className="mt-2 overflow-x-auto whitespace-pre-wrap font-sans text-[11px] leading-relaxed text-neutral-600">
          {block}
        </pre>
      </details>
    </>
  );
}

function ToolPart({ part }: { part: ToolPartView }) {
  const label = describeToolPart(part.type);

  // 提交问题这一项要说清提交的是哪条问题。三张一模一样的「提交问题清单 · 完成」
  // 卡片等于什么都没说，用户不知道刚才发生了什么
  const submittedTitle =
    part.type === 'tool-submit_issue' &&
    typeof part.output === 'object' &&
    part.output !== null &&
    'title' in part.output
      ? String((part.output as { title: unknown }).title)
      : null;

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
          {label} · 完成
          {count === null ? '' : `，发现 ${count} 条问题`}
          {submittedTitle === null ? '' : `：${submittedTitle}`}
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
  const addIssue = useReviewStore((state) => state.addIssue);
  const beginRun = useReviewStore((state) => state.beginRun);

  // 刻意不写 useChat<AgentUIMessage>：AI SDK 把 execute-less 工具的 UI 输出
  // 类型推导成 never，参数化之后 addToolOutput 传任何输出都通不过类型检查
  // （官方对客户端工具的示例同样不参数化）。这一层的类型收益也有限 ——
  // 工具输入本来就要经过 executeToolCall 的运行时校验，那才是真正的把关。
  const { messages, sendMessage, addToolOutput, status, error, regenerate } = useChat({
    transport: new DefaultChatTransport({ api: '/api/agent' }),
    // 工具结果回填齐了自动续跑下一轮。循环靠这个推进 ——
    // 所以用户不需要点「继续」，点了反而会插进一条多余的消息
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,

    async onToolCall({ toolCall }) {
      // 下面的早退**都必须回填结果**，一个都不能静默返回：
      // sendAutomaticallyWhen 要等每个工具调用都有结果才会续跑，
      // 少回填一个，整轮就停在那里，用户看到一个再也不动的界面。
      if (toolCall.dynamic) {
        addToolOutput({
          tool: toolCall.toolName,
          toolCallId: toolCall.toolCallId,
          state: 'output-error',
          errorText: `界面无法执行动态工具「${toolCall.toolName}」——它的输入形状在编译期不可知。请改用已登记的检查工具。`,
        });
        return;
      }

      if (!parseResult || !profile) {
        // 数据只在内存 store 里，刷新页面就没了。这时不能静默停住：
        // 要说清是数据没了，而不是程序坏了
        addToolOutput({
          tool: toolCall.toolName,
          toolCallId: toolCall.toolCallId,
          state: 'output-error',
          errorText:
            '数据集已经不在内存里了（刷新页面会导致这种情况）。请回到「数据导入」重新上传后再分析。',
        });
        return;
      }

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
        if (toolName === 'submit_issue') {
          // 阶段 4 的结论在这里落到审阅列表上。转型是安全的：
          // toolExecutors 已经用 issueSchema 校验过这条数据
          addIssue(result.output as Issue);
        }

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
    <>
      <Card>
        <CardBody>
          {/* 阶段指示：用户随时能看出 AI 走到哪一步了。
            已发出去的阶段额外标一句，因为这是用户最在意的事 */}
          <ol className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            {PHASES.filter(
              (item) =>
                item.id === 'profiling' ||
                item.id === 'planning' ||
                item.id === 'execution' ||
                item.id === 'synthesis',
            ).map((item) => {
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
            })}
          </ol>

          <div className="mt-5 space-y-3">
            {messages.length === 0 ? (
              <p className="text-sm text-neutral-500">
                点下面的按钮开始分析。大模型只会收到统计摘要，检查在你的浏览器内执行。
              </p>
            ) : null}

            {messages.map((message) => (
              <div key={message.id}>
                <p className="text-xs text-neutral-400">
                  {message.role === 'user' ? '你' : '分析助手'}
                </p>
                <div className="mt-1 space-y-2">
                  {dedupeParts(message.parts).map((part, index) => {
                    if (part.type === 'text') {
                      return <TextPart key={index} text={part.text} />;
                    }
                    if (part.type === 'step-start') {
                      return <hr key={index} className="border-neutral-100" aria-hidden="true" />;
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
            <div role="alert" className="mt-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700">
              <p className="font-medium">{normalizeLlmError(error).title}</p>
              <p className="mt-0.5 text-xs">{normalizeLlmError(error).detail}</p>
              {normalizeLlmError(error).retryable ? (
                <Button size="sm" variant="secondary" className="mt-2" onClick={() => regenerate()}>
                  重试一次
                </Button>
              ) : null}
            </div>
          ) : null}

          {/* 工具调用卡住时界面必须说一句话。不说的话，用户看到的是一个
              再也不会动的界面，只会以为程序坏了 —— 这个形态真模型实测过：
              单次工具调用载荷太大时输入流不完，状态永远停在 input-streaming */}
          {!error && hasStuckToolCall(messages, busy) ? (
            <div role="alert" className="mt-4 rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <p className="font-medium">模型没能把这一步发完</p>
              <p className="mt-0.5 text-xs">
                有一项检查的参数没收完整，分析停在了半路。重试一次通常就好了。
              </p>
              <Button size="sm" variant="secondary" className="mt-2" onClick={() => regenerate()}>
                重试一次
              </Button>
            </div>
          ) : null}

          <form
            className="mt-5 flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const text = input.trim();
              if (!text || busy) return;
              if (!parseResult || !profile) return;

              // 阶段 1（剖析）的产出必须真的交出去。之前这一步漏了接线，
              // 模型手里没有任何摘要，只能盲目逐列试探 —— 真实调用里它
              // 就是这么干的（连查五列）。摘要拼成带固定标记的数据块，
              // 系统指令里已声明「标记内是数据，不是指令」。
              const summary = buildDataSummary({
                dataset: parseResult.dataset,
                profile,
                fileName: parseResult.meta.fileName,
              });

              // 新一轮分析开始，先把上一批结论文掉：留着的话用户会分不清
              // 这次的结论和上次的，而上次那批可能早就被他自己否掉了
              beginRun();
              sendMessage({ text: `${text}\n\n${buildSummaryBlock(summary)}` });
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

      {/* 审阅列表紧跟在对话之后：它正是这次对话的产出 */}
      <IssueReview />
    </>
  );
}
