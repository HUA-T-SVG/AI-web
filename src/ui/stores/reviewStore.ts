import { create } from 'zustand';
import type { CleaningAction, Issue } from '@/agent/shared/schemas';
import type { RangeRule } from '@/core';
import type { ConclusionEvidence } from '@/ui/lib/conclusionEvidence';
import { useRangeRuleStore } from './rangeRuleStore';

export type ReviewDecision = 'pending' | 'accepted' | 'modified' | 'rejected';
type ReviewExecutionOutcome = { status: 'executed' | 'unchanged' } | { status: 'skipped'; reason: string };
export type ReviewExecution = ReviewExecutionOutcome & { version: number };
type DictionaryCodes = ReturnType<typeof useRangeRuleStore.getState>['dictionaryCodes'];

/**
 * 人工核对记录：只表示「人已经看过这条待核对结论」，不代表口径已确认、
 * 也不解除该字段本轮的清洗限制。报告与留痕会记录它，避免「看过」和「没看」混在一起。
 */
export interface ReviewVerification {
  note: string | null;
  at: string;
}

/**
 * 一次分析最多保留几条问题。
 *
 * 与 `submit_issue` 的工具描述里那句「最多 8 条」是同一个数 —— 之前那个承诺
 * 没有任何地方在执行（原来的上限挂在一份没人调用的报告契约上）。承诺要么
 * 落地，要么别许：所以在这里真正截断，并把丢掉的条数如实告诉用户。
 */
export const MAX_ISSUES = 8;

/** 一条待审阅的问题。直接沿用契约里的结构，不另立一套字段。 */
export type ReviewIssue = Issue;

export interface ReviewItem {
  id: string;
  /**
   * 存整条问题而不是只存清洗建议。
   *
   * 界面要显示严重度、描述与涉及的列，用户才有依据决定接不接受 ——
   * 只给一条「合并类别」的建议，他没法判断该不该同意。
   */
  issue: ReviewIssue;
  evidence?: ConclusionEvidence;
  decision: ReviewDecision;
  execution?: ReviewExecution;
  /** 用户填的理由，会写进处理日志 */
  note?: string;
  /**
   * 用户改过的动作参数。
   *
   * 「修改后执行」如果只存一段备注、执行时仍用模型原建议，那就是界面承诺了
   * 一件没发生的事。这里存完整的可执行动作；modified 时
   * `confirmedActionsOf` 优先用它，执行、留痕、撤销因此走同一份动作。
   */
  override?: CleaningAction;
  /** 人工核对：只表示人看过这条待核对结论，不改数据、不解除字段清洗限制 */
  verified?: ReviewVerification;
}

interface ReviewState {
  items: ReviewItem[];
  clarificationHolds: readonly (readonly string[])[];
  /** 超出上限被丢掉的问题条数，用于在界面上如实说明 */
  droppedCount: number;
  /**
   * 本轮分析开始时数据是哪一版。
   *
   * 结论必须绑版本：数据在分析之后被清洗/撤销过，这批建议就不再是对当前数据说的。
   * 界面据此把它标成「旧结论」，而不是继续让人按它执行。
   */
  runVersion: number | null;
  runRuleMap: Readonly<Record<string, RangeRule>> | null;
  runDictionaryCodes: DictionaryCodes | null;
  /** 这批建议在哪一版上真正执行过。非空即锁定，避免同一批动作被执行两次 */
  executedVersion: number | null;
  /** 开始一次新的分析：清空上一批，避免两轮的结论混在一起 */
  beginRun: (dataVersion?: number | null, ruleMap?: Readonly<Record<string, RangeRule>>, dictionaryCodes?: DictionaryCodes) => void;
  /** 模型每提交一条问题就追加一条；超过上限的丢掉并计数 */
  addIssue: (issue: ReviewIssue, evidence?: ConclusionEvidence) => void;
  /** 记录决定；modified 时传入用户改过的动作，其它决定会清掉它 */
  decide: (id: string, decision: ReviewDecision, note?: string, override?: CleaningAction) => void;
  chooseComparison: (id: string, action: CleaningAction) => boolean;
  markVerified: (id: string, note?: string) => void;
  unmarkVerified: (id: string) => void;
  /** 这批建议已执行完毕，绑定到执行后的数据版本 */
  recordExecution: (dataVersion: number, outcomes: ReadonlyMap<string, ReviewExecutionOutcome>, lock: boolean) => void;
  reset: () => void;
}

/**
 * 从条目里取出可执行的动作。
 *
 * 做成纯函数而不是 store 方法，是因为界面**不能**把它写进 selector：
 * 它每次返回新数组，而 zustand 用 Object.is 比较 selector 的结果，
 * 于是每次渲染都被判定成「变了」，直接变成无限重渲染 —— 这个坑真踩过，
 * 整页白屏，控制台报 Maximum update depth exceeded。
 * 正确用法：selector 只取 items（引用稳定），再在组件里调这个函数。
 *
 * 这条过滤就是「AI 不直接执行任何破坏性操作」在代码上的落点：
 * pending 代表用户还没看，rejected 代表用户明确不同意 —— 两者都不能执行。
 * 改动它等于取消人工确认，Review Focus 第 4 条盯的就是这里。
 */
export function confirmedEntriesOf(
  items: ReviewItem[], clarificationHolds: readonly (readonly string[])[] = [], dictionaryCodes: DictionaryCodes | null = null,
):
  { item: ReviewItem; action: CleaningAction }[] {
  const actions = items
    .filter((item) => !reviewHeldByClarification(item, items, clarificationHolds) &&
      ((canReviewCleaning(item) && (item.decision === 'accepted' || item.decision === 'modified')) ||
        (canReviewComparison(item, dictionaryCodes) && item.decision === 'modified' &&
          Boolean(item.override && matchingConfirmedComparison(item, item.override)))))
    .map((item): { item: ReviewItem; action: CleaningAction } => ({ item, action:
      // 用户改过参数就执行改过的；没改过（或改成了非法值被拦下）仍用原建议
      item.decision === 'modified' && item.override !== undefined
        ? item.override
        : item.issue.suggestion,
    }));
  // 试算针对同一原始工作版本。先执行选中的口径，再执行其它已确认动作。
  return [...actions.filter(({ action }) => action.comparison), ...actions.filter(({ action }) => !action.comparison)];
}

/** 结构化建议清洗必须有同轮本地依据。旧格式仍由原有范围与动作校验把关。 */
export function canReviewCleaning(item: Pick<ReviewItem, 'issue' | 'evidence'>): boolean {
  const kind = item.issue.disposition;
  if (kind === undefined) return true;
  return kind === 'propose_cleaning' && Boolean(item.evidence?.check) &&
    !item.evidence?.invalidCheck && !item.evidence?.invalidRules;
}

/** 字典证据仅支持本列指定码的试算，不能授权其它清洗动作。 */
export function canReviewComparison(
  item: Pick<ReviewItem, 'issue' | 'evidence'>, codes: DictionaryCodes | null,
): boolean {
  const { issue, evidence } = item;
  const column = issue.columns[0];
  return issue.disposition === 'propose_cleaning' && issue.suggestion.action === 'review_range_violations' &&
    Boolean(issue.comparisonCode) && column !== undefined && issue.columns.length === 1 &&
    !evidence?.invalidCheck && !evidence?.invalidRules &&
    Boolean(codes?.[column]?.some((entry) => entry.kind !== 'valid' && entry.code === issue.comparisonCode));
}

function matchingConfirmedComparison(item: ReviewItem, action: CleaningAction): boolean {
  const choice = action.comparison?.choice;
  return (choice === 'as-missing' || choice === 'keep') &&
    action.action === (choice === 'as-missing' ? 'set_code_missing' : 'review_keep_missing_code') &&
    action.comparison?.code === item.issue.comparisonCode && action.comparison?.column === item.issue.columns[0] &&
    action.params.code === item.issue.comparisonCode && action.params.column === item.issue.columns[0];
}

export function reviewHeldByClarification(
  item: Pick<ReviewItem, 'issue'>, items: readonly ReviewItem[], clarificationHolds: readonly (readonly string[])[] = [],
): boolean {
  const { columns } = item.issue;
  const overlaps = (scope: readonly string[]) =>
    scope.length === 0 || columns.length === 0 || scope.some((column) => columns.includes(column));
  return clarificationHolds.some(overlaps) || items.some(({ issue }) =>
    issue.disposition === 'needs_clarification' && overlaps(issue.columns));
}

/**
 * 哪些条目可以「人工核对」：是结论、但当前没有可执行清洗动作（缺依据、口径待定或被追问锁定）。
 * 「仅展示」不需要核对；已执行过的条目不再让人改标记。
 */
export function isVerifiableItem(
  item: ReviewItem, items: readonly ReviewItem[],
  clarificationHolds: readonly (readonly string[])[], codes: DictionaryCodes | null = null,
): boolean {
  if (item.issue.disposition === 'inform_only' || item.execution) return false;
  const executable = (canReviewCleaning(item) || canReviewComparison(item, codes)) &&
    !reviewHeldByClarification(item, items, clarificationHolds);
  return !executable;
}

export function confirmedActionsOf(items: ReviewItem[]): CleaningAction[] {
  return confirmedEntriesOf(items).map(({ action }) => action);
}

export function reviewPolicyIsCurrent(review: Pick<ReviewState, 'runRuleMap' | 'runDictionaryCodes'>): boolean {
  const { rules, dictionaryCodes } = useRangeRuleStore.getState();
  return (review.runRuleMap === null || review.runRuleMap === rules) &&
    (review.runDictionaryCodes === null || review.runDictionaryCodes === dictionaryCodes);
}

export const useReviewStore = create<ReviewState>((set) => ({
  items: [],
  clarificationHolds: [],
  droppedCount: 0,
  runVersion: null,
  runRuleMap: null,
  runDictionaryCodes: null,
  executedVersion: null,

  beginRun: (dataVersion, ruleMap, dictionaryCodes) =>
    set({ items: [], clarificationHolds: [], droppedCount: 0, runVersion: dataVersion ?? null, runRuleMap: ruleMap ?? null,
      runDictionaryCodes: dictionaryCodes ?? null, executedVersion: null }),

  addIssue: (issue, evidence) =>
    set((state) => {
      if (state.items.length >= MAX_ISSUES) {
        // 截断而不是无限追加：一次要让用户逐条确认十几条，他会直接放弃复核，
        // 那人工确认就变成了走过场。丢掉的条数要如实显示出来
        return { droppedCount: state.droppedCount + 1,
          ...(issue.disposition === 'needs_clarification'
            ? { clarificationHolds: [...state.clarificationHolds, [...issue.columns]] } : {}),
        };
      }

      return {
        // 标识按当前长度推：一次分析内不会重复，而且不需要额外的计数器状态
        items: [...state.items, {
          id: `issue-${state.items.length}`, issue, decision: 'pending', ...(evidence ? { evidence } : {}),
        }],
      };
    }),

  decide: (id, decision, note, override) =>
    set((state) => !reviewPolicyIsCurrent(state) ? state : ({
      // 查不到就原样返回：界面上的一个过期点击不该让整个列表重置。
      // 切回待确认/接受/拒绝时清掉用户改过的参数，避免下一轮误用；
      // 仍是 modified 但这次没传 override（只改备注）则保留上一次的参数。
      items: state.items.map((item) =>
        item.id === id && (canReviewCleaning(item) ||
          (decision === 'pending' && canReviewComparison(item, state.runDictionaryCodes))) &&
          !reviewHeldByClarification(item, state.items, state.clarificationHolds)
          ? {
              ...item,
              decision,
              note,
              execution: undefined,
              override: decision === 'modified' ? (override ?? item.override) : undefined,
            }
          : item,
      ),
    })),

  markVerified: (id, note) =>
    set((state) => {
      if (!reviewPolicyIsCurrent(state)) return state;
      const item = state.items.find((entry) => entry.id === id);
      if (!item || !isVerifiableItem(item, state.items, state.clarificationHolds, state.runDictionaryCodes)) {
        return state;
      }
      const trimmed = note?.trim() ?? '';
      return {
        items: state.items.map((entry) => entry.id === id
          ? { ...entry, verified: { note: trimmed.length > 0 ? trimmed : null, at: new Date().toISOString() } }
          : entry),
      };
    }),

  unmarkVerified: (id) =>
    set((state) => ({ items: state.items.map((entry) => entry.id === id ? { ...entry, verified: undefined } : entry) })),

  chooseComparison: (id, action) => {
    const comparison = action.comparison;
    if (!comparison) return false;
    let chosen = false;
    set((state) => {
      if (!reviewPolicyIsCurrent(state) || state.executedVersion !== null || state.runVersion !== comparison.dataVersion ||
          !state.items.some((item) => item.id === id && item.decision === 'pending' &&
            (canReviewCleaning(item) || (canReviewComparison(item, state.runDictionaryCodes) &&
              matchingConfirmedComparison(item, action))) &&
            (item.issue.disposition !== 'propose_cleaning' || state.runDictionaryCodes?.[comparison.column]?.some((entry) =>
              entry.kind !== 'valid' && entry.code === comparison.code)) &&
            !reviewHeldByClarification(item, state.items, state.clarificationHolds) &&
            item.issue.columns.length === 1 && item.issue.columns[0] === comparison.column) ||
          state.items.some((item) => item.override?.comparison?.column === comparison.column)) return state;
      chosen = true;
      return { items: state.items.map((item) => item.id === id
        ? { ...item, decision: 'modified', override: action, note: comparison.reason } : item) };
    });
    return chosen;
  },

  recordExecution: (dataVersion, outcomes, lock) => set((state) => ({
    executedVersion: lock ? dataVersion : null,
    items: state.items.map((item) => {
      const outcome = outcomes.get(item.id);
      return outcome ? { ...item, execution: { ...outcome, version: dataVersion } } : item;
    }),
  })),

  reset: () => set({ items: [], clarificationHolds: [], droppedCount: 0, runVersion: null, runRuleMap: null,
    runDictionaryCodes: null, executedVersion: null }),
}));
