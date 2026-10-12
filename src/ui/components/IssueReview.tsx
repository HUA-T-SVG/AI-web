'use client';

import { useState } from 'react';
import type { Severity } from '@/core';
import { confirmedActionsOf, useReviewStore, type ReviewItem } from '@/ui/stores/reviewStore';
import { Button } from '@/ui/components/base/Button';
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
  const confirmed = confirmedActionsOf(items);

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
      </CardHeader>
      <CardBody>
        <ul className="space-y-2">
          {items.map((item) => (
            <IssueCard key={item.id} item={item} />
          ))}
        </ul>

        <div className="mt-4 border-t border-neutral-100 pt-3">
          {/* 恒定禁用，直到 Plan 3 把执行做出来。
              「未实现的功能要禁用 + 标注原因」是既定约定：让它可点却没有
              onClick，用户会以为程序坏了；更糟的是会以为数据已经被清洗过 */}
          <Button size="sm" disabled title="清洗执行属于 Plan 3">
            执行清洗（{confirmed.length} 条）
          </Button>
          <p className="mt-1.5 text-xs text-neutral-500">
            {pending > 0
              ? '还有未确认的条目，先逐条处理完。'
              : '所有条目都处理完了。清洗执行与处理留痕属于 Plan 3，这一版只完成确认环节。'}
          </p>
        </div>
      </CardBody>
    </Card>
  );
}
