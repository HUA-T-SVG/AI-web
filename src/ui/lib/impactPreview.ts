import { applyCleaningActions, type CleaningAction, type Dataset } from '@/core';

/**
 * 执行前预览。
 *
 * 「点下去才知道会发生什么」的问题是：等看到「3 条动作无法执行」时，留痕已经
 * 写了一版。预览把「改多少、删多少、哪几条做不了」提前摆出来，用户还来得及
 * 回去改参数，而不是先污染一版数据。
 *
 * 只能调 core 的纯函数。复用 `useProvenanceStore.apply` 看似省事，但那会真的
 * 改写当前数据 —— 预览本身就必须是无副作用的。
 */
export interface CleaningImpactPreview {
  /** 会被改写的单元格数，不含整行删除带来的行数变化 */
  changedCells: number;
  /** 会被删掉的行数 */
  deletedRows: number;
  /** 会进 skipped 的动作条数 */
  skippedActions: number;
}

export function previewCleaningImpact(
  dataset: Dataset,
  actions: CleaningAction[],
): CleaningImpactPreview {
  const result = applyCleaningActions(dataset, actions);

  // core 在行数变化时把 changedCells 记成「删了多少行」，不是单元格改动数。
  // 两边都报会让用户以为删掉的 3 行还被额外改了 3 个格；所以按动作前后的
  // rowCount 判断，只有行数没变的动作才累计单元格改动。
  let changedCells = 0;
  for (const applied of result.applied) {
    if (applied.before.rowCount !== applied.after.rowCount) continue;
    changedCells += applied.changedCells;
  }

  return {
    changedCells,
    // 现有动作里只有 remove_duplicates 会动行数，而且只会减；行数差就是删掉的行数
    deletedRows: dataset.rowCount - result.dataset.rowCount,
    skippedActions: result.skipped.length,
  };
}
