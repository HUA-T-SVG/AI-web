import { describe, expect, it } from 'vitest';
import { applyCleaningActions, type Dataset } from '@/core';
import { useReviewStore, confirmedActionsOf } from '@/ui/stores/reviewStore';
import { actionForComparison, compareMissingCode } from './cleaningComparison';

const dataset: Dataset = { rowCount: 7, columns: [
  { name: '成绩', values: [999, '999', '0999', '999.0', '80', '未知', null] },
  { name: '对照', values: [999, 1, 2, 3, 4, 5, 6] },
] };

describe('清洗口径试算', () => {
  it('对比两种统计，与实际动作一致且保留非匹配值和其他列', () => {
    const comparison = compareMissingCode(dataset, '成绩', '999')!;
    expect(comparison.matchingRows).toBe(2);
    expect(comparison.keep).toMatchObject({ validNumeric: 4, missing: 1, missingRate: 1 / 7 });
    expect(comparison.keep.mean).toBeCloseTo((999 * 3 + 80) / 4);
    expect(comparison.asMissing).toEqual({ validNumeric: 2, missing: 3, missingRate: 3 / 7, mean: 539.5 });
    expect(dataset.columns[0]!.values[0]).toBe(999);
    const action = actionForComparison({ ...comparison, dataVersion: 1, choice: 'as-missing', reason: '按数据字典' });
    const executed = applyCleaningActions(dataset, [action]);
    expect(executed.dataset.rowCount).toBe(7);
    expect(executed.dataset.columns[0]!.values).toEqual([null, null, '0999', '999.0', '80', '未知', null]);
    expect(executed.dataset.columns[1]).toEqual(dataset.columns[1]);
    const keep = actionForComparison({ ...comparison, dataVersion: 1, choice: 'keep', reason: '等待原始记录' });
    expect(applyCleaningActions(dataset, [keep]).dataset).toEqual(dataset);
  });

  it('重名列不能试算；没有数值样本时不假造均值', () => {
    expect(compareMissingCode({ ...dataset, columns: [dataset.columns[0]!, dataset.columns[0]!] }, '成绩', '999')).toBeNull();
    const result = compareMissingCode({ rowCount: 1, columns: [{ name: '成绩', values: ['未知'] }] }, '成绩', '未知');
    expect(result?.asMissing).toEqual({ validNumeric: 0, missing: 1, missingRate: 1, mean: null });
    expect(result?.keep.mean).toBeNull();
  });

  it('只允许当前版本选择，同列不重复，口径在其它动作之前执行', () => {
    const state = useReviewStore.getState();
    state.beginRun(2);
    const suggestion = { action: 'fill_missing', columns: ['成绩'], params: { column: '成绩', value: 80 }, rationale: '填充' };
    const issue = { checkId: 'missing', severity: 'low' as const, title: '缺失', description: '检查',
      columns: ['成绩'], suggestion, confidence: 1 };
    state.addIssue(issue);
    state.addIssue(issue);
    state.addIssue(issue);
    state.decide('issue-0', 'accepted');
    const comparison = compareMissingCode(dataset, '成绩', '999')!;
    const choose = (dataVersion: number) => actionForComparison({ ...comparison, dataVersion, choice: 'as-missing', reason: '字典' });
    expect(state.chooseComparison('issue-1', choose(1))).toBe(false);
    expect(state.chooseComparison('issue-1', choose(2))).toBe(true);
    expect(state.chooseComparison('issue-2', choose(2))).toBe(false);
    expect(confirmedActionsOf(useReviewStore.getState().items).map((action) => action.action))
      .toEqual(['set_code_missing', 'fill_missing']);
    state.reset();
  });
});
