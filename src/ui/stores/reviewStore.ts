import { create } from 'zustand';
import type { CleaningAction, Issue } from '@/agent/schemas';

export type ReviewDecision = 'pending' | 'accepted' | 'modified' | 'rejected';

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
}

interface ReviewState {
  items: ReviewItem[];
  /** 开始一次新的分析：清空上一批，避免两轮的结论混在一起 */
  beginRun: () => void;
  /** 模型每提交一条问题就追加一条 */
  addIssue: (issue: ReviewIssue) => void;
  decide: (id: string, decision: ReviewDecision, note?: string) => void;
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
    .map((item) => item.issue.suggestion);
}

export const useReviewStore = create<ReviewState>((set) => ({
  items: [],

  beginRun: () => set({ items: [] }),

  addIssue: (issue) =>
    set((state) => ({
      // 标识按当前长度推：一次分析内不会重复，而且不需要额外的计数器状态
      items: [...state.items, { id: `issue-${state.items.length}`, issue, decision: 'pending' }],
    })),

  decide: (id, decision, note) =>
    set((state) => ({
      // 查不到就原样返回：界面上的一个过期点击不该让整个列表重置
      items: state.items.map((item) => (item.id === id ? { ...item, decision, note } : item)),
    })),

  reset: () => set({ items: [] }),
}));
