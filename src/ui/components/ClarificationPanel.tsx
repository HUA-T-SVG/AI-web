'use client';

import { useState } from 'react';
import type { Clarification } from '@/agent/shared/schemas';
import { MAX_ANSWER_LENGTH, type ClarificationToolOutput } from '@/agent/shared/outbound';
import { applyDraft, buildClarificationOutput, emptyDrafts } from '@/ui/lib/clarifications';
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
 */
export function ClarificationPanel({
  questions,
  onSubmit,
  onSkip,
}: {
  questions: Clarification['questions'];
  onSubmit: (output: ClarificationToolOutput) => void;
  onSkip: () => void;
}) {
  const [drafts, setDrafts] = useState<string[]>(() => emptyDrafts(questions.length));
  const [error, setError] = useState<string | null>(null);
  // 提交后立刻锁住，防双击触发第二次 addToolOutput
  const [submitted, setSubmitted] = useState(false);

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
