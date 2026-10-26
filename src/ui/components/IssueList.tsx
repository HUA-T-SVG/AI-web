'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, Filter, Info, ShieldAlert } from 'lucide-react';
import type { QualityIssue, Severity } from '@/core';
import { actionDisplayName } from '@/core';
import type { ChecksStatus } from '@/ui/stores/datasetStore';
import {
  REVIEW_STATUS_LABEL,
  REVIEW_STATUS_ORDER,
  type IssueReviewStatus,
} from '@/ui/lib/reviewStatus';
import { Badge } from '@/ui/components/base/Badge';
import { Card, CardBody, CardHeader, CardTitle } from '@/ui/components/base/Card';
import { EmptyState } from '@/ui/components/base/EmptyState';
import { Spinner } from '@/ui/components/base/Spinner';
import { Button } from '@/ui/components/base/Button';
import { cn } from '@/ui/lib/cn';

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

const SEVERITY_ICON: Record<Severity, typeof AlertTriangle> = {
  high: ShieldAlert,
  medium: AlertTriangle,
  low: Info,
};

/**
 * 复核状态的颜色：待确认用警示色（还有事要做），已接受用成功色，
 * 已拒绝用中性色（已处理，但不改数据），已执行用主色（动作已落地）。
 * 文案仍是主要信息，颜色只是辅助。
 */
const REVIEW_STATUS_TONE: Record<IssueReviewStatus, 'neutral' | 'brand' | 'medium' | 'success'> = {
  pending: 'medium',
  accepted: 'success',
  rejected: 'neutral',
  executed: 'brand',
};

type SeverityFilter = 'all' | Severity;

/** 行号最多列这么多，再多就折叠，避免证据区被一串数字淹没 */
const MAX_SHOWN_ROWS = 20;

function IssueCard({
  issue,
  selected,
  onSelect,
  reviewStatus,
  onJumpToRow,
}: {
  issue: QualityIssue;
  selected: boolean;
  onSelect: (id: string) => void;
  reviewStatus?: IssueReviewStatus | null;
  onJumpToRow?: (issue: QualityIssue, rowIndex: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const rowIndices = issue.evidence.rowIndices ?? [];
  const SeverityIcon = SEVERITY_ICON[issue.severity];

  return (
    <div
      className={cn(
        'border-b border-line last:border-b-0',
        selected ? 'border-l-2 border-l-brand-600 bg-brand-50/40' : '',
      )}
      data-selected={selected ? 'true' : undefined}
    >
      <button
        type="button"
        data-testid="issue-card"
        onClick={() => {
          onSelect(issue.id);
          setExpanded((value) => !value);
        }}
        aria-expanded={expanded}
        className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-brand-50/40"
      >
        {expanded ? (
          <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
        ) : (
          <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={SEVERITY_TONE[issue.severity]}>
              <SeverityIcon className="h-3 w-3" aria-hidden="true" />
              {SEVERITY_LABEL[issue.severity]}
            </Badge>
            <p className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{issue.title}</p>
            {/* 设计文档要求每条问题带上状态；没有关联建议时宁可不显示，
                也不补一个「待确认」—— 那会把「还没让 AI 复核」说成「等你确认」 */}
            {reviewStatus !== null && reviewStatus !== undefined ? (
              <Badge
                tone={REVIEW_STATUS_TONE[reviewStatus]}
                data-testid="issue-review-badge"
              >
                {REVIEW_STATUS_LABEL[reviewStatus]}
              </Badge>
            ) : null}
          </div>
          <p
            data-testid="issue-description-preview"
            className="mt-1 line-clamp-2 text-xs leading-relaxed text-ink-muted"
          >
            {issue.description}
          </p>
          {issue.evidence.columns.length > 0 ? (
            <p className="mt-1.5 flex flex-wrap gap-1">
              {issue.evidence.columns.slice(0, 5).map((column) => (
                <span
                  key={column}
                  className="rounded bg-canvas px-1.5 py-0.5 text-[11px] text-ink-muted"
                >
                  {column}
                </span>
              ))}
            </p>
          ) : null}
        </div>
      </button>

      {expanded ? (
        <div
          data-testid="issue-expanded"
          className="space-y-3 border-t border-line bg-canvas px-4 pb-4 pt-3 text-xs"
        >
          {/* 预览只有两行，长描述会被截掉半句；展开区必须给出全文，
              否则手机上只能靠 title 悬浮提示，而触屏根本没有悬浮 */}
          <div>
            <p className="font-medium text-ink">完整描述</p>
            <p
              data-testid="issue-description-full"
              className="mt-0.5 break-words leading-relaxed text-ink-muted"
            >
              {issue.description}
            </p>
          </div>

          <div>
            <p className="font-medium text-ink">涉及列</p>
            <p className="mt-0.5 break-words text-ink-muted">
              {issue.evidence.columns.join('、') || '—'}
            </p>
          </div>

          <div>
            <p className="font-medium text-ink">证据</p>
            <dl className="mt-0.5 space-y-0.5">
              {Object.entries(issue.evidence.statistics).map(([key, value]) => (
                <div key={key} className="flex gap-2">
                  <dt className="shrink-0 text-ink-muted">{key}</dt>
                  {/* 证据值可能是整串取值（如「本科、硕士、研究生」），窄屏下
                      不换行会把整张卡片撑出横向滚动 */}
                  <dd data-testid="issue-evidence-value" className="min-w-0 break-words text-ink">
                    {String(value)}
                  </dd>
                </div>
              ))}
            </dl>

            {rowIndices.length > 0 ? (
              <div className="mt-1">
                <p className="text-ink-muted">涉及行号（点数字跳到下方对应行）：</p>
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  {rowIndices.slice(0, MAX_SHOWN_ROWS).map((index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => onJumpToRow?.(issue, index)}
                      aria-label={`跳到第 ${index + 1} 行`}
                      className="rounded border border-line-strong bg-surface px-1.5 py-0.5 tabular-nums text-brand-700 transition-colors hover:border-brand-300 hover:bg-brand-50 max-md:min-h-11"
                    >
                      {index + 1}
                    </button>
                  ))}
                  {rowIndices.length > MAX_SHOWN_ROWS ? (
                    <span className="text-ink-muted">等 {rowIndices.length} 行</span>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>

          {issue.suggestion ? (
            <div className="rounded-lg border border-line bg-surface px-3 py-2">
              <p className="font-medium text-ink">建议：{actionDisplayName(issue.suggestion.action)}</p>
              <p className="mt-0.5 break-words leading-relaxed text-ink-muted">
                {issue.suggestion.rationale}
              </p>
            </div>
          ) : null}

          <p className="text-ink-muted">
            置信度 {(issue.confidence * 100).toFixed(0)}% · 检查项 {issue.checkId}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
  count,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
  count: number;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors max-md:min-h-11',
        active
          ? 'border-brand-600 bg-brand-700 text-white'
          : 'border-line-strong bg-surface text-ink-muted hover:border-brand-200 hover:text-brand-800',
      )}
    >
      {children}
      <span className={cn('tabular-nums', active ? 'text-brand-100' : 'text-ink-muted')}>
        {count}
      </span>
    </button>
  );
}

export function IssueList({
  issues,
  checksStatus = 'done',
  selectedId,
  onSelect,
  reviewStatuses,
  onJumpToRow,
  focusCheckIds,
  focusLabel,
}: {
  issues: QualityIssue[];
  checksStatus?: ChecksStatus;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  /**
   * 每条规则问题对应的复核状态（检查项 + 字段相同即视为同一条，见
   * `ui/lib/reviewStatus`）。没有 AI 分析结果时整体不传，筛选区也不显示 ——
   * 不能让人对着永远为 0 的「已接受」猜是不是坏了。
   */
  reviewStatuses?: Record<string, IssueReviewStatus | null>;
  /** 展开区里点行号：把下方数据表滚到该行并高亮（设计文档 §四「定位交互」） */
  onJumpToRow?: (issue: QualityIssue, rowIndex: number) => void;
  /**
   * 场景推荐的检查项。**只用于筛选显示，不改变实际跑过的检查** ——
   * 8 项检查始终全跑，这里筛掉的只是「本次不必先看」的条目。
   */
  focusCheckIds?: readonly string[];
  /** 「本次重点」的说明用（场景标题），用于空清单时告诉用户筛的是什么 */
  focusLabel?: string;
}) {
  const [severity, setSeverity] = useState<SeverityFilter>('all');
  const [field, setField] = useState('all');
  const [review, setReview] = useState<'all' | IssueReviewStatus>('all');
  const [focusOnly, setFocusOnly] = useState(false);

  // 「本次重点」筛选在切换场景/文件时由调用方用 `key` 重挂组件来复位：
  // 在 effect 里同步 setState 会触发级联渲染（react-hooks 规则直接报 error），
  // 而把上一份数据的重点筛到新数据上又确实是错的，所以复位交给 key 而不是 effect

  // 设计文档要求问题列表默认按严重程度降序；同一严重度内保持检查产出的原顺序
  const orderedIssues = useMemo(() => {
    const rank: Record<Severity, number> = { high: 3, medium: 2, low: 1 };
    return [...issues].sort((left, right) => rank[right.severity] - rank[left.severity]);
  }, [issues]);

  const counts = useMemo(
    () =>
      orderedIssues.reduce<Record<Severity, number>>(
        (acc, issue) => {
          acc[issue.severity] += 1;
          return acc;
        },
        { high: 0, medium: 0, low: 0 },
      ),
    [orderedIssues],
  );

  // 复核状态的条数按「有问题关联」来数：没有对应 AI 建议的问题不属于任何状态
  const reviewCounts = useMemo(() => {
    const result: Record<IssueReviewStatus, number> = {
      pending: 0,
      accepted: 0,
      rejected: 0,
      executed: 0,
    };
    if (!reviewStatuses) return result;
    for (const issue of orderedIssues) {
      const status = reviewStatuses[issue.id];
      if (status) result[status] += 1;
    }
    return result;
  }, [orderedIssues, reviewStatuses]);

  const hasReviewStatus = REVIEW_STATUS_ORDER.some((status) => reviewCounts[status] > 0);

  /** 「本次重点」的条数：只数推荐检查项里的问题，不改任何统计口径 */
  const focusCount = useMemo(
    () =>
      focusCheckIds === undefined
        ? 0
        : orderedIssues.filter((issue) => focusCheckIds.includes(issue.checkId)).length,
    [orderedIssues, focusCheckIds],
  );

  const fields = useMemo(() => {
    const names = new Set<string>();
    for (const issue of orderedIssues) {
      for (const column of issue.evidence.columns) names.add(column);
    }
    return [...names];
  }, [orderedIssues]);

  const filtered = useMemo(
    () =>
      orderedIssues.filter((issue) => {
        if (severity !== 'all' && issue.severity !== severity) return false;
        if (field !== 'all' && !issue.evidence.columns.includes(field)) return false;
        if (review !== 'all') {
          const status = reviewStatuses?.[issue.id] ?? null;
          if (status !== review) return false;
        }
        if (focusOnly && focusCheckIds !== undefined && !focusCheckIds.includes(issue.checkId)) {
          return false;
        }
        return true;
      }),
    [orderedIssues, severity, field, review, reviewStatuses, focusOnly, focusCheckIds],
  );

  const hasFilter = severity !== 'all' || field !== 'all' || review !== 'all' || focusOnly;

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>发现的问题</CardTitle>
          <p className="mt-0.5 text-xs text-ink-muted">
            {checksStatus === 'running'
              ? '检查进行中'
              : checksStatus === 'failed'
                ? '检查未完成'
                : `共 ${issues.length} 条，可按严重程度与字段筛选`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {counts.high > 0 ? <Badge tone="high">严重 {counts.high}</Badge> : null}
          {counts.medium > 0 ? <Badge tone="medium">中等 {counts.medium}</Badge> : null}
          {counts.low > 0 ? <Badge tone="low">轻微 {counts.low}</Badge> : null}
          {issues.length === 0 && checksStatus === 'done' ? (
            <Badge tone="success">未检出问题</Badge>
          ) : null}
        </div>
      </CardHeader>

      <CardBody className="p-0">
        {issues.length === 0 ? (
          checksStatus === 'running' ? (
            // 检查跑在后台线程，还没回来。这时候说「没有发现质量问题」就是
            // 把一个我们并不知道的结论告诉用户 —— 而它听起来像是好消息
            <div
              data-testid="issues-checking"
              className="flex items-center gap-2 px-4 py-6 text-sm text-ink-muted"
              role="status"
            >
              <Spinner />
              正在检查，结果马上出来…
            </div>
          ) : checksStatus === 'failed' ? (
            // 检查没跑完时**不能**落到「没有发现质量问题」这一支：那是同一屏上
            // 两个相反的结论，而用户（和答辩截图）记住的会是卡片里这一句
            <div data-testid="issues-failed" className="px-4 py-6 text-sm text-warning-700">
              检查未完成，结论未知。上面的说明里有原因。
            </div>
          ) : (
            <EmptyState
              title="没有发现质量问题"
              description="这不代表数据一定没问题——检查只能覆盖它能识别的模式。"
            />
          )
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
              {focusCheckIds !== undefined ? (
                <FilterChip
                  active={focusOnly}
                  onClick={() => setFocusOnly((value) => !value)}
                  count={focusCount}
                >
                  本次重点
                </FilterChip>
              ) : null}
              <span className="inline-flex items-center gap-1 text-xs text-ink-muted">
                <Filter className="h-3.5 w-3.5" aria-hidden="true" />
                严重度
              </span>
              <FilterChip
                active={severity === 'all'}
                onClick={() => setSeverity('all')}
                count={issues.length}
              >
                全部
              </FilterChip>
              {(['high', 'medium', 'low'] as const).map((level) =>
                counts[level] > 0 ? (
                  <FilterChip
                    key={level}
                    active={severity === level}
                    onClick={() => setSeverity(severity === level ? 'all' : level)}
                    count={counts[level]}
                  >
                    {SEVERITY_LABEL[level]}
                  </FilterChip>
                ) : null,
              )}

              {/* 复核状态来自 AI 分析：只有产生了 AI 建议、且能按「检查项 + 字段」
                  关联到问题上时才有意义。没分析过就整组不显示，而不是摆一排 0 */}
              {hasReviewStatus ? (
                <>
                  <span className="inline-flex items-center gap-1 text-xs text-ink-muted">
                    复核
                  </span>
                  {REVIEW_STATUS_ORDER.filter((status) => reviewCounts[status] > 0).map(
                    (status) => (
                      <FilterChip
                        key={status}
                        active={review === status}
                        onClick={() => setReview(review === status ? 'all' : status)}
                        count={reviewCounts[status]}
                      >
                        {REVIEW_STATUS_LABEL[status]}
                      </FilterChip>
                    ),
                  )}
                </>
              ) : null}

              <label className="ml-auto flex items-center gap-1.5 text-xs text-ink-muted">
                字段
                <select
                  value={field}
                  onChange={(event) => setField(event.target.value)}
                  className="h-8 rounded-lg border border-line-strong bg-surface px-2 text-xs text-ink max-md:h-11"
                >
                  <option value="all">全部字段</option>
                  {fields.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>

              {hasFilter ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSeverity('all');
                    setField('all');
                    setReview('all');
                    setFocusOnly(false);
                  }}
                >
                  清除筛选
                </Button>
              ) : null}
            </div>

            {hasReviewStatus ? (
              <p className="px-4 pt-2 text-xs text-ink-muted">
                复核状态按「同一检查项 + 同一字段」关联到 AI 分析的建议；
                没有对应建议的问题只在「全部」里出现。
              </p>
            ) : null}

            <p className="px-4 pt-2 text-xs text-ink-muted" role="status">
              显示 {filtered.length} / {issues.length} 条
            </p>

            {filtered.length === 0 ? (
              <EmptyState
                title="没有符合筛选条件的问题"
                description={
                  focusOnly
                    ? `「${focusLabel ?? '本次重点'}」里没有符合当前筛选条件的问题；关掉「本次重点」可以回到全部，或换一个严重程度/字段。`
                    : review !== 'all'
                      ? '换一个复核状态、严重程度或字段试试。'
                      : '换一个严重程度或字段试试。'
                }
              />
            ) : (
              <div className="max-h-[560px] overflow-auto">
                {filtered.map((issue) => (
                  <IssueCard
                    key={issue.id}
                    issue={issue}
                    selected={selectedId === issue.id}
                    onSelect={onSelect ?? (() => {})}
                    reviewStatus={reviewStatuses?.[issue.id] ?? null}
                    onJumpToRow={onJumpToRow}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </CardBody>
    </Card>
  );
}
