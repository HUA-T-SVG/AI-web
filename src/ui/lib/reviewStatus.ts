import type { QualityIssue } from '@/core';
import type { ReviewItem } from '@/ui/stores/reviewStore';

export type IssueReviewStatus = 'pending' | 'accepted' | 'rejected' | 'executed' | 'unchanged' | 'skipped';

export const REVIEW_STATUS_LABEL: Record<IssueReviewStatus, string> = {
  pending: '待确认',
  accepted: '已接受',
  rejected: '已拒绝',
  executed: '已执行',
  unchanged: '无数据改动',
  skipped: '未能执行',
};

export const REVIEW_STATUS_ORDER = ['pending', 'accepted', 'rejected', 'executed', 'unchanged', 'skipped'] as const;

function sameMembers<T>(a: readonly T[], b: readonly T[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return set.size === new Set(b).size && b.every((value) => set.has(value));
}

// createIssueId 末尾是本次调用的序号；独立运行两次会为同一目标分配不同序号。
function stableTarget(issue: QualityIssue): string {
  return issue.id.startsWith(`${issue.checkId}:`) ? issue.id.replace(/:\d+$/, '') : issue.id;
}

/** 只认本地依据。按字段运行值域时列序号会不同，因此用规则 ID 和原表列号对齐。 */
export function reviewItemMatchesIssue(item: ReviewItem, issue: QualityIssue): boolean {
  const check = item.evidence?.check;
  if (!check || check.checkId !== issue.checkId ||
      !sameMembers(check.evidence.columns, issue.evidence.columns)) return false;
  if (issue.checkId === 'range-rules') {
    if (check.evidence.statistics.ruleId !== issue.evidence.statistics.ruleId ||
        (check.columnIndex !== undefined
          ? check.columnIndex !== Number(issue.evidence.statistics.columnNumber) - 1
          : stableTarget(check) !== stableTarget(issue))) return false;
  } else if (stableTarget(check) !== stableTarget(issue)) return false;
  return sameMembers(check.evidence.rowIndices ?? [], issue.evidence.rowIndices ?? []);
}

export function reviewStatusOfIssue(
  issue: QualityIssue,
  items: ReviewItem[],
  version: number,
): IssueReviewStatus | null {
  const matched = items.filter((item) => reviewItemMatchesIssue(item, issue));
  const statuses = matched.map((item): IssueReviewStatus => {
    if (item.execution?.version === version) return item.execution.status;
    return item.decision === 'modified' ? 'accepted' : item.decision;
  });
  // 同一个问题还有待处理的动作时，不让做完的动作盖住它。
  return (['pending', 'skipped', 'accepted', 'executed', 'unchanged', 'rejected'] as const)
    .find((status) => statuses.includes(status)) ?? null;
}

export function reviewStatusesOf(
  issues: QualityIssue[],
  items: ReviewItem[],
  version: number,
): Record<string, IssueReviewStatus | null> {
  return Object.fromEntries(issues.map((issue) => [issue.id, reviewStatusOfIssue(issue, items, version)]));
}
