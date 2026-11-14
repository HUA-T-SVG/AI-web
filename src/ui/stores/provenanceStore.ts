import { create } from 'zustand';
import { applyCleaningActions, type AppliedAction, type Dataset, type SkippedAction } from '@/core';
import type { CleaningAction } from '@/agent/shared/schemas';

/** 历史上的一版数据。撤销就是回退到上一版。 */
interface Version {
  dataset: Dataset;
  applied: AppliedAction[];
  skipped: SkippedAction[];
}

interface ProvenanceState {
  /** 本次会话开始时的数据。留痕要说明「从哪来」，所以它一直留着 */
  original: Dataset | null;
  /** 当前这一版 */
  current: Dataset | null;
  /** 每一版动作的累积记录，供脚本导出与留痕 */
  steps: AppliedAction[];
  skipped: SkippedAction[];
  sessionStartedAt: string | null;
  /** 撤销栈：每次应用前压入一版 */
  history: Version[];

  start: (dataset: Dataset) => void;
  apply: (actions: CleaningAction[]) => ApplySummary;
  undo: () => boolean;
  reset: () => void;
}

interface ApplySummary {
  applied: number;
  skipped: number;
  changedCells: number;
  deletedRows: number;
  actions: Map<CleaningAction, { status: 'executed' | 'unchanged' } | { status: 'skipped'; reason: string }>;
}

const initialState = {
  original: null,
  current: null,
  steps: [] as AppliedAction[],
  skipped: [] as SkippedAction[],
  sessionStartedAt: null,
  history: [] as Version[],
};

/**
 * 清洗过程的留痕。
 *
 * 两个设计要点：
 *
 * - **`original` 一直留着，不与 `current` 合并。** 留痕要能回答「从哪来、改了什么」，
 *   只有当前版本的话答不了；而脚本导出也要用它生成「读入原始文件」那一段。
 * - **动作序列（`steps`）是留痕的核心，不是结果。** 结果只是动作的后果，可以从
 *   动作序列重放出来；反过来不行 —— 只看结果说不出「为什么这一格变了」。
 */
export const useProvenanceStore = create<ProvenanceState>((set, get) => ({
  ...initialState,

  start(dataset) {
    set({
      original: dataset,
      current: dataset,
      steps: [],
      skipped: [],
      sessionStartedAt: new Date().toISOString(),
      history: [],
    });
  },

  apply(actions) {
    const { current, steps, skipped, history } = get();
    const outcomes: ApplySummary['actions'] = new Map();
    if (!current || actions.length === 0) return { applied: 0, skipped: 0, changedCells: 0, deletedRows: 0, actions: outcomes };

    const result = applyCleaningActions(current, actions);
    let changedCells = 0;
    let deletedRows = 0;
    for (const item of result.applied) {
      const removed = item.before.rowCount - item.after.rowCount;
      const changed = removed === 0 ? item.changedCells : 0;
      changedCells += changed;
      deletedRows += removed;
      outcomes.set(item.action, { status: changed || removed ? 'executed' : 'unchanged' });
    }
    for (const item of result.skipped) outcomes.set(item.action, { status: 'skipped', reason: item.reason });
    // 无实际改动时仍可撤销处理日志，但保留原数据引用和版本。
    if (result.applied.length > 0) {
      set({
        history: [...history, { dataset: current, applied: steps, skipped }],
        current: changedCells || deletedRows ? result.dataset : current,
        steps: [...steps, ...result.applied],
        skipped: [...skipped, ...result.skipped],
      });
    } else if (result.skipped.length > 0) {
      // 全部被拒时只追加拒绝记录，不动数据与撤销栈
      set({ skipped: [...skipped, ...result.skipped] });
    }

    return {
      applied: result.applied.length,
      skipped: result.skipped.length,
      changedCells, deletedRows, actions: outcomes,
    };
  },

  undo() {
    const { history } = get();
    const last = history[history.length - 1];
    if (!last) return false;
    set({
      history: history.slice(0, -1),
      current: last.dataset,
      steps: last.applied,
      skipped: last.skipped,
    });
    return true;
  },

  reset() {
    set({ ...initialState, history: [] });
  },
}));
