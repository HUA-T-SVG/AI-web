'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls } from 'ai';
import type { CheckPlan, Issue } from '@/agent/shared/schemas';
import { PHASES, type PhaseId } from '@/agent/shared/phases';
import { normalizeLlmError } from '@/agent/shared/errors';
import { buildDataSummary } from '@/agent/shared/summary';
import { buildSummaryBlock, SUMMARY_CLOSE, SUMMARY_OPEN } from '@/agent/shared/prompt';
import type { Dataset, DatasetProfile } from '@/core';
import { Check, Circle } from 'lucide-react';
import { executeToolCall } from '@/ui/lib/toolExecutors';
import {
  dedupeParts,
  derivePhase,
  describeToolPart,
  findDanglingToolCalls,
  hasStuckToolCall,
  repairDanglingToolCalls,
  retryPlanFor,
} from '@/ui/lib/agentPhase';
import { useDatasetStore } from '@/ui/stores/datasetStore';
import { usePlanStore } from '@/ui/stores/planStore';
import { useProvenanceStore } from '@/ui/stores/provenanceStore';
import { useReviewStore } from '@/ui/stores/reviewStore';
import { CheckPlanPanel } from '@/ui/components/CheckPlanPanel';
import { IssueReview } from '@/ui/components/IssueReview';
import { Badge } from '@/ui/components/base/Badge';
import { Button } from '@/ui/components/base/Button';
import { Card, CardBody, CardHeader, CardTitle } from '@/ui/components/base/Card';
import { Notice } from '@/ui/components/base/Notice';
import { Spinner } from '@/ui/components/base/Spinner';
import { cn } from '@/ui/lib/cn';

/** 当前支持的工具。与 src/agent/toolSchemas.ts 的键一一对应。 */
const SUPPORTED_TOOLS = [
  'plan_checks',
  'run_checks',
  'describe_column',
  'submit_issue',
  'query_rules',
] as const;
type SupportedTool = (typeof SUPPORTED_TOOLS)[number];

/** 首次进入时的意图入口：点一下填进输入框，不替用户直接发送 */
const QUICK_INTENTS = ['全面检查这份数据', '重点检查缺失与重复', '有没有需要归并的同义写法'];

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
    return <p className="whitespace-pre-wrap text-sm text-ink">{text}</p>;
  }

  const question = text.slice(0, start).trim();
  const block = text.slice(start, end + SUMMARY_CLOSE.length);

  return (
    <>
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{question}</p>
      <details className="mt-1 rounded-lg border border-line px-2 py-1.5">
        <summary className="cursor-pointer text-xs text-ink-muted max-md:min-h-11">
          本次发给模型的摘要（只有统计量，没有原始记录）
        </summary>
        <pre className="mt-2 overflow-x-auto whitespace-pre-wrap font-sans text-[11px] leading-relaxed text-ink-muted">
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
        <p className="flex items-center gap-2 text-xs text-ink-muted">
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
        <p className="rounded-lg bg-canvas px-3 py-2 text-xs text-ink-muted">
          {label} · 完成
          {count === null ? '' : `，发现 ${count} 条问题`}
          {submittedTitle === null ? '' : `：${submittedTitle}`}
        </p>
      );
    }
    case 'output-error':
      return (
        <p role="alert" className="rounded-lg bg-danger-50 px-3 py-2 text-xs text-danger-700">
          {label} · 失败：{part.errorText ?? '未给出原因'}
        </p>
      );
    case 'output-denied':
      return (
        <p className="rounded-lg bg-warning-50 px-3 py-2 text-xs text-warning-700">
          {label} · 已拒绝执行
        </p>
      );
    default:
      return (
        <p className="flex items-center gap-2 text-xs text-ink-muted">
          <Spinner />
          {label}…
        </p>
      );
  }
}

export function AgentPanel() {
  const [input, setInput] = useState('');
  // 停止是用户主动的动作，不是失败。单独记一笔，界面才能说「停在哪儿」而不是
  // 摆一个不动的界面让用户猜；下一次发送时清掉
  const [stopped, setStopped] = useState(false);
  const parseResult = useDatasetStore((state) => state.parseResult);
  const dataVersion = useDatasetStore((state) => state.dataVersion);
  const workingDataset = useDatasetStore((state) => state.workingDataset);
  const workingProfile = useDatasetStore((state) => state.workingProfile);
  /**
   * AI 分析使用的数据快照。
   *
   * **必须是工作数据，不是最初导入的 `parseResult.dataset`**：清洗之后工作数据
   * 已经变了，若还拿原始数据分析，结论说的是旧数据、却按当前 dataVersion 记成
   * 「当前版本的结论」—— 版本保护就失效了。
   *
   * 快照在**本轮开始那一刻**固定：分析过程中即使页面状态变化，本轮所有工具调用
   * 仍对同一份数据执行，结论与 `beginRun` 记录的版本严格对应。
   */
  const analysisData: Dataset | null = workingDataset ?? parseResult?.dataset ?? null;
  const analysisProfile: DatasetProfile | null = workingProfile;
  const sourceFileName = parseResult?.meta.fileName ?? '当前数据.csv';
  const runSnapshotRef = useRef<{
    dataset: Dataset;
    profile: DatasetProfile;
    fileName: string;
    version: number;
  } | null>(null);

  const captureRunSnapshot = () => {
    if (analysisData === null || analysisProfile === null) return null;
    const snapshot = {
      dataset: analysisData,
      profile: analysisProfile,
      fileName: sourceFileName,
      version: dataVersion,
    };
    runSnapshotRef.current = snapshot;
    return snapshot;
  };

  const ensureRunSnapshot = () => runSnapshotRef.current ?? captureRunSnapshot();

  const addIssue = useReviewStore((state) => state.addIssue);
  const reviewCount = useReviewStore((state) => state.items.length);
  const appliedSteps = useProvenanceStore((state) => state.steps.length);

  // 刻意不写 useChat<AgentUIMessage>：AI SDK 把 execute-less 工具的 UI 输出
  // 类型推导成 never，参数化之后 addToolOutput 传任何输出都通不过类型检查
  // （官方对客户端工具的示例同样不参数化）。这一层的类型收益也有限 ——
  // 工具输入本来就要经过 executeToolCall 的运行时校验，那才是真正的把关。
  const { messages, sendMessage, setMessages, addToolOutput, status, error, regenerate, stop } =
    useChat({
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

        const snapshot = ensureRunSnapshot();
        if (snapshot === null) {
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

        const result = await executeToolCall(toolName, toolCall.input, {
          // 工具执行也用本轮快照：不能摘要说清洗后的数据、检查却跑原始数据
          dataset: snapshot.dataset,
          profile: snapshot.profile,
        });

        if (result.ok) {
          if (toolName === 'submit_issue') {
            // 阶段 4 的结论在这里落到审阅列表上。转型是安全的：
            // toolExecutors 已经用 issueSchema 校验过这条数据
            addIssue(result.output as Issue);
          }
          if (toolName === 'plan_checks') {
            // 阶段 2 的计划在这里落到 store 上，界面随即展示「AI 打算做什么」。
            // 计划本体也在消息里（工具调用就是消息的一部分），store 只额外记
            // 「用户取消了哪几项」—— 那是消息里没有的用户意图。
            usePlanStore.getState().setPlan(result.output as CheckPlan);
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

  const derived = derivePhase(messages);
  // 审阅与执行发生在会话结束之后，derivePhase 看不到这两步 —— 用两个 store 的
  // 事实把它补上：有已提交建议就进入「人工确认」，有已执行动作就到「执行与留痕」
  const activePhase: PhaseId = appliedSteps > 0 ? 'apply' : reviewCount > 0 ? 'review' : derived;
  const phaseIndex = Math.max(
    0,
    PHASES.findIndex((item) => item.id === activePhase),
  );
  const currentPhase = PHASES.find((item) => item.id === activePhase);
  const busy = status === 'submitted' || status === 'streaming';
  const llmError = error ? normalizeLlmError(error) : null;
  // 断在哪一步只有消息说得清，所以每次渲染现算；没有可续跑的环节时给 null
  const retryPlan = retryPlanFor(messages);

  const stopAnalysis = () => {
    void stop();
    // 停止是用户主动的，不是失败：已经产生的记录和结论都不清，
    // 只说一句「停在这儿」，免得那个不再变化的界面看起来像坏了
    setStopped(true);
  };

  /**
   * 发送前把「有调用、没结果」的工具部分补成可读的失败结果。
   *
   * 为什么必须有这一步：流在工具调用之后中断时，助手消息里留下 tool-call 却没有
   * tool-result。此时直接 sendMessage，AI SDK 在转换历史消息时会抛
   * `MissingToolResultsError`（界面上就是「Tool results are missing…」），
   * 模型根本没被调用。用户以为是模型坏了，其实是上一次中断留下的半条记录。
   *
   * 补成 output-error 而不是删掉：既让历史消息合法，也如实告诉用户/模型
   * 「这一步没跑完」。`setMessages` 是同步写 chat 状态，紧接着 sendMessage
   * 读到的就是修好的历史，不需要等 React 渲染。
   */
  const sendWithRepair = (text: string) => {
    if (findDanglingToolCalls(messages).length > 0) {
      setMessages((previous) => repairDanglingToolCalls(previous));
    }
    sendMessage({ text });
  };

  const retryFailedStep = () => {
    if (!retryPlan) return;
    // 续跑也必须对着中断那一轮的数据快照；没有快照时用当前工作数据补一份
    if (ensureRunSnapshot() === null) return;
    setStopped(false);
    // 发一条续跑指令，而不是 regenerate：那会把上一轮从头再跑一遍，
    // 已经拿到的检查结果和列画像就白费了
    sendWithRepair(retryPlan.instruction);
  };

  // 客户端工具的结果回来时，SDK 会自动续跑下一步。用户按了停止之后，
  // 这个续跑不是他要的 —— 再停一次，别让界面自己又跑起来。
  // 只有停止之后才拦：正常流程里状态同样会短暂变成 submitted / streaming
  useEffect(() => {
    if (stopped && (status === 'submitted' || status === 'streaming')) void stop();
  }, [stopped, status, stop]);
  // 启动前让用户看清「将要发送什么」：摘要按当前数据实时生成，不等到点下去才出现
  const summaryPreview = useMemo(() => {
    if (analysisData === null || analysisProfile === null) return null;
    return buildSummaryBlock(
      buildDataSummary({
        dataset: analysisData,
        profile: analysisProfile,
        fileName: sourceFileName,
      }),
    );
  }, [analysisData, analysisProfile, sourceFileName]);
  // 状态徽章与步骤条是两回事：步骤条说「走到哪」，徽章说「现在能不能等人」。
  // 失败、等待人工确认、刚打开还没开始，这三种状态必须各说各的，不能都叫「待开始」。
  const phaseBadge = error
    ? { tone: 'high' as const, text: '失败' }
    : busy
      ? { tone: 'brand' as const, text: '进行中' }
      : activePhase === 'apply'
        ? { tone: 'success' as const, text: '已完成' }
        : activePhase === 'review'
          ? { tone: 'medium' as const, text: '等待人工确认' }
          : messages.length === 0
            ? { tone: 'neutral' as const, text: '待开始' }
            : { tone: 'brand' as const, text: '进行中' };

  return (
    <>
      <CheckPlanPanel
        onExecute={(instruction) => {
          // 把计划作为一条用户消息发出去 —— 驱动方仍是模型（设计文档 §5.2 阶段 3）。
          // 界面不直接替它调 run_checks：那样「这次检查是谁决定的」就说不清了，
          // 而那正是可解释性要回答的问题。
          if (ensureRunSnapshot() === null) return;
          setStopped(false);
          sendWithRepair(instruction);
        }}
      />

      <Card>
        <CardHeader>
          <div>
            <CardTitle>分析过程</CardTitle>
            <p className="mt-0.5 text-xs text-ink-muted">每一步都能在下面的记录里找到对应动作</p>
          </div>
          <Badge tone={phaseBadge.tone}>{phaseBadge.text}</Badge>
        </CardHeader>
        <CardBody>
          {/* 步骤条：用户随时能看出 AI 走到哪一步。当前步用浅青底 + 圆点，
              已走过的步用对勾；不只靠颜色 —— 文字与图标同时表达状态 */}
          <ol className="flex gap-1.5 overflow-x-auto pb-1" aria-label="分析步骤">
            {PHASES.map((item, index) => {
              const state =
                index < phaseIndex ? 'done' : index === phaseIndex ? 'active' : 'pending';
              return (
                <li
                  key={item.id}
                  aria-current={state === 'active' ? 'step' : undefined}
                  className={cn(
                    'flex min-w-[104px] flex-1 flex-col gap-1 rounded-lg border px-2.5 py-2',
                    state === 'active'
                      ? 'border-brand-300 bg-brand-50'
                      : state === 'done'
                        ? 'border-line bg-surface'
                        : 'border-line bg-canvas',
                  )}
                >
                  <span className="flex items-center gap-1.5 text-xs font-medium">
                    {state === 'done' ? (
                      <Check className="h-3.5 w-3.5 shrink-0 text-success-600" aria-hidden="true" />
                    ) : state === 'active' ? (
                      busy ? (
                        <Spinner className="h-3.5 w-3.5 shrink-0" />
                      ) : (
                        <span
                          className="h-2 w-2 shrink-0 rounded-full bg-brand-600"
                          aria-hidden="true"
                        />
                      )
                    ) : (
                      <Circle className="h-3 w-3 shrink-0 text-ink-muted/50" aria-hidden="true" />
                    )}
                    <span
                      className={cn(
                        state === 'active'
                          ? 'text-brand-800'
                          : state === 'done'
                            ? 'text-ink'
                            : 'text-ink-muted',
                      )}
                    >
                      {item.label}
                    </span>
                  </span>
                  <span className="text-[10px] text-ink-muted">
                    {item.usesLlm ? '会联网' : '本机计算'}
                  </span>
                </li>
              );
            })}
          </ol>

          {currentPhase ? (
            <p
              className="mt-3 rounded-lg bg-canvas px-3 py-2 text-xs leading-relaxed text-ink-muted"
              role="status"
            >
              这一步在做什么：{currentPhase.description}
            </p>
          ) : null}

          {messages.length === 0 ? (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="text-xs text-ink-muted">试试：</span>
              {QUICK_INTENTS.map((intent) => (
                <button
                  key={intent}
                  type="button"
                  onClick={() => setInput(intent)}
                  className="rounded-full border border-line-strong bg-surface px-3 py-1 text-xs text-ink transition-colors hover:border-brand-200 hover:bg-brand-50 max-md:min-h-11"
                >
                  {intent}
                </button>
              ))}
            </div>
          ) : null}

          {summaryPreview !== null ? (
            <details className="mt-3 rounded-lg border border-line bg-canvas px-3 py-2">
              <summary className="cursor-pointer text-xs font-medium text-ink max-md:min-h-11">
                本次会发送的摘要（只有统计量，不含行级记录）
              </summary>
              <p className="mt-1 text-xs leading-relaxed text-ink-muted">
                包含列名、类型、缺失率、唯一值数与类别列取值（最多 20 项/列）；原始行不出本机。
              </p>
              <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap text-[11px] leading-relaxed text-ink-muted">
                {summaryPreview}
              </pre>
            </details>
          ) : null}

          <div className="mt-5 space-y-3">
            {messages.length === 0 ? (
              <p className="text-sm text-ink-muted">
                点下面的按钮开始分析。大模型只会收到统计摘要，检查在你的浏览器内执行。
              </p>
            ) : null}

            {messages.map((message) => (
              <div
                key={message.id}
                data-message-id={message.id}
                data-message-role={message.role}
                className={cn(
                  'rounded-lg px-3 py-2',
                  message.role === 'user' ? 'bg-canvas' : 'border border-line bg-surface',
                )}
              >
                <p className="text-xs font-medium text-ink-muted">
                  {message.role === 'user' ? '你' : '分析助手'}
                </p>
                <div className="mt-1 space-y-2" data-part-count={message.parts.length}>
                  {dedupeParts(message.parts).map((part, index) => {
                    if (part.type === 'text') {
                      return <TextPart key={index} text={part.text} />;
                    }
                    if (part.type === 'step-start') {
                      return <hr key={index} className="border-line" aria-hidden="true" />;
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

          {llmError ? (
            <div
              role="alert"
              className="mt-4 rounded-lg border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-700"
            >
              <p className="font-medium">{llmError.title}</p>
              <p className="mt-0.5 text-xs">{llmError.detail}</p>
              {llmError.retryable ? (
                retryPlan ? (
                  <div className="mt-2">
                    <Button size="sm" variant="secondary" onClick={retryFailedStep}>
                      {retryPlan.label}
                    </Button>
                    <p className="mt-1 text-xs">从断掉的那一步接着跑，已经产生的记录不会丢。</p>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="mt-2"
                    onClick={() => regenerate()}
                  >
                    重试一次
                  </Button>
                )
              ) : null}
            </div>
          ) : null}

          {/* 工具调用卡住时界面必须说一句话。不说的话，用户看到的是一个
              再也不会动的界面，只会以为程序坏了 —— 这个形态真模型实测过：
              单次工具调用载荷太大时输入流不完，状态永远停在 input-streaming。
              用户自己按停止造成的同样形态不算卡住，别再吓他一次 */}
          {!error && !stopped && hasStuckToolCall(messages, busy) ? (
            <div
              role="alert"
              className="mt-4 rounded-lg border border-warning-200 bg-warning-50 px-3 py-2 text-sm text-warning-700"
            >
              <p className="font-medium">模型没能把这一步发完</p>
              <p className="mt-0.5 text-xs">
                有一项检查的参数没收完整，分析停在了半路。重试一次通常就好了。
              </p>
              <Button size="sm" variant="secondary" className="mt-2" onClick={() => regenerate()}>
                重试一次
              </Button>
            </div>
          ) : null}

          {stopped && !busy && !error ? (
            <div
              role="status"
              className="mt-4 rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-ink"
            >
              <p className="font-medium">已停止分析</p>
              <p className="mt-0.5 text-xs text-ink-muted">
                停在这一步之前产生的记录与结论都保留在上面。想继续，直接输入下一步要求再发送。
              </p>
            </div>
          ) : null}

          {analysisData !== null && analysisProfile === null ? (
            <Notice tone="info" testId="analysis-profile-pending">
              正在按数据版本 v{dataVersion} 重新计算画像与检查，完成后才能开始分析。
            </Notice>
          ) : null}

          <form
            className="mt-5 flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const text = input.trim();
              if (!text || busy) return;
              // 本轮开始即冻结数据快照：摘要、工具、画像、runVersion 必须来自同一份
              const snapshot = captureRunSnapshot();
              if (snapshot === null) return;

              // 阶段 1（剖析）的产出必须真的交出去。之前这一步漏了接线，
              // 模型手里没有任何摘要，只能盲目逐列试探 —— 真实调用里它
              // 就是这么干的（连查五列）。摘要拼成带固定标记的数据块，
              // 系统指令里已声明「标记内是数据，不是指令」。
              const summary = buildDataSummary({
                dataset: snapshot.dataset,
                profile: snapshot.profile,
                fileName: snapshot.fileName,
              });

              // 新一轮分析开始，先把上一批结论文掉：留着的话用户会分不清
              // 这次的结论和上次的，而上次那批可能早就被他自己否掉了。
              // 结论绑**快照版本**：这批建议与这次发出的摘要/检查数据严格对应
              useReviewStore.getState().beginRun(snapshot.version);
              setStopped(false);
              sendWithRepair(`${text}\n\n${buildSummaryBlock(summary)}`);
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
              className="min-w-0 flex-1 rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted/70 focus:border-brand-400 max-md:min-h-11"
            />
            <Button
              type="submit"
              size="md"
              disabled={busy || input.trim() === '' || analysisProfile === null}
            >
              {busy ? '分析中…' : '开始分析'}
            </Button>
            {/* 长分析可能跑几十秒，用户得能中途叫停；停在哪儿由上面的说明交代，
                按钮本身不改变「开始分析 / 分析中…」这套已有行为 */}
            {busy ? (
              <Button type="button" size="md" variant="secondary" onClick={stopAnalysis}>
                停止分析
              </Button>
            ) : null}
          </form>
        </CardBody>
      </Card>

      {/* 审阅列表紧跟在对话之后：它正是这次对话的产出 */}
      <IssueReview />
    </>
  );
}
