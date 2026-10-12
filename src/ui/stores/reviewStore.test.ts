import { describe, it, expect, beforeEach } from 'vitest';
import { confirmedActionsOf, useReviewStore, type ReviewIssue } from './reviewStore';

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
});
