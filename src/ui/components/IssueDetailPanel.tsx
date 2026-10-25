'use client';

import type { QualityIssue } from '@/core';
import { Badge } from '@/ui/components/base/Badge';
import { Card, CardBody, CardHeader, CardTitle } from '@/ui/components/base/Card';
import { EmptyState } from '@/ui/components/base/EmptyState';
import { checkLabel } from '@/ui/lib/checkLabels';

const SEVERITY = {
  high: { label: '严重', tone: 'high' as const },
  medium: { label: '中等', tone: 'medium' as const },
  low: { label: '轻微', tone: 'low' as const },
};

/** 证据字段的中文名。未知字段保留原键，至少不会丢信息。 */
const EVIDENCE_LABEL: Record<string, string> = {
  violationCount: '越界取值数',
  columnNumber: '列序号',
  values: '越界取值',
  ruleId: '规则标识',
  missingCount: '缺失数',
  missingRate: '缺失率',
  totalRows: '总行数',
  duplicateRows: '重复行数',
  outlierCount: '异常值数',
  method: '判定方法',
  min: '最小值',
  max: '最大值',
  observedCount: '参与统计取值数',
  offendingCount: '异常取值数',
  offendingValues: '异常取值',
  numericCount: '数值取值数',
  nonNumericCount: '非数值取值数',
  units: '单位',
  unitCount: '单位种类数',
  dominantUnit: '主要单位',
  dominantCount: '主要单位出现数',
  bareNumberCount: '无单位取值数',
  columnIndices: '重复列序号',
  occurrenceCount: '出现次数',
};

const ACTION_LABEL: Record<string, string> = {
  merge_categories: '类别归并',
  trim_whitespace: '去除首尾空白',
  fill_missing: '填补缺失',
  remove_duplicates: '去重',
  fill_or_drop: '人工判断（填补或删除）',
  review_range_violations: '人工核对越界取值',
  review_duplicates: '人工确认重复记录',
  review_unit_family: '人工确认单位族',
  review_unit_mix: '人工确认单位混用',
  unify_unit: '统一单位',
  unify_unit_notation: '统一单位写法',
};

/**
 * 选中问题的证据面板（设计文档第四节：左侧问题列表、右侧证据与规则详情）。
 *
 * 它替代原先右侧重复的「全局列画像」：用户选中一条问题后，眼前应当是
 * 这条问题在哪、凭什么报、建议怎么做 —— 列画像属于整份数据，放到下方。
 */
export function IssueDetailPanel({
  issue,
  onJumpToRow,
}: {
  issue: QualityIssue | null;
  /** 点行号时把下方数据表滚到对应行并高亮；设计文档 §四要求「点击行号跳转对应行列」 */
  onJumpToRow?: (rowIndex: number) => void;
}) {
  if (issue === null) {
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle>问题详情</CardTitle>
        </CardHeader>
        <CardBody>
          <EmptyState
            icon={null}
            title="选中左侧一条问题"
            description="这里会显示它的位置、证据、建议动作与检查项；下方原始数据会同步高亮相关记录。"
          />
        </CardBody>
      </Card>
    );
  }

  const severity = SEVERITY[issue.severity];
  const rows = issue.evidence.rowIndices ?? [];
  const action = issue.suggestion?.action;

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>问题详情</CardTitle>
        <Badge tone={severity.tone}>{severity.label}</Badge>
      </CardHeader>
      <CardBody className="space-y-4 text-sm">
        <div>
          <p className="font-medium text-ink">{issue.title}</p>
          <p className="mt-1 text-xs leading-relaxed text-ink-muted">{issue.description}</p>
        </div>

        <div>
          <p className="text-xs font-medium text-ink">位置</p>
          <p className="mt-0.5 text-xs text-ink-muted">
            字段：{issue.evidence.columns.length > 0 ? issue.evidence.columns.join('、') : '全表'}
          </p>
          {rows.length > 0 ? (
            <div className="mt-1">
              <p className="text-xs text-ink-muted">
                行号（从 1 起，点数字跳到下方对应行）：
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-1">
                {rows.slice(0, 20).map((row) => (
                  <button
                    key={row}
                    type="button"
                    onClick={() => onJumpToRow?.(row)}
                    aria-label={`跳到第 ${row + 1} 行`}
                    title={`跳到第 ${row + 1} 行，并在下方原始数据里高亮`}
                    className="rounded border border-line-strong bg-surface px-1.5 py-0.5 text-xs tabular-nums text-brand-700 transition-colors hover:border-brand-300 hover:bg-brand-50"
                  >
                    {row + 1}
                  </button>
                ))}
                {rows.length > 20 ? (
                  <span className="text-xs text-ink-muted">等 {rows.length} 行</span>
                ) : null}
              </div>
            </div>
          ) : (
            <p className="mt-0.5 text-xs text-ink-muted">列级问题，没有具体行号</p>
          )}
        </div>

        <div>
          <p className="text-xs font-medium text-ink">判定依据</p>
          <dl className="mt-1 space-y-1">
            {Object.entries(issue.evidence.statistics).map(([key, value]) => (
              <div key={key} className="flex gap-2 text-xs">
                <dt className="w-32 shrink-0 text-ink-muted">{EVIDENCE_LABEL[key] ?? key}</dt>
                <dd className="min-w-0 break-words text-ink">{String(value)}</dd>
              </div>
            ))}
          </dl>
        </div>

        {issue.suggestion ? (
          <div className="rounded-lg border border-line bg-canvas px-3 py-2">
            <p className="text-xs font-medium text-ink">
              建议动作：{ACTION_LABEL[action ?? ''] ?? action}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-ink-muted">
              {issue.suggestion.rationale}
            </p>
          </div>
        ) : null}

        <div className="border-t border-line pt-3 text-xs text-ink-muted">
          <p>
            检查项：{checkLabel(issue.checkId)}
            <code className="ml-1 text-[11px]">{issue.checkId}</code>
          </p>
          <p className="mt-0.5">置信度 {(issue.confidence * 100).toFixed(0)}% · 内置规则检查</p>
        </div>
      </CardBody>
    </Card>
  );
}
