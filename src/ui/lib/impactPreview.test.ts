import { describe, expect, it } from 'vitest';
import type { CleaningAction, Dataset } from '@/core';
import { previewCleaningImpact } from './impactPreview';

function action(partial: Partial<CleaningAction> & Pick<CleaningAction, 'action'>): CleaningAction {
  return { params: {}, rationale: '测试用', columns: [], ...partial };
}

const dataset: Dataset = {
  rowCount: 4,
  columns: [
    { name: '学历', values: ['硕士', '研究生', '硕士', '博士'] },
    { name: '年龄', values: [23, 24, 25, 26] },
  ],
};

const merge = action({
  action: 'merge_categories',
  params: { column: '学历', groups: [['硕士', '研究生']] },
  columns: ['学历'],
});

const removeDuplicates = action({ action: 'remove_duplicates', params: {} });

describe('执行前预览', () => {
  it('没有要执行的动作时三个数都是 0', () => {
    expect(previewCleaningImpact(dataset, [])).toEqual({
      changedCells: 0,
      deletedRows: 0,
      skippedActions: 0,
    });
  });

  it('类别归并只数会被改写的单元格', () => {
    const preview = previewCleaningImpact(dataset, [merge]);
    expect(preview.changedCells).toBe(1);
    expect(preview.deletedRows).toBe(0);
    expect(preview.skippedActions).toBe(0);
  });

  it('去重只报删除行数，不把删掉的行再算一遍单元格改动', () => {
    const dupes: Dataset = {
      rowCount: 4,
      columns: [{ name: '编号', values: ['a', 'b', 'a', 'c'] }],
    };
    const preview = previewCleaningImpact(dupes, [removeDuplicates]);
    expect(preview.deletedRows).toBe(1);
    expect(preview.changedCells).toBe(0);
    expect(preview.skippedActions).toBe(0);
  });

  it('执行不了的动作计入无法执行，能执行的照常试算', () => {
    const preview = previewCleaningImpact(dataset, [
      merge,
      action({ action: 'frobnicate' }),
      action({
        action: 'merge_categories',
        params: { column: '没有这列', groups: [['a', 'b']] },
      }),
    ]);
    expect(preview.skippedActions).toBe(2);
    expect(preview.changedCells).toBe(1);
    expect(preview.deletedRows).toBe(0);
  });

  it('试算不碰入参数据 —— 预览不能留下副作用', () => {
    previewCleaningImpact(dataset, [merge, removeDuplicates]);
    expect(dataset.columns[0]?.values).toEqual(['硕士', '研究生', '硕士', '博士']);
    expect(dataset.rowCount).toBe(4);
  });
});
