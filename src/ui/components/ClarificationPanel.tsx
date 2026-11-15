'use client';

import { useState } from 'react';
import type { Clarification } from '@/agent/shared/schemas';
import { MAX_ANSWER_LENGTH, type ClarificationToolOutput } from '@/agent/shared/outbound';
import { applyDraft, buildClarificationOutput, emptyDrafts, type PendingPolicyContext } from '@/ui/lib/clarifications';
import { Badge } from '@/ui/components/base/Badge';
import { Button } from '@/ui/components/base/Button';
import { Card, CardBody, CardHeader, CardTitle } from '@/ui/components/base/Card';

/**
 * 追问是暂停点：回答必须以 tool-result 回填（`addToolOutput`）。
 *
 * 不要改成 `sendMessage` —— 那会退化成普通多轮对话，用户会看到自己那句
 * 「重点高中」变成一条消息，轮次、成本也全错。
 *
 * 回答不落库、不持久化：只活在当前会话的消息里，刷新即失效。界面上必须
 * 明说这一点，否则用户会以为它会进处理留痕。
 *
 * 例外：如果这条追问来自「疑似缺失码」的建议（带单列 + comparisonCode），
 * 面板会给一个「确认口径并重新分析」的快捷入口——那会把口径写进本批配置，
 * 再用新口径重开一轮；它不是常规回答，也不改数据。
 */
export function ClarificationPanel({
  questions,
  policyContext,
  onSubmit,
  onSkip,
  onConfirmPolicy,
}: {
  questions: Clarification['questions'];
  policyContext?: PendingPolicyContext;
  onSubmit: (output: ClarificationToolOutput) => void;
  onSkip: () => void;
  onConfirmPolicy?: (choice: 'missing' | 'valid', note: string) => void;
}) {
  const [drafts, setDrafts] = useState<string[]>(() => emptyDrafts(questions.length));
  const [error, setError] = useState<string | null>(null);
  // 提交后立刻锁住，防双击触发第二次 addToolOutput
  const [submitted, setSubmitted] = useState(false);
  const [policyChoice, setPolicyChoice] = useState<'missing' | 'valid'>('missing');
  const [policyNote, setPolicyNote] = useState('');

  const submit = () => {
    const built = buildClarificationOutput(
      questions.map((item) => item.question),
      drafts,
    );
    if (!built.ok) {
      setError(built.error);
      return;
    }
    setSubmitted(true);
    onSubmit(built.output);
  };

  return (
    <Card className="mt-4 border-warning-200" data-testid="clarification-panel">
      <CardHeader className="bg-warning-50/60">
        <div>
          <CardTitle>AI 需要你确认几件事</CardTitle>
          <p className="mt-0.5 text-xs text-ink-muted">
            回答会发给模型，请不要粘贴原始记录、姓名或联系方式。回答不会保存到本机，也不会进处理留痕。
          </p>
        </div>
        <Badge tone="medium">等待你回答</Badge>
      </CardHeader>
      <CardBody>
        <ol className="space-y-4">
          {questions.map((item, index) => (
            <li key={`${index}-${item.question}`}>
              <p className="text-sm font-medium text-ink">
                {index + 1}. {item.question}
              </p>
              {item.options.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {item.options.map((option) => (
                    <button
                      key={option}
                      type="button"
                      disabled={submitted}
                      onClick={() => setDrafts((previous) => applyDraft(previous, index, option))}
                      className="rounded-full border border-line-strong bg-surface px-3 py-1 text-xs text-ink max-md:min-h-11"
                    >
                      {option}
                    </button>
                  ))}
                </div>
              ) : null}
              <textarea
                rows={2}
                value={drafts[index] ?? ''}
                maxLength={MAX_ANSWER_LENGTH}
                disabled={submitted}
                aria-label={`回答第 ${index + 1} 个问题`}
                placeholder="也可以自己写；留空表示这题不回答"
                onChange={(event) =>
                  setDrafts((previous) => applyDraft(previous, index, event.target.value))
                }
                className="mt-2 w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-ink max-md:min-h-11"
              />
              <p className="mt-1 text-right text-[11px] text-ink-muted">
                {(drafts[index] ?? '').length} / {MAX_ANSWER_LENGTH}
              </p>
            </li>
          ))}
        </ol>

        {policyContext ? (
          <section
            className="mt-4 rounded-lg border border-brand-200 bg-brand-50 p-3"
            data-testid="clarification-policy"
            aria-label="把追问答案确认为本批口径"
          >
            <p className="text-sm font-medium text-brand-900">这题涉及本批口径，可以直接确认</p>
            <p className="mt-1 text-xs leading-relaxed text-brand-800">
              把「{policyContext.column}」的「{policyContext.code}」确认成本批口径后，系统会用新口径
              自动重新分析，这一列才能继续走清洗。确认只写入口径，不修改数据。
            </p>
            <div className="mt-2 flex flex-wrap gap-4 text-xs text-brand-900">
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  name="clarification-policy-choice"
                  checked={policyChoice === 'missing'}
                  disabled={submitted}
                  onChange={() => setPolicyChoice('missing')}
                />
                缺失占位码（按缺失处理）
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  name="clarification-policy-choice"
                  checked={policyChoice === 'valid'}
                  disabled={submitted}
                  onChange={() => setPolicyChoice('valid')}
                />
                有效值（保留原值）
              </label>
            </div>
            <label className="mt-2 block text-xs text-brand-900">
              核对依据（可选，会写进口径原文）
              <input
                value={policyNote}
                maxLength={200}
                disabled={submitted}
                placeholder="例如：已向课题组确认，999 为缺考"
                className="mt-1 block w-full rounded-lg border border-line-strong bg-surface px-2 py-1.5 text-ink max-md:min-h-11"
                onChange={(event) => setPolicyNote(event.target.value)}
              />
            </label>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                disabled={submitted || !onConfirmPolicy}
                onClick={() => {
                  setSubmitted(true);
                  onConfirmPolicy?.(policyChoice, policyNote.trim());
                }}
              >
                确认口径并重新分析
              </Button>
              <span className="text-xs text-brand-800">会写入当前标签页的本批口径；重新分析不会丢数据。</span>
            </div>
          </section>
        ) : null}

        {error !== null ? (
          <p role="alert" className="mt-3 text-xs text-danger-700">
            {error}
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button onClick={submit} disabled={submitted}>
            提交回答
          </Button>
          <Button
            variant="secondary"
            disabled={submitted}
            onClick={() => {
              setSubmitted(true);
              onSkip();
            }}
          >
            跳过，按现有信息继续
          </Button>
          <span className="text-xs text-ink-muted">
            跳过会让 AI 按现有信息继续，并调低受影响结论的置信度。
          </span>
        </div>
      </CardBody>
    </Card>
  );
}
