import { beforeEach, describe, expect, it } from 'vitest';
import { useProvenanceStore } from './provenanceStore';
import type { CleaningAction } from '@/agent/shared/schemas';
import type { Dataset } from '@/core';

const dataset: Dataset = {
  rowCount: 4,
  columns: [{ name: '学历', values: ['硕士', '研究生', '硕士', '研究生'] }],
};

const merge: CleaningAction = {
  action: 'merge_categories',
  params: { column: '学历', groups: [['硕士', '研究生']] },
  rationale: '同一类别',
  columns: ['学历'],
};

const bogus: CleaningAction = { action: 'frobnicate', params: {}, rationale: '测试', columns: [] };

const state = () => useProvenanceStore.getState();

describe('清洗留痕', () => {
  beforeEach(() => state().reset());

  it('开始时同时记住原始版与当前版', () => {
    state().start(dataset);
    expect(state().original).toBe(dataset);
    expect(state().current).toBe(dataset);
    expect(state().sessionStartedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('应用动作后当前版变了，原始版不动 —— 留痕要能回答「从哪来」', () => {
    state().start(dataset);
    state().apply([merge]);
    expect(state().current?.columns[0]?.values).toEqual(['硕士', '硕士', '硕士', '硕士']);
    expect(state().original?.columns[0]?.values).toEqual(['硕士', '研究生', '硕士', '研究生']);
  });

  it('动作序列累积记录，撤销能退回上一版', () => {
    state().start(dataset);
    state().apply([merge]);
    expect(state().steps).toHaveLength(1);
    expect(state().undo()).toBe(true);
    expect(state().steps).toHaveLength(0);
    expect(state().current?.columns[0]?.values).toEqual(['硕士', '研究生', '硕士', '研究生']);
  });

  it('没有可撤销的版本时返回 false，而不是抛异常', () => {
    state().start(dataset);
    expect(state().undo()).toBe(false);
  });

  it('被拒的动作进 skipped 并带上理由，数据不动', () => {
    state().start(dataset);
    const outcome = state().apply([bogus]);
    expect(outcome.applied).toBe(0);
    expect(outcome.skipped).toBe(1);
    expect(state().skipped[0]?.reason).toContain('frobnicate');
    expect(state().steps).toHaveLength(0);
  });

  it('全部被拒时不压撤销栈 —— 否则撤销会退回一个完全相同的版本', () => {
    state().start(dataset);
    state().apply([bogus]);
    expect(state().undo()).toBe(false);
  });

  it('变更单元格数被累计返回，界面据此说明改了多少', () => {
    state().start(dataset);
    expect(state().apply([merge]).changedCells).toBe(2);
  });

  it('返回条数让界面能显示「应用了 1 条、跳过 1 条」', () => {
    state().start(dataset);
    const outcome = state().apply([merge, bogus]);
    expect(outcome).toEqual({ applied: 1, skipped: 1, changedCells: 2 });
  });

  it('没有数据时应用动作返回零而不是崩', () => {
    expect(state().apply([merge])).toEqual({ applied: 0, skipped: 0, changedCells: 0 });
  });

  it('reset 之后一切归零，包括撤销栈', () => {
    state().start(dataset);
    state().apply([merge]);
    state().reset();
    expect(state().current).toBeNull();
    expect(state().undo()).toBe(false);
  });
});
