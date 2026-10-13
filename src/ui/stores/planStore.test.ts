import { beforeEach, describe, expect, it } from 'vitest';
import { selectedChecksOf, usePlanStore } from './planStore';
import type { CheckPlan } from '@/agent/shared/schemas';

/**
 * 勾选结果由纯函数算，不由 store 方法算。
 *
 * 这不是风格选择：把派生计算写进 selector 会让 zustand 每次渲染都判定「变了」
 * → 无限重渲染 → 整页白屏。组件里必须这么调，测试跟着用同一个函数才有意义。
 */
function selected() {
  const { plan: current, excluded } = usePlanStore.getState();
  return selectedChecksOf(current, excluded);
}

const plan: CheckPlan = {
  reasoning: '这份数据学历与单位列写法很乱，先查这两列的类别与缺失',
  checks: [
    {
      checkId: 'category-synonyms',
      targetColumns: ['学历'],
      reason: '学历写法不一致',
      priority: 'high',
    },
    { checkId: 'missing', targetColumns: [], reason: '看整体缺失', priority: 'medium' },
  ],
};

describe('检查计划的勾选状态', () => {
  beforeEach(() => usePlanStore.getState().reset());

  it('默认全选 —— 计划是模型提的建议，默认执行比默认跳过更符合直觉', () => {
    usePlanStore.getState().setPlan(plan);
    expect(selected()).toHaveLength(2);
  });

  it('可以逐条取消', () => {
    usePlanStore.getState().setPlan(plan);
    usePlanStore.getState().toggle(0);
    const picked = selected();
    expect(picked).toHaveLength(1);
    expect(picked[0]?.checkId).toBe('missing');
  });

  it('同一项再点一次恢复勾选', () => {
    usePlanStore.getState().setPlan(plan);
    usePlanStore.getState().toggle(0);
    usePlanStore.getState().toggle(0);
    expect(selected()).toHaveLength(2);
  });

  it('新计划覆盖旧计划时清空勾选 —— 否则下标会错位到另一项上', () => {
    usePlanStore.getState().setPlan(plan);
    usePlanStore.getState().toggle(1);
    usePlanStore.getState().setPlan({ ...plan, checks: [plan.checks[0]!] });
    expect(selected()).toHaveLength(1);
  });

  it('没有计划时选中列表为空，而不是抛异常', () => {
    expect(selected()).toEqual([]);
  });

  it('纯函数对 null 与空集合都返回空数组 —— 组件在计划到达之前就会调用它', () => {
    expect(selectedChecksOf(null, new Set())).toEqual([]);
    expect(selectedChecksOf(plan, new Set([0, 1]))).toEqual([]);
  });
});
