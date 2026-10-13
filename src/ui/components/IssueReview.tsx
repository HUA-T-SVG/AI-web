'use client';

import { useState } from 'react';
import type { Severity } from '@/core';
import {
  MAX_ISSUES,
  confirmedActionsOf,
  useReviewStore,
  type ReviewItem,
} from '@/ui/stores/reviewStore';
import { Button } from '@/ui/components/base/Button';
import { useProvenanceStore } from '@/ui/stores/provenanceStore';
import { Card, CardBody, CardHeader, CardTitle } from '@/ui/components/base/Card';

/**
 * 严重度用「文字 + 颜色」双重表达。
 *
 * 只靠颜色的话，色觉障碍的读者拿不到这个信息 —— 而严重度直接决定他去不去看。
 */
const SEVERITY: Record<Severity, { label: string; className: string }> = {
  high: { label: '严重', className: 'border-red-200 bg-red-50 text-red-800' },
  medium: { label: '中等', className: 'border-amber-200 bg-amber-50 text-amber-800' },
  low: { label: '轻微', className: 'border-neutral-200 bg-neutral-50 text-neutral-600' },
};

function IssueCard({ item }: { item: ReviewItem }) {
  const decide = useReviewStore((state) => state.decide);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState('');

  const severity = SEVERITY[item.issue.severity];
  const decided = item.decision !== 'pending';

  return (
    <li className="rounded-md border border-neutral-200 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded border px-1.5 py-0.5 text-[11px] ${severity.className}`}>
          {severity.label}
        </span>
        <p className="text-sm font-medium text-neutral-900">{item.issue.title}</p>
      </div>

      <p className="mt-1.5 text-xs text-neutral-600">{item.issue.description}</p>

      {/* 只给列名与行数，不复述整行原始数据：用户在自己的浏览器里看得到，
          我们没必要再抄一遍，抄了反而多一处泄露面 */}
      <p className="mt-1 text-xs text-neutral-500">
        涉及列：{item.issue.columns.length > 0 ? item.issue.columns.join('、') : '全表'}
        {item.issue.rowIndices && item.issue.rowIndices.length > 0
          ? ` · ${item.issue.rowIndices.length} 行`
          : ''}
      </p>

      <p className="mt-2 rounded bg-neutral-50 px-2 py-1.5 text-xs text-neutral-700">
        建议：{item.issue.suggestion.rationale}
      </p>

      {noteOpen && !decided ? (
        <div className="mt-2">
          <label className="text-xs text-neutral-500" htmlFor={`note-${item.id}`}>
            填写理由会记入处理日志
          </label>
          <input
            id={`note-${item.id}`}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            className="mt-1 w-full rounded-md border border-neutral-200 px-2 py-1.5 text-xs outline-none focus:border-neutral-400"
          />
        </div>
      ) : null}

      {decided ? (
        <p className="mt-2 text-xs text-neutral-600">
          你的决定：
          {item.decision === 'accepted'
            ? '接受'
            : item.decision === 'modified'
              ? '修改后执行'
              : '拒绝'}
          {item.note ? ` · ${item.note}` : ''}
          <button
            type="button"
            className="ml-2 underline"
            onClick={() => decide(item.id, 'pending')}
          >
            撤销
          </button>
        </p>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          <Button size="sm" onClick={() => decide(item.id, 'accepted')}>
            接受
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              if (!noteOpen) {
                setNoteOpen(true);
                return;
              }
              // 注意：这一版只记录「用户改过」与理由，**不承载具体改成什么** ——
              // 修改内容要有地方定义动作参数，那是 Plan 3 清洗执行的事。
              // 在那之前，别把「修改后执行」当成「已经按用户意图改过了」
              decide(item.id, 'modified', note || undefined);
            }}
          >
            {noteOpen ? '确认修改' : '修改'}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              if (!noteOpen) {
                setNoteOpen(true);
                return;
              }
              decide(item.id, 'rejected', note || undefined);
            }}
          >
            {noteOpen ? '确认拒绝' : '拒绝'}
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
  const confirmed = confirmedActionsOf(items);
  const [outcome, setOutcome] = useState<{
    applied: number;
    skipped: number;
    changedCells: number;
  } | null>(null);

  if (items.length === 0) return null;

  const pending = items.filter((item) => item.decision === 'pending').length;

  return (
    <Card className="mt-4" data-testid="issue-review">
      <CardHeader>
        <CardTitle>发现的问题</CardTitle>
        <p className="mt-1 text-xs text-neutral-500">
          {pending > 0
            ? `还有 ${pending} 条未确认，确认之前不会对数据做任何改动`
            : confirmed.length === items.length
              ? `已确认 ${confirmed.length} 条`
              : // 说「已确认 N 条」会把拒绝掉的那些从用户视野里抹掉：
                // 他明明处理了 3 条，界面却说「已确认 1 条」
                `已处理 ${items.length} 条，其中 ${confirmed.length} 条将执行`}
        </p>
        {/* 截断要如实说：不说的话，用户以为模型只报了这些 */}
        {droppedCount > 0 ? (
          <p className="mt-1 text-xs text-amber-700">
            模型还报了 {droppedCount} 条，为避免一次要确认太多，只保留了前 {MAX_ISSUES} 条。
          </p>
        ) : null}
      </CardHeader>
      <CardBody>
        <ul className="space-y-2">
          {items.map((item) => (
            <IssueCard key={item.id} item={item} />
          ))}
        </ul>

        <div className="mt-4 border-t border-neutral-100 pt-3">
          {/* 解禁条件写死在 disabled 上，而不是靠 onClick 里的判断：
              按钮可点却什么都不做，用户会以为程序坏了；
              更糟的是会以为数据已经被清洗过 */}
          <Button
            size="sm"
            disabled={pending > 0 || confirmed.length === 0}
            onClick={() => {
              const outcome = useProvenanceStore.getState().apply(confirmed);
              setOutcome(outcome);
            }}
          >
            执行清洗（{confirmed.length} 条）
          </Button>
          {outcome && (
            <p className="mt-1.5 text-xs text-neutral-700" data-testid="cleaning-outcome">
              已应用 {outcome.applied} 条动作、改动 {outcome.changedCells} 个单元格
              {outcome.skipped > 0 ? `；${outcome.skipped} 条未能执行，原因见下方` : ''}。
            </p>
          )}
          <p className="mt-1.5 text-xs text-neutral-500">
            {pending > 0
              ? '还有未确认的条目，先逐条处理完。'
              : confirmed.length === 0
                ? '没有已确认的条目，清洗会改不动数据。'
                : '只对已确认的条目生效；原始数据不会被改动，可以随时撤销。'}
          </p>
        </div>
      </CardBody>
    </Card>
  );
}
