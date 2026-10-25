import type { QualityIssue } from '@/core';
import type { ReviewItem } from '@/ui/stores/reviewStore';

/**
 * 检查页问题列表的「复核状态」。
 *
 * 规则问题和 AI 建议分属两条数据：前者由八项确定性检查产出，后者由模型逐条
 * `submit_issue` 提交、用户在 AI 分析页逐条决定。设计文档要求检查页的问题列表
 * 支持按复核状态筛选，就只能把两者关联起来 —— 判据是**同一检查项 + 同一字段**。
 *
 * 关联是近似的，这一点不能藏起来：模型可以在同一条检查项下只对部分字段给建议，
 * 也可能把整表级的问题标成某一列。所以界面上只说「该问题有没有对应的复核建议」，
 * 没有对应建议时**不给状态**，而不是替它补一个「待确认」。
 */
export type IssueReviewStatus = 'pending' | 'accepted' | 'rejected' | 'executed';

/** 筛选词按设计文档的顺序排：待确认 → 已接受 → 已拒绝 → 已执行 */
export const REVIEW_STATUS_LABEL: Record<IssueReviewStatus, string> = {
  pending: '待确认',
  accepted: '已接受',
  rejected: '已拒绝',
  executed: '已执行',
};

export const REVIEW_STATUS_ORDER: readonly IssueReviewStatus[] = [
  'pending',
  'accepted',
  'rejected',
  'executed',
];

/**
 * 一条 AI 建议是否对应这条规则问题。
 *
 * - `checkId` 必须相同。它由执行器校验过是真实检查项，所以是可用的关联键；
 * - 字段：任一方没有限定字段时视为整表级，同检查项即关联；否则要求字段有交集。
 *   只看列名不看行号，是因为同一检查项在同列上可能报多条问题，行号交集会把
 *   「已复核」漏成「待确认」。
 */
export function reviewItemMatchesIssue(item: ReviewItem, issue: QualityIssue): boolean {
  if (item.issue.checkId !== issue.checkId) return false;

  const itemColumns = item.issue.columns;
  const issueColumns = issue.evidence.columns;
  if (itemColumns.length === 0 || issueColumns.length === 0) return true;

  return itemColumns.some((column) => issueColumns.includes(column));
}

/**
 * 这条规则问题当前处在哪个复核状态；没有对应的 AI 建议时返回 `null`。
 *
 * 同一检查项可能有多条建议（模型逐条提交），优先级：
 *   已执行 > 待确认 > 已接受 > 已拒绝
 * 待确认排在已接受前面，是因为它代表「还有事要做」——同一个问题上两种状态并存时，
 * 筛选「待确认」必须能把它找出来，否则用户会以为都处理完了。
 */
export function reviewStatusOfIssue(
  issue: QualityIssue,
  items: ReviewItem[],
  executed: boolean,
): IssueReviewStatus | null {
  const matched = items.filter((item) => reviewItemMatchesIssue(item, issue));
  if (matched.length === 0) return null;

  const decisions = matched.map((item) => item.decision);
  const accepted = decisions.some((decision) => decision === 'accepted' || decision === 'modified');

  if (executed && accepted) return 'executed';
  if (decisions.some((decision) => decision === 'pending')) return 'pending';
  if (accepted) return 'accepted';
  return 'rejected';
}

/** 批量算一遍，键是规则问题的 id；对不上的写 `null`，界面据此区分「没有建议」与「待确认」 */
export function reviewStatusesOf(
  issues: QualityIssue[],
  items: ReviewItem[],
  executed: boolean,
): Record<string, IssueReviewStatus | null> {
  const result: Record<string, IssueReviewStatus | null> = {};
  for (const issue of issues) {
    result[issue.id] = reviewStatusOfIssue(issue, items, executed);
  }
  return result;
}
