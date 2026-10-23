'use client';

import { useMemo, useState } from 'react';
import type { Severity } from '@/core';
import {
  MAX_ISSUES,
  confirmedActionsOf,
  useReviewStore,
  type ReviewDecision,
  type ReviewItem,
} from '@/ui/stores/reviewStore';
import { Badge } from '@/ui/components/base/Badge';
import { Button } from '@/ui/components/base/Button';
import { Card, CardBody, CardHeader, CardTitle } from '@/ui/components/base/Card';
import { EmptyState } from '@/ui/components/base/EmptyState';
import { Notice } from '@/ui/components/base/Notice';
import { useDatasetStore } from '@/ui/stores/datasetStore';
import { useProvenanceStore } from '@/ui/stores/provenanceStore';
import {
  draftOf,
  isEditableAction,
  parseDraft,
  type ActionParamDraft,
} from '@/ui/lib/actionParams';
import { previewCleaningImpact } from '@/ui/lib/impactPreview';
import { cn } from '@/ui/lib/cn';

/**
 * 严重度用「文字 + 颜色」双重表达。
 *
 * 只靠颜色的话，色觉障碍的读者拿不到这个信息 —— 而严重度直接决定他去不去看。
 */
const SEVERITY: Record<Severity, { label: string; tone: 'high' | 'medium' | 'low' }> = {
  high: { label: '严重', tone: 'high' },
  medium: { label: '中等', tone: 'medium' },
  low: { label: '轻微', tone: 'low' },
};

const DECISION_LABEL: Record<ReviewDecision, string> = {
  pending: '待确认',
  accepted: '已接受',
  modified: '已修改',
  rejected: '已拒绝',
};

const ACTION_LABEL: Record<string, string> = {
  merge_categories: '类别归并',
  trim_whitespace: '去除首尾空白',
  fill_missing: '填补缺失',
  remove_duplicates: '去重',
};

/** 只有会改数据的动作才显示参数编辑器；其余建议只允许写备注 */
function ParamFields({
  item,
  draft,
  onChange,
  error,
}: {
  item: ReviewItem;
  draft: ActionParamDraft;
  onChange: (next: ActionParamDraft) => void;
  error: string | null;
}) {
  const suggestion = item.issue.suggestion;
  const column = typeof suggestion.params.column === 'string' ? suggestion.params.column : '';
  const fieldClass =
    'mt-1 w-full rounded-lg border border-line-strong bg-surface px-2 py-1.5 text-xs text-ink focus:border-brand-400';

  return (
    <div className="mt-2 space-y-2 rounded-lg border border-line bg-canvas p-2.5">
      <p className="text-xs leading-relaxed text-ink-muted">
        这条建议会改数据。下面是可编辑参数，确认后按新参数执行，并写进处理留痕。
      </p>

      {suggestion.action === 'merge_categories' ? (
        <>
          <p className="text-xs text-ink">
            目标列：<span className="font-medium">{column}</span>
          </p>
          <label className="block text-xs text-ink" htmlFor={`${item.id}-groups`}>
            类别分组（一行一组，组内用逗号/顿号分隔）
          </label>
          <textarea
            id={`${item.id}-groups`}
            rows={3}
            value={draft.groups}
            onChange={(event) => onChange({ ...draft, groups: event.target.value })}
            className={fieldClass}
            placeholder={'例如：\n硕士、研究生\n本科、本科在读'}
          />
        </>
      ) : null}

      {suggestion.action === 'trim_whitespace' ? (
        <>
          <label className="block text-xs text-ink" htmlFor={`${item.id}-columns`}>
            要处理的列（逗号或顿号分隔）
          </label>
          <input
            id={`${item.id}-columns`}
            value={draft.columns}
            onChange={(event) => onChange({ ...draft, columns: event.target.value })}
            className={fieldClass}
          />
        </>
      ) : null}

      {suggestion.action === 'fill_missing' ? (
        <>
          <p className="text-xs text-ink">
            目标列：<span className="font-medium">{column}</span>
          </p>
          <label className="block text-xs text-ink" htmlFor={`${item.id}-value`}>
            填入值（数字按数值处理，其余按文本）
          </label>
          <input
            id={`${item.id}-value`}
            value={draft.value}
            onChange={(event) => onChange({ ...draft, value: event.target.value })}
            className={fieldClass}
          />
        </>
      ) : null}

      {suggestion.action === 'remove_duplicates' ? (
        <>
          <label className="block text-xs text-ink" htmlFor={`${item.id}-columns`}>
            按哪些列判重（留空表示按整行）
          </label>
          <input
            id={`${item.id}-columns`}
            value={draft.columns}
            onChange={(event) => onChange({ ...draft, columns: event.target.value })}
            className={fieldClass}
          />
        </>
      ) : null}

      {error !== null ? (
        <p role="alert" className="text-xs text-danger-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function IssueCard({ item }: { item: ReviewItem }) {
  const decide = useReviewStore((state) => state.decide);
  const dataset = useDatasetStore((state) => state.parseResult?.dataset ?? null);
  const [modifyOpen, setModifyOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [note, setNote] = useState('');
  const [draft, setDraft] = useState<ActionParamDraft | null>(null);
  const [error, setError] = useState<string | null>(null);

  const severity = SEVERITY[item.issue.severity];
  const decided = item.decision !== 'pending';
  const editable = isEditableAction(item.issue.suggestion.action);

  const startModify = () => {
    if (modifyOpen) {
      if (!editable) {
        decide(item.id, 'modified', note || undefined);
        setModifyOpen(false);
        return;
      }
      if (dataset === null) {
        setError('数据不在内存里（刷新过页面？）。重新导入后再改参数。');
        return;
      }
      const parsed = parseDraft(
        item.issue.suggestion,
        draft ?? draftOf(item.issue.suggestion),
        dataset,
      );
      if (!parsed.ok) {
        setError(parsed.error);
        return;
      }
      decide(item.id, 'modified', note || undefined, parsed.action);
      setError(null);
      setModifyOpen(false);
      return;
    }

    setRejectOpen(false);
    setError(null);
    setDraft(editable ? draftOf(item.issue.suggestion) : null);
    setModifyOpen(true);
  };

  const startReject = () => {
    if (rejectOpen) {
      decide(item.id, 'rejected', note || undefined);
      setRejectOpen(false);
      return;
    }
    setModifyOpen(false);
    setError(null);
    setRejectOpen(true);
  };

  return (
    <li className="rounded-lg border border-line bg-surface p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={severity.tone}>{severity.label}</Badge>
        <p className="min-w-0 flex-1 text-sm font-medium text-ink">{item.issue.title}</p>
        {decided ? <Badge tone="neutral">{DECISION_LABEL[item.decision]}</Badge> : null}
      </div>

      <p className="mt-1.5 text-xs leading-relaxed text-ink-muted">{item.issue.description}</p>

      {/* 只给列名与行数，不复述整行原始数据：用户在自己的浏览器里看得到，
          我们没必要再抄一遍，抄了反而多一处泄露面 */}
      <p className="mt-1 text-xs text-ink-muted">
        涉及列：{item.issue.columns.length > 0 ? item.issue.columns.join('、') : '全表'}
        {item.issue.rowIndices && item.issue.rowIndices.length > 0
          ? ` · ${item.issue.rowIndices.length} 行`
          : ''}
      </p>

      <p className="mt-2 rounded-lg bg-canvas px-2.5 py-1.5 text-xs leading-relaxed text-ink">
        建议：{item.issue.suggestion.rationale}
      </p>

      {!decided && modifyOpen && editable ? (
        <ParamFields
          item={item}
          draft={draft ?? draftOf(item.issue.suggestion)}
          onChange={setDraft}
          error={error}
        />
      ) : null}

      {!decided && modifyOpen && !editable ? (
        <p className="mt-2 rounded-lg border border-line bg-canvas px-2.5 py-1.5 text-xs leading-relaxed text-ink-muted">
          这条建议是「请人工判断」，执行器不会改数据（`{item.issue.suggestion.action}
          `）。确认后只记录理由。
        </p>
      ) : null}

      {!decided && (modifyOpen || rejectOpen) ? (
        <div className="mt-2">
          <label className="text-xs text-ink-muted" htmlFor={`note-${item.id}`}>
            {rejectOpen ? '填写拒绝理由，会记入处理日志' : '填写理由，会记入处理日志'}
          </label>
          <input
            id={`note-${item.id}`}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            className="mt-1 w-full rounded-lg border border-line-strong bg-surface px-2 py-1.5 text-xs text-ink focus:border-brand-400"
          />
        </div>
      ) : null}

      {decided ? (
        <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
          <span>
            你的决定：
            {item.decision === 'accepted' ? (
              '接受'
            ) : item.decision === 'modified' ? (
              item.override !== undefined ? (
                <>
                  修改后执行：{ACTION_LABEL[item.override.action] ?? item.override.action}
                  <code className="ml-1 break-all text-[11px]">
                    {JSON.stringify(item.override.params)}
                  </code>
                </>
              ) : (
                '已备注（这条建议不改数据）'
              )
            ) : (
              '拒绝'
            )}
            {item.note ? ` · ${item.note}` : ''}
          </span>
          <button
            type="button"
            className="font-medium text-brand-700 underline underline-offset-2 hover:text-brand-800"
            onClick={() => {
              decide(item.id, 'pending');
              setModifyOpen(false);
              setRejectOpen(false);
              setNote('');
              setError(null);
            }}
          >
            撤销
          </button>
        </p>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          <Button size="sm" onClick={() => decide(item.id, 'accepted')}>
            接受
          </Button>
          <Button size="sm" variant="secondary" onClick={startModify}>
            {modifyOpen ? '确认修改' : '修改'}
          </Button>
          <Button size="sm" variant="secondary" onClick={startReject}>
            {rejectOpen ? '确认拒绝' : '拒绝'}
          </Button>
        </div>
      )}
    </li>
  );
}

/**
 * 问题审阅与人工确认。
 *
 * 这是安全设计的核心：AI 提出建议，但是否执行由人逐条决定。
 * 界面上不存在任何「自动全部接受」的路径 —— 那正是最容易被顺手加进来、
 * 也最容易让「人在环路」变成一句空话的东西。
 */
export function IssueReview() {
  // selector 只取 items（引用稳定），派生计算放在组件里做。
  // 把 confirmedActionsOf 写进 selector 会每次返回新数组，
  // zustand 判定「变了」→ 无限重渲染 → 整页白屏。这个坑真踩过。
  const items = useReviewStore((state) => state.items);
  const droppedCount = useReviewStore((state) => state.droppedCount);
  const dataVersion = useDatasetStore((state) => state.dataVersion);
  const cleaningBase = useProvenanceStore((state) => state.current);
  const runVersion = useReviewStore((state) => state.runVersion);
  const executedVersion = useReviewStore((state) => state.executedVersion);
  // 确认/改参数只改 items；用 items 做依赖，试算就不必跟着筛选与输入框重跑
  const confirmed = useMemo(() => confirmedActionsOf(items), [items]);
  const preview = useMemo(
    () =>
      cleaningBase !== null && confirmed.length > 0
        ? previewCleaningImpact(cleaningBase, confirmed)
        : null,
    [cleaningBase, confirmed],
  );
  const [outcome, setOutcome] = useState<{
    applied: number;
    skipped: number;
    changedCells: number;
  } | null>(null);
  const [status, setStatus] = useState<'all' | ReviewDecision>('all');
  const [field, setField] = useState('all');

  const fields = useMemo(() => {
    const names = new Set<string>();
    for (const item of items) {
      for (const column of item.issue.columns) names.add(column);
    }
    return [...names];
  }, [items]);

  const filtered = useMemo(
    () =>
      items.filter((item) => {
        if (status !== 'all' && item.decision !== status) return false;
        if (field === 'all') return true;
        return item.issue.columns.includes(field);
      }),
    [items, status, field],
  );

  if (items.length === 0) return null;

  const pending = items.filter((item) => item.decision === 'pending').length;
  const handled = items.length - pending;

  // 版本对不上时这批结论是对旧数据说的，不能再执行 —— 列名碰巧相同就会真的改错数据
  const isStale = runVersion !== null && runVersion !== dataVersion;
  const isExecuted = executedVersion !== null;
  const cannotExecute =
    isExecuted || isStale || pending > 0 || confirmed.length === 0 || cleaningBase === null;
  const showPreview = preview !== null && !isStale && !isExecuted;

  const hint = isExecuted
    ? `这批建议已在 v${executedVersion} 执行过，不会重复执行。`
    : isStale
      ? `这批建议基于旧版本 v${runVersion}，已失效，请重新分析。`
      : cleaningBase === null
        ? '数据不在内存里（刷新过页面？），先重新导入。'
        : pending > 0
          ? '还有未确认的条目，先逐条处理完。'
          : confirmed.length === 0
            ? '没有已确认的条目，清洗会改不动数据。'
            : '只对已确认的条目生效；原始数据不会被改动，可以随时撤销。';

  return (
    <Card className="mt-4" data-testid="issue-review">
      <CardHeader>
        <div>
          <CardTitle>发现的问题</CardTitle>
          <p className="mt-0.5 text-xs text-ink-muted">
            {pending > 0
              ? `还有 ${pending} 条未确认，确认之前不会对数据做任何改动`
              : confirmed.length === items.length
                ? `已确认 ${confirmed.length} 条`
                : // 说「已确认 N 条」会把拒绝掉的那些从用户视野里抹掉：
                  // 他明明处理了 3 条，界面却说「已确认 1 条」
                  `已处理 ${items.length} 条，其中 ${confirmed.length} 条将执行`}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Badge tone="neutral">待确认 {pending}</Badge>
          <Badge tone={handled > 0 ? 'success' : 'neutral'}>已处理 {handled}</Badge>
        </div>
      </CardHeader>
      <CardBody>
        {/* 截断要如实说：不说的话，用户以为模型只报了这些 */}
        {droppedCount > 0 ? (
          <p className="mb-2 rounded-lg border border-warning-200 bg-warning-50 px-3 py-2 text-xs text-warning-700">
            模型还报了 {droppedCount} 条，为避免一次要确认太多，只保留了前 {MAX_ISSUES} 条。
          </p>
        ) : null}

        <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-line pb-3">
          <label className="flex items-center gap-1.5 text-xs text-ink-muted">
            状态
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as 'all' | ReviewDecision)}
              className="h-8 rounded-lg border border-line-strong bg-surface px-2 text-xs text-ink"
            >
              <option value="all">全部状态</option>
              <option value="pending">待确认</option>
              <option value="accepted">已接受</option>
              <option value="modified">已修改</option>
              <option value="rejected">已拒绝</option>
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-xs text-ink-muted">
            字段
            <select
              value={field}
              onChange={(event) => setField(event.target.value)}
              className="h-8 rounded-lg border border-line-strong bg-surface px-2 text-xs text-ink"
            >
              <option value="all">全部字段</option>
              {fields.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          {status !== 'all' || field !== 'all' ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setStatus('all');
                setField('all');
              }}
            >
              清除筛选
            </Button>
          ) : null}
          <span className="ml-auto text-xs text-ink-muted">
            显示 {filtered.length} / {items.length} 条
          </span>
        </div>

        {filtered.length === 0 ? (
          <EmptyState title="没有符合筛选条件的条目" description="换一个状态或字段试试。" />
        ) : (
          <ul className="space-y-2">
            {filtered.map((item) => (
              <IssueCard key={item.id} item={item} />
            ))}
          </ul>
        )}

        <div className="mt-4 border-t border-line pt-3">
          {isStale && !isExecuted ? (
            <Notice tone="warning" testId="review-stale-version" className="mb-3">
              这批建议属于旧版本 v{runVersion}，当前数据是 v{dataVersion}，已失效 ——
              数据在这之后被清洗或撤销过，请重新分析后再按新结论执行。
            </Notice>
          ) : null}

          {/* 手机上操作区固定到底部：审阅列表一长，执行入口就滚出屏幕，
              而「确认」这件事不该藏在滚动里。md 起回到文档流，桌面版式不变 */}
          <div
            className={cn(
              'fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface px-4 py-3',
              'shadow-[0_-2px_12px_rgba(22,33,31,0.08)]',
              'md:static md:z-auto md:border-0 md:bg-transparent md:px-0 md:py-0 md:shadow-none',
            )}
            data-testid="cleaning-actions"
          >
            {showPreview ? (
              <p className="mb-2 text-xs text-ink-muted" data-testid="cleaning-preview">
                执行前预览：改动 {preview.changedCells} 个单元格、删除 {preview.deletedRows} 行；
                {preview.skippedActions} 条动作无法执行。
                <span className="ml-1">只是试算，点执行之前不会改动任何数据。</span>
              </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              {/* 解禁条件写死在 disabled 上，而不是靠 onClick 里的判断：
                  按钮可点却什么都不做，用户会以为程序坏了；
                  更糟的是会以为数据已经被清洗过 */}
              <Button
                size="md"
                className="w-full md:w-auto"
                disabled={cannotExecute}
                onClick={() => {
                  const result = useProvenanceStore.getState().apply(confirmed);
                  setOutcome(result);

                  // 一条都没真正改成数据时不动版本号：否则会凭空多出一版。
                  // 但「只确认、不改数据」的建议也算处理完，要锁定 —— 否则同一批
                  // 人工判断可以反复点执行，界面会读成「还没处理」。有 skipped 的
                  // 不锁：用户还要回去改参数或补理由后重试。
                  if (result.applied === 0) {
                    if (result.skipped === 0) {
                      useReviewStore
                        .getState()
                        .markExecuted(useDatasetStore.getState().dataVersion);
                    }
                    return;
                  }
                  const current = useProvenanceStore.getState().current;
                  if (current === null) return;
                  const version = useDatasetStore.getState().syncWorkingDataset(current);
                  useReviewStore.getState().markExecuted(version);
                }}
              >
                执行清洗（{confirmed.length} 条）
              </Button>
              {isExecuted ? <Badge tone="success">已执行 v{executedVersion}</Badge> : null}
            </div>

            {outcome && (
              <p
                className={cn(
                  'mt-1.5 rounded-lg px-3 py-2 text-xs',
                  outcome.skipped > 0
                    ? 'bg-warning-50 text-warning-700'
                    : 'bg-success-50 text-success-700',
                )}
                data-testid="cleaning-outcome"
              >
                已应用 {outcome.applied} 条动作、改动 {outcome.changedCells} 个单元格
                {outcome.skipped > 0 ? `；${outcome.skipped} 条未能执行，原因见下方` : ''}。
              </p>
            )}
            <p className="mt-1.5 text-xs text-ink-muted">{hint}</p>
          </div>

          {/* 固定条脱离文档流，用等高空位把卡片底部垫起来，否则最后几条会被挡住 */}
          <div aria-hidden="true" className="h-40 md:hidden" />
        </div>
      </CardBody>
    </Card>
  );
}
