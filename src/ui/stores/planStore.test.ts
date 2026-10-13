import { beforeEach, describe, expect, it } from 'vitest';
import { usePlanStore } from './planStore';
import type { CheckPlan } from '@/agent/shared/schemas';

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
    expect(usePlanStore.getState().selected()).toHaveLength(2);
  });

  it('可以逐条取消', () => {
    usePlanStore.getState().setPlan(plan);
    usePlanStore.getState().toggle(0);
    const selected = usePlanStore.getState().selected();
    expect(selected).toHaveLength(1);
    expect(selected[0]?.checkId).toBe('missing');
  });

  it('同一项再点一次恢复勾选', () => {
    usePlanStore.getState().setPlan(plan);
    usePlanStore.getState().toggle(0);
    usePlanStore.getState().toggle(0);
    expect(usePlanStore.getState().selected()).toHaveLength(2);
  });

  it('新计划覆盖旧计划时清空勾选 —— 否则下标会错位到另一项上', () => {
    usePlanStore.getState().setPlan(plan);
    usePlanStore.getState().toggle(1);
    usePlanStore.getState().setPlan({ ...plan, checks: [plan.checks[0]!] });
    expect(usePlanStore.getState().selected()).toHaveLength(1);
  });

  it('没有计划时选中列表为空，而不是抛异常', () => {
    expect(usePlanStore.getState().selected()).toEqual([]);
  });
});
