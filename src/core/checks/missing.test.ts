import { describe, it, expect } from 'vitest';
import type { ColumnData, Dataset } from '../types';
import { checkMissing } from './missing';

function ds(columns: ColumnData[], rowCount?: number): Dataset {
  return { columns, rowCount: rowCount ?? (columns[0]?.values.length ?? 0) };
}

describe('checkMissing', () => {
  it('完全没有缺失时不报问题', () => {
    const issues = checkMissing(ds([{ name: '年龄', values: [1, 2, 3] }]));
    expect(issues).toEqual([]);
  });

  it('缺失率超过高阈值报 high', () => {
    const issues = checkMissing(ds([{ name: '备注', values: [null, null, null, null, 'a'] }]));
    expect(issues).toHaveLength(1);
    expect(issues[0]?.severity).toBe('high');
    expect(issues[0]?.checkId).toBe('missing');
  });

  it('证据中包含缺失率与列名', () => {
    const issues = checkMissing(ds([{ name: '备注', values: [null, null, null, null, 'a'] }]));
    expect(issues[0]?.evidence.columns).toEqual(['备注']);
    expect(issues[0]?.evidence.statistics.missingRate).toBe(0.8);
  });

  it('全列缺失也报 high，且缺失率为 1', () => {
    const issues = checkMissing(ds([{ name: '空列', values: [null, null] }]));
    expect(issues[0]?.severity).toBe('high');
    expect(issues[0]?.evidence.statistics.missingRate).toBe(1);
  });

  it('空数据集不报问题也不崩溃', () => {
    expect(checkMissing({ columns: [], rowCount: 0 })).toEqual([]);
  });

  it('建议动作为 fill_or_drop', () => {
    const issues = checkMissing(ds([{ name: '备注', values: [null, null, null, null, 'a'] }]));
    expect(issues[0]?.suggestion?.action).toBe('fill_or_drop');
  });

  it('每个问题 id 唯一', () => {
    const issues = checkMissing(
      ds([
        { name: 'a', values: [null, null, null, null, 'x'] },
        { name: 'b', values: [null, null, null, null, 'y'] },
      ]),
    );
    expect(issues).toHaveLength(2);
    expect(issues[0]?.id).not.toBe(issues[1]?.id);
  });
});
