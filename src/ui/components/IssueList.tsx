'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { QualityIssue, Severity } from '@/core';
import { Badge } from '@/ui/components/base/Badge';
import { Card, CardBody, CardHeader, CardTitle } from '@/ui/components/base/Card';
import { EmptyState } from '@/ui/components/base/EmptyState';

const SEVERITY_LABEL: Record<Severity, string> = {
  high: '严重',
  medium: '中等',
  low: '轻微',
};

const SEVERITY_TONE: Record<Severity, 'high' | 'medium' | 'low'> = {
  high: 'high',
  medium: 'medium',
  low: 'low',
};

/** 行号最多列这么多，再多就折叠，避免证据区被一串数字淹没 */
const MAX_SHOWN_ROWS = 20;

function IssueCard({ issue }: { issue: QualityIssue }) {
  const [expanded, setExpanded] = useState(false);
  const rowIndices = issue.evidence.rowIndices ?? [];

  return (
    <div className="border-b border-neutral-100 last:border-b-0">
      <button
        type="button"
        data-testid="issue-card"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        className="flex w-full items-start gap-2 px-4 py-3 text-left hover:bg-neutral-50"
      >
        {expanded ? (
          <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-neutral-400" aria-hidden="true" />
        ) : (
          <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-neutral-400" aria-hidden="true" />
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Badge tone={SEVERITY_TONE[issue.severity]}>{SEVERITY_LABEL[issue.severity]}</Badge>
            <p className="truncate text-sm text-neutral-800">{issue.title}</p>
          </div>
          <p className="mt-1 line-clamp-2 text-xs text-neutral-500">{issue.description}</p>
        </div>
      </button>

      {expanded ? (
        <div className="space-y-3 bg-neutral-50 px-4 pb-4 pt-1 text-xs">
          <div>
            <p className="font-medium text-neutral-700">涉及列</p>
            <p className="mt-0.5 text-neutral-600">{issue.evidence.columns.join('、') || '—'}</p>
          </div>

          <div>
            <p className="font-medium text-neutral-700">证据</p>
            <dl className="mt-0.5 space-y-0.5">
              {Object.entries(issue.evidence.statistics).map(([key, value]) => (
                <div key={key} className="flex gap-2">
                  <dt className="text-neutral-500">{key}</dt>
                  <dd className="text-neutral-700">{String(value)}</dd>
                </div>
              ))}
            </dl>

            {rowIndices.length > 0 ? (
              <p className="mt-1 text-neutral-600">
                涉及行号：
                {rowIndices
                  .slice(0, MAX_SHOWN_ROWS)
                  .map((index) => index + 1)
                  .join('、')}
                {rowIndices.length > MAX_SHOWN_ROWS
                  ? ` 等 ${rowIndices.length} 行`
                  : ''}
              </p>
            ) : null}
          </div>

          {issue.suggestion ? (
            <div>
              <p className="font-medium text-neutral-700">建议：{issue.suggestion.action}</p>
              <p className="mt-0.5 text-neutral-600">{issue.suggestion.rationale}</p>
            </div>
          ) : null}

          <p className="text-neutral-500">
            置信度 {(issue.confidence * 100).toFixed(0)}% · 检查项 {issue.checkId}
          </p>
        </div>
      ) : null}
    </div>
  );
}

export function IssueList({ issues }: { issues: QualityIssue[] }) {
  const counts = issues.reduce<Record<Severity, number>>(
    (acc, issue) => {
      acc[issue.severity] += 1;
      return acc;
    },
    { high: 0, medium: 0, low: 0 },
  );

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <CardTitle>发现的问题</CardTitle>
        <div className="flex items-center gap-1.5">
          {counts.high > 0 ? <Badge tone="high">严重 {counts.high}</Badge> : null}
          {counts.medium > 0 ? <Badge tone="medium">中等 {counts.medium}</Badge> : null}
          {counts.low > 0 ? <Badge tone="low">轻微 {counts.low}</Badge> : null}
        </div>
      </CardHeader>

      <CardBody className="p-0">
        {issues.length === 0 ? (
          <EmptyState
            title="没有发现质量问题"
            description="这不代表数据一定没问题——检查只能覆盖它能识别的模式。"
          />
        ) : (
          <div className="max-h-[520px] overflow-auto">
            {issues.map((issue) => (
              <IssueCard key={issue.id} issue={issue} />
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
