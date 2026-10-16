import { describe, expect, it } from 'vitest';
import { applyCleaningActions } from './apply';
import type { Dataset } from '../types';
import type { CleaningAction } from './types';

function action(partial: Partial<CleaningAction> & Pick<CleaningAction, 'action'>): CleaningAction {
  return { params: {}, rationale: '测试用', columns: [], ...partial };
}

const dataset: Dataset = {
  rowCount: 6,
  columns: [
    { name: '学历', values: ['硕士', '研究生', '硕士', '研究生', '硕士', '研究生'] },
    { name: '年龄', values: [23, null, 25, 24, null, null] },
    { name: '备注', values: [' 有 ', '无', '  有', '无', '有', '无'] },
  ],
};

const merge: CleaningAction = action({
  action: 'merge_categories',
  params: { column: '学历', groups: [['硕士', '研究生']] },
  columns: ['学历'],
});

describe('清洗执行：类别归并', () => {
  it('组内统一为出现次数最多的写法', () => {
    const { dataset: cleaned } = applyCleaningActions(dataset, [merge]);
    // 硕士出现 3 次、研究生 3 次 —— 并列时取组内第一个（用户列在前面的那个）
    expect(new Set(cleaned.columns[0]?.values)).toEqual(new Set(['硕士']));
  });

  it('改动单元格数如实记账', () => {
    const { applied } = applyCleaningActions(dataset, [merge]);
    expect(applied[0]?.changedCells).toBe(3);
  });

  it('原数据集不被就地修改 —— 撤销、留痕、脚本导出全靠它', () => {
    applyCleaningActions(dataset, [merge]);
    expect(dataset.columns[0]?.values).toEqual([
      '硕士',
      '研究生',
      '硕士',
      '研究生',
      '硕士',
      '研究生',
    ]);
  });

  it('返回的是新对象，不是同一个引用', () => {
    const { dataset: cleaned } = applyCleaningActions(dataset, [merge]);
    expect(cleaned).not.toBe(dataset);
    expect(cleaned.columns[0]).not.toBe(dataset.columns[0]);
  });

  it('行数不变的动作不改动 rowCount', () => {
    expect(applyCleaningActions(dataset, [merge]).dataset.rowCount).toBe(6);
  });

  it('空 groups 不报错也不改数据', () => {
    const { dataset: cleaned, applied } = applyCleaningActions(dataset, [
      action({ action: 'merge_categories', params: { column: '学历', groups: [] } }),
    ]);
    expect(cleaned.columns[0]?.values).toEqual(dataset.columns[0]?.values);
    expect(applied[0]?.changedCells).toBe(0);
  });

  it('归并后未在 groups 里提到的取值保持原样', () => {
    const withExtra: Dataset = {
      rowCount: 3,
      columns: [{ name: '学历', values: ['硕士', '研究生', '博士'] }],
    };
    const { dataset: cleaned } = applyCleaningActions(withExtra, [merge]);
    expect(cleaned.columns[0]?.values).toContain('博士');
  });
});

describe('清洗执行：其它动作', () => {
  it('trim_whitespace 只去首尾空白', () => {
    const { dataset: cleaned } = applyCleaningActions(dataset, [
      action({ action: 'trim_whitespace', params: { columns: ['备注'] } }),
    ]);
    expect(cleaned.columns[2]?.values).toEqual(['有', '无', '有', '无', '有', '无']);
  });

  it('fill_missing 填固定值', () => {
    const { dataset: cleaned } = applyCleaningActions(dataset, [
      action({ action: 'fill_missing', params: { column: '年龄', value: 0 } }),
    ]);
    expect(cleaned.columns[1]?.values).toEqual([23, 0, 25, 24, 0, 0]);
  });

  it('remove_duplicates 降低行数，且留下的行是首次出现的', () => {
    const dupes: Dataset = {
      rowCount: 4,
      columns: [{ name: '编号', values: ['a', 'b', 'a', 'c'] }],
    };
    const { dataset: cleaned, applied } = applyCleaningActions(dupes, [
      action({ action: 'remove_duplicates', params: {} }),
    ]);
    expect(cleaned.rowCount).toBe(3);
    expect(cleaned.columns[0]?.values).toEqual(['a', 'b', 'c']);
    expect(applied[0]?.after.rowCount).toBe(3);
  });
});

describe('清洗执行：拒绝要说明理由，不静默跳过', () => {
  it('未知动作进 skipped 并带上动作名', () => {
    const { skipped } = applyCleaningActions(dataset, [action({ action: 'frobnicate' })]);
    expect(skipped).toHaveLength(1);
    expect(skipped[0]?.reason).toContain('frobnicate');
  });

  it('列不存在时进 skipped 并说明是哪一列', () => {
    const { skipped } = applyCleaningActions(dataset, [
      action({ action: 'merge_categories', params: { column: '我编的列', groups: [['a', 'b']] } }),
    ]);
    expect(skipped[0]?.reason).toContain('我编的列');
  });

  it('参数缺失时进 skipped，而不是抛异常', () => {
    expect(() =>
      applyCleaningActions(dataset, [action({ action: 'fill_missing', params: {} })]),
    ).not.toThrow();
    expect(
      applyCleaningActions(dataset, [action({ action: 'fill_missing', params: {} })]).skipped,
    ).toHaveLength(1);
  });

  it('一个动作失败不影响其余动作', () => {
    const result = applyCleaningActions(dataset, [
      action({ action: 'frobnicate' }),
      merge,
    ]);
    expect(result.skipped).toHaveLength(1);
    expect(result.applied).toHaveLength(1);
    expect(result.applied[0]?.changedCells).toBe(3);
  });
});

describe('清洗执行：动作序列按顺序生效', () => {
  it('后一个动作看到的是前一个的结果', () => {
    const { dataset: cleaned } = applyCleaningActions(dataset, [
      merge,
      action({ action: 'merge_categories', params: { column: '学历', groups: [['硕士', '博士']] } }),
    ]);
    // 第一步把研究生并成硕士；第二步没有博士可并，所以结果不变
    expect(new Set(cleaned.columns[0]?.values)).toEqual(new Set(['硕士']));
  });

  it('每个动作各记一条 applied，带前后行数与时间', () => {
    const { applied } = applyCleaningActions(dataset, [
      merge,
      action({ action: 'remove_duplicates', params: {} }),
    ]);
    expect(applied).toHaveLength(2);
    for (const item of applied) {
      expect(item.appliedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(item.before.rowCount).toBeGreaterThan(0);
    }
  });

  it('空动作序列返回原数据的副本，不报错', () => {
    const { dataset: cleaned, applied, skipped } = applyCleaningActions(dataset, []);
    expect(applied).toHaveLength(0);
    expect(skipped).toHaveLength(0);
    expect(cleaned.columns[0]?.values).toEqual(dataset.columns[0]?.values);
  });

  it('所有列的长度始终等于 rowCount —— 清洗最容易在这里出错', () => {
    const { dataset: cleaned } = applyCleaningActions(dataset, [
      merge,
      action({ action: 'remove_duplicates', params: {} }),
    ]);
    for (const column of cleaned.columns) {
      expect(column.values).toHaveLength(cleaned.rowCount);
    }
  });
});

describe('清洗执行：「已确认但不改数据」的动作', () => {
  // 这两条来自真实联调：模型对「重复行该删哪一条」「越界值该改成多少」这类
  // 需要业务口径判断的问题，给的是 review_* 动作 —— 语义是「请人工处置」。
  // 把它们当成未知动作会让用户看到「2 条未能执行」，以为自己的确认丢了。
  it.each(['review_duplicates', 'review_range_violations'])(
    '%s 记为已应用，且不改动任何单元格',
    (name) => {
      const result = applyCleaningActions(dataset, [action({ action: name })]);
      expect(result.skipped).toHaveLength(0);
      expect(result.applied).toHaveLength(1);
      expect(result.applied[0]?.changedCells).toBe(0);
      expect(result.dataset.columns[0]?.values).toEqual(dataset.columns[0]?.values);
    },
  );

  it('与真正改数据的动作混在一起时各自记一条', () => {
    const result = applyCleaningActions(dataset, [
      action({ action: 'review_duplicates' }),
      merge,
    ]);
    expect(result.applied).toHaveLength(2);
    expect(result.applied[0]?.changedCells).toBe(0);
    // 「研究生」出现 3 次，全部并成「硕士」
    expect(result.applied[1]?.changedCells).toBe(3);
  });

  it('不认识的动作仍然被拒，且报错里说清了 review_ 前缀的含义', () => {
    const { skipped } = applyCleaningActions(dataset, [action({ action: 'frobnicate' })]);
    expect(skipped[0]?.reason).toContain('review_');
  });

  it('review_ 动作用户给的理由也进留痕 —— 那是「谁决定不动数据」的依据', () => {
    const result = applyCleaningActions(dataset, [
      action({ action: 'review_duplicates', rationale: '两条记录确实同人不同时点，保留' }),
    ]);
    expect(result.applied[0]?.action.rationale).toContain('保留');
  });
});
