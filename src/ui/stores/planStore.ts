import { create } from 'zustand';
import type { CheckPlan } from '@/agent/shared/schemas';

/**
 * 检查计划的**用户意图**部分。
 *
 * 计划本体从消息 parts 派生（与「阶段从消息派生」同一做法，见交接说明 §8.4）——
 * 它本来就是一次工具调用的结果，消息里已经有了。这里只存消息里没有的东西：
 * **用户取消了哪几项**。把计划也复制一份进来只会制造两个真相。
 */
interface PlanState {
  plan: CheckPlan | null;
  /** 用户取消勾选的下标。默认全选 —— 计划是模型提的建议，默认执行比默认跳过更符合直觉 */
  excluded: Set<number>;
  setPlan: (plan: CheckPlan) => void;
  toggle: (index: number) => void;
  selected: () => CheckPlan['checks'];
  reset: () => void;
}

export const usePlanStore = create<PlanState>((set, get) => ({
  plan: null,
  excluded: new Set<number>(),

  setPlan(plan) {
    // 新计划必须清空旧的勾选状态：下标是按旧计划的位置记的，
    // 不清就会把「取消第 3 项」错记到新计划的第 3 项上。
    set({ plan, excluded: new Set<number>() });
  },

  toggle(index) {
    const next = new Set(get().excluded);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    set({ excluded: next });
  },

  selected() {
    const { plan, excluded } = get();
    if (!plan) return [];
    return plan.checks.filter((_, index) => !excluded.has(index));
  },

  reset() {
    set({ plan: null, excluded: new Set<number>() });
  },
}));
