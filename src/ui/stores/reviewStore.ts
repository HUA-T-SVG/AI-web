import { create } from 'zustand';
import type { CleaningAction, Issue } from '@/agent/shared/schemas';

export type ReviewDecision = 'pending' | 'accepted' | 'modified' | 'rejected';

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
  decision: ReviewDecision;
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
}

interface ReviewState {
  items: ReviewItem[];
  /** 超出上限被丢掉的问题条数，用于在界面上如实说明 */
  droppedCount: number;
  /** 开始一次新的分析：清空上一批，避免两轮的结论混在一起 */
  beginRun: () => void;
  /** 模型每提交一条问题就追加一条；超过上限的丢掉并计数 */
  addIssue: (issue: ReviewIssue) => void;
  /** 记录决定；modified 时传入用户改过的动作，其它决定会清掉它 */
  decide: (id: string, decision: ReviewDecision, note?: string, override?: CleaningAction) => void;
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
export function confirmedActionsOf(items: ReviewItem[]): CleaningAction[] {
  return items
    .filter((item) => item.decision === 'accepted' || item.decision === 'modified')
    .map((item) =>
      // 用户改过参数就执行改过的；没改过（或改成了非法值被拦下）仍用原建议
      item.decision === 'modified' && item.override !== undefined
        ? item.override
        : item.issue.suggestion,
    );
}

export const useReviewStore = create<ReviewState>((set) => ({
  items: [],
  droppedCount: 0,

  beginRun: () => set({ items: [], droppedCount: 0 }),

  addIssue: (issue) =>
    set((state) => {
      if (state.items.length >= MAX_ISSUES) {
        // 截断而不是无限追加：一次要让用户逐条确认十几条，他会直接放弃复核，
        // 那人工确认就变成了走过场。丢掉的条数要如实显示出来
        return { droppedCount: state.droppedCount + 1 };
      }

      return {
        // 标识按当前长度推：一次分析内不会重复，而且不需要额外的计数器状态
        items: [...state.items, { id: `issue-${state.items.length}`, issue, decision: 'pending' }],
      };
    }),

  decide: (id, decision, note, override) =>
    set((state) => ({
      // 查不到就原样返回：界面上的一个过期点击不该让整个列表重置。
      // 切回待确认/接受/拒绝时清掉用户改过的参数，避免下一轮误用；
      // 仍是 modified 但这次没传 override（只改备注）则保留上一次的参数。
      items: state.items.map((item) =>
        item.id === id
          ? {
              ...item,
              decision,
              note,
              override: decision === 'modified' ? (override ?? item.override) : undefined,
            }
          : item,
      ),
    })),

  reset: () => set({ items: [] }),
}));
