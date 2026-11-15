import { describe, it, expect, beforeEach } from 'vitest';
import { MAX_ISSUES, confirmedActionsOf, confirmedEntriesOf, useReviewStore, type ReviewIssue } from './reviewStore';
import { useRangeRuleStore } from './rangeRuleStore';
import { actionForComparison, compareMissingCode } from '@/ui/lib/cleaningComparison';

function issue(overrides: Partial<ReviewIssue> = {}): ReviewIssue {
  return {
    checkId: 'missing',
    severity: 'medium',
    title: '学历列有同义写法',
    description: '「研究生」与「硕士」指的是同一类别。',
    columns: ['学历'],
    suggestion: {
      action: 'merge_categories',
      params: {},
      rationale: '同义写法应归并，否则分组统计会分裂',
      columns: ['学历'],
    },
    confidence: 0.8,
    ...overrides,
  };
}

const items = () => useReviewStore.getState().items;
const confirmed = () => confirmedActionsOf(useReviewStore.getState().items);

describe('reviewStore', () => {
  beforeEach(() => {
    useReviewStore.getState().reset();
    useRangeRuleStore.getState().reset();
  });

  it('仅变更本批占位码也会让旧审阅无法确认', () => {
    const policy = useRangeRuleStore.getState();
    useReviewStore.getState().beginRun(6, policy.rules, policy.dictionaryCodes);
    useReviewStore.getState().addIssue(issue());
    policy.saveDictionaryCodes([{ column: '学历', code: '999', quote: '学历：999 表示缺失。' }]);
    expect(useRangeRuleStore.getState().rules).toBe(policy.rules);
    useReviewStore.getState().decide(items()[0]!.id, 'accepted');
    expect(items()[0]?.decision).toBe('pending');
    expect(confirmed()).toEqual([]);
  });

  it('仅展示、待核对及无本地证据的新建议均不能确认执行', () => {
    const store = useReviewStore.getState();
    for (const disposition of ['inform_only', 'needs_clarification', 'propose_cleaning'] as const) {
      store.addIssue(issue({ disposition }));
    }
    for (const item of items()) store.decide(item.id, 'accepted');
    expect(items().every((item) => item.decision === 'pending')).toBe(true);
    expect(confirmed()).toEqual([]);
  });

  it('后来才发现的口径冲突挡住此前同列已接受动作，无关字段仍保留', () => {
    const store = useReviewStore.getState();
    store.addIssue(issue());
    store.addIssue(issue({ columns: ['年龄'] }));
    for (const item of items()) store.decide(item.id, 'accepted');
    expect(confirmed()).toHaveLength(2);
    store.addIssue(issue({ disposition: 'needs_clarification' }));
    expect(confirmedEntriesOf(items()).map(({ item }) => item.issue.columns)).toEqual([['年龄']]);
  });

  it('即使待核对结论超出卡片显示上限，其范围仍不能执行', () => {
    const store = useReviewStore.getState();
    for (let count = 0; count < MAX_ISSUES; count++) store.addIssue(issue());
    store.decide(items()[0]!.id, 'accepted');
    store.addIssue(issue({ disposition: 'needs_clarification', columns: [] }));
    expect(items()).toHaveLength(MAX_ISSUES);
    expect(confirmedEntriesOf(items(), useReviewStore.getState().clarificationHolds)).toEqual([]);
  });

  it('没有检查证据时只能试算本批明确确认的缺失码，无法直接接受或改成其它编码', () => {
    const policy = useRangeRuleStore.getState();
    policy.saveDictionaryCodes([{ column: '成绩', code: '999', quote: '成绩：999 表示缺考。' }]);
    const store = useReviewStore.getState();
    const codes = useRangeRuleStore.getState().dictionaryCodes;
    store.beginRun(4, policy.rules, codes);
    store.addIssue(issue({ disposition: 'propose_cleaning', columns: ['成绩'], comparisonCode: '999',
      suggestion: { action: 'review_range_violations', columns: ['成绩'], rationale: '先进行试算', params: {} } }));
    const [{ id }] = items() as [ReturnType<typeof items>[number]];
    store.decide(id, 'accepted');
    expect(items()[0]?.decision).toBe('pending');

    const dataset = { rowCount: 2, columns: [{ name: '成绩', values: [999, 90] }] };
    const actionForCode = (code: string) => actionForComparison({
      ...compareMissingCode(dataset, '成绩', code)!, choice: 'as-missing', reason: '确认缺失编码', dataVersion: 4,
    });
    expect(store.chooseComparison(id, actionForCode('90'))).toBe(false);
    expect(store.chooseComparison(id, actionForCode('999'))).toBe(true);
    expect(confirmedEntriesOf(items(), [], codes).map(({ action }) => action.action)).toEqual(['set_code_missing']);
    expect(dataset.columns[0]?.values).toEqual([999, 90]);
  });

  it('初始没有任何待确认条目', () => {
    expect(items()).toEqual([]);
    expect(confirmed()).toEqual([]);
  });

  it('每追加一条都处于待确认状态', () => {
    useReviewStore.getState().addIssue(issue());
    useReviewStore.getState().addIssue(issue({ title: '另一条' }));

    expect(items()).toHaveLength(2);
    for (const item of items()) expect(item.decision).toBe('pending');
  });

  it('条目带着完整问题，界面才能显示严重度与证据', () => {
    useReviewStore.getState().addIssue(issue());

    const [item] = items();
    expect(item?.issue.title).toBe('学历列有同义写法');
    expect(item?.issue.severity).toBe('medium');
    expect(item?.issue.columns).toEqual(['学历']);
  });

  it('每条有独立且不重复的标识', () => {
    for (let index = 0; index < 3; index += 1) useReviewStore.getState().addIssue(issue());

    const ids = items().map((item) => item.id);
    expect(new Set(ids).size).toBe(3);
  });

  it('decide 只改被指定的那一条', () => {
    useReviewStore.getState().addIssue(issue());
    useReviewStore.getState().addIssue(issue());
    const [first] = items();

    useReviewStore.getState().decide(first!.id, 'accepted');

    expect(items()[0]?.decision).toBe('accepted');
    expect(items()[1]?.decision).toBe('pending');
  });

  it('记录用户填的理由，供处理日志追溯', () => {
    useReviewStore.getState().addIssue(issue());
    const [item] = items();

    useReviewStore.getState().decide(item!.id, 'rejected', '这两个类别不能合并');

    expect(items()[0]?.note).toBe('这两个类别不能合并');
  });

  it('confirmedActionsOf 只放行已接受与已修改的', () => {
    for (let index = 0; index < 4; index += 1) useReviewStore.getState().addIssue(issue());
    const all = items();

    useReviewStore.getState().decide(all[0]!.id, 'accepted');
    useReviewStore.getState().decide(all[1]!.id, 'modified');
    useReviewStore.getState().decide(all[2]!.id, 'rejected');
    // all[3] 保持待确认

    expect(confirmed()).toHaveLength(2);
  });

  it('待确认与已拒绝的绝不进入可执行动作 —— 这是人工确认不可绕过的落点', () => {
    useReviewStore.getState().addIssue(issue());
    useReviewStore.getState().addIssue(issue());

    // 一条都没确认时，可执行动作必须是空的
    expect(confirmed()).toEqual([]);

    useReviewStore.getState().decide(items()[0]!.id, 'rejected');
    expect(confirmed()).toEqual([]);
  });

  it('取出的动作是问题里那条建议本身', () => {
    useReviewStore.getState().addIssue(issue());
    useReviewStore.getState().decide(items()[0]!.id, 'accepted');

    const [action] = confirmed();
    expect(action?.action).toBe('merge_categories');
    expect(action?.rationale).toContain('同义写法');
  });

  it('修改后执行用的是用户改过的参数，不是模型原建议', () => {
    useReviewStore.getState().addIssue(issue());
    const override = {
      action: 'merge_categories',
      params: { column: '学历', groups: [['硕士', '研究生', '博士']] },
      rationale: '按团队口径三个都算同一档',
      columns: ['学历'],
    };

    useReviewStore.getState().decide(items()[0]!.id, 'modified', '改成了三组合并', override);

    const [action] = confirmed();
    expect(action).toEqual(override);
    expect(items()[0]?.note).toBe('改成了三组合并');
  });

  it('接受仍执行原建议；改回待确认会清掉改过的参数', () => {
    useReviewStore.getState().addIssue(issue());
    const id = items()[0]!.id;
    const override = {
      action: 'merge_categories',
      params: { column: '学历', groups: [['甲', '乙']] },
      rationale: '临时修改',
      columns: ['学历'],
    };

    useReviewStore.getState().decide(id, 'modified', undefined, override);
    expect(items()[0]?.override).toEqual(override);

    useReviewStore.getState().decide(id, 'accepted');
    expect(items()[0]?.override).toBeUndefined();
    expect(confirmed()[0]).toEqual(issue().suggestion);

    // 只改备注、不传参数时，modified 不应把之前的参数静默清空
    useReviewStore.getState().decide(id, 'modified', undefined, override);
    useReviewStore.getState().decide(id, 'modified', '只补了一句理由');
    expect(confirmed()[0]).toEqual(override);

    useReviewStore.getState().decide(id, 'pending');
    expect(items()[0]?.override).toBeUndefined();
  });

  it('对不存在的标识做决定不会崩，也不影响其他条目', () => {
    useReviewStore.getState().addIssue(issue());

    expect(() => useReviewStore.getState().decide('不存在的 id', 'accepted')).not.toThrow();
    expect(items()[0]?.decision).toBe('pending');
  });

  it('开始新一轮时清空上一批，避免两轮结论混在一起', () => {
    useReviewStore.getState().addIssue(issue());
    useReviewStore.getState().addIssue(issue());
    useReviewStore.getState().decide(items()[0]!.id, 'accepted');

    useReviewStore.getState().beginRun();

    // 上一轮那个已接受的条目不该还留在可执行列表里，否则用户会执行到
    // 自己以为早就换掉的那批建议
    expect(items()).toEqual([]);
    expect(confirmed()).toEqual([]);
  });

  it('新轮次的标识从零重新开始，不会与上一轮冲突', () => {
    useReviewStore.getState().addIssue(issue());
    useReviewStore.getState().beginRun();
    useReviewStore.getState().addIssue(issue());

    expect(items()[0]?.id).toBe('issue-0');
  });

  it('reset 清空全部条目', () => {
    useReviewStore.getState().addIssue(issue());
    useReviewStore.getState().decide(items()[0]!.id, 'accepted');

    useReviewStore.getState().reset();

    expect(items()).toEqual([]);
    expect(confirmed()).toEqual([]);
  });

  it('超过上限的条数被丢掉并计数 —— 承诺的上限要真的执行', () => {
    // submit_issue 的工具描述向模型承诺「最多 8 条」。之前那个承诺挂在
    // 一份没人调用的报告契约上，等于没执行
    for (let index = 0; index < MAX_ISSUES + 3; index += 1) {
      useReviewStore.getState().addIssue(issue());
    }

    expect(items()).toHaveLength(MAX_ISSUES);
    expect(useReviewStore.getState().droppedCount).toBe(3);
  });

  it('开始新一轮会把丢弃计数也清零', () => {
    for (let index = 0; index < MAX_ISSUES + 1; index += 1) {
      useReviewStore.getState().addIssue(issue());
    }

    useReviewStore.getState().beginRun();

    expect(useReviewStore.getState().droppedCount).toBe(0);
  });

  it('恰好等于上限时不算丢弃', () => {
    for (let index = 0; index < MAX_ISSUES; index += 1) {
      useReviewStore.getState().addIssue(issue());
    }

    expect(items()).toHaveLength(MAX_ISSUES);
    expect(useReviewStore.getState().droppedCount).toBe(0);
  });

  it('开始新一轮记录数据版本，供界面判断结论是否失效', () => {
    useReviewStore.getState().beginRun(3);

    expect(useReviewStore.getState().runVersion).toBe(3);
    expect(useReviewStore.getState().executedVersion).toBeNull();
  });

  it('执行后绑定执行版本；reset 会清掉版本记录', () => {
    useReviewStore.getState().beginRun(2);
    useReviewStore.getState().addIssue(issue());

    useReviewStore.getState().recordExecution(3, new Map(), true);

    expect(useReviewStore.getState().executedVersion).toBe(3);

    useReviewStore.getState().reset();
    expect(useReviewStore.getState().runVersion).toBeNull();
    expect(useReviewStore.getState().executedVersion).toBeNull();
  });
});
