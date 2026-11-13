import { create } from 'zustand';
import type { CheckPlan } from '@/agent/shared/schemas';

/**
 * 检查计划的**用户意图**部分。
 *
 * 保存工具校验后的计划、所属数据版本和用户确认的范围。
 */
interface PlanState {
  plan: CheckPlan | null;
  dataVersion: number | null;
  approvedChecks: CheckPlan['checks'] | null;
  /** 用户取消勾选的下标。默认全选 —— 计划是模型提的建议，默认执行比默认跳过更符合直觉 */
  excluded: Set<number>;
  setPlan: (plan: CheckPlan, dataVersion: number) => void;
  approve: (dataVersion: number) => CheckPlan['checks'];
  toggle: (index: number) => void;
  reset: () => void;
}

/**
 * 算出当前勾选的计划项。
 *
 * **做成纯函数而不是 store 方法，是因为界面不能把它写进 selector。**
 * 它每次返回新数组，而 zustand 用 `Object.is` 比较 selector 的结果，于是每次渲染
 * 都被判定成「变了」→ 无限重渲染 → 整页白屏，控制台刷 `Maximum update depth exceeded`。
 *
 * `reviewStore.ts` 的 `confirmedActionsOf` 就是为同一个原因做成纯函数的，那条注释
 * 在那里也写过一遍 —— 而我写 `CheckPlanPanel` 时仍然踩了同一个坑，是 E2E 抓出来的
 * （单测看不见渲染层的问题）。所以这里不仅是照抄做法，而是把**派生方法从 store 上
 * 拿掉**：留着它，下一个人还会踩。
 *
 * 正确用法：selector 只取 `plan` 与 `excluded`（引用稳定），再在组件里调这个函数。
 */
export function selectedChecksOf(
  plan: CheckPlan | null,
  excluded: Set<number>,
): CheckPlan['checks'] {
  if (!plan) return [];
  return plan.checks.filter((_, index) => !excluded.has(index));
}

export const usePlanStore = create<PlanState>((set, get) => ({
  plan: null,
  dataVersion: null,
  approvedChecks: null,
  excluded: new Set<number>(),

  setPlan(plan, dataVersion) {
    // 新计划必须清空旧的勾选状态：下标是按旧计划的位置记的，
    // 不清就会把「取消第 3 项」错记到新计划的第 3 项上。
    set({ plan, dataVersion, approvedChecks: null, excluded: new Set<number>() });
  },

  toggle(index) {
    const { plan, approvedChecks, excluded } = get();
    if (!plan?.checks[index] || approvedChecks !== null) return;
    const next = new Set(excluded);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    set({ excluded: next });
  },

  approve(dataVersion) {
    const state = get();
    if (state.dataVersion !== dataVersion || state.approvedChecks !== null) return [];
    const selected = selectedChecksOf(state.plan, state.excluded);
    if (selected.length > 0) set({ approvedChecks: selected });
    return selected;
  },

  reset() {
    set({ plan: null, dataVersion: null, approvedChecks: null, excluded: new Set<number>() });
  },
}));
