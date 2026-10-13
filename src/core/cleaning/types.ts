import type { CleaningAction } from '@/agent/shared/schemas';
import type { Dataset } from '../types';

/** 一次动作执行前后的形状摘要。留痕与界面都靠它说明「改了什么」。 */
export interface ActionSnapshot {
  rowCount: number;
  /** 各列唯一值数。归并类动作的效果在这一项上一眼可见 */
  uniqueCounts: Record<string, number>;
}

export interface AppliedAction {
  action: CleaningAction;
  /** ISO 时间戳 */
  appliedAt: string;
  before: ActionSnapshot;
  after: ActionSnapshot;
  changedCells: number;
}

export interface SkippedAction {
  action: CleaningAction;
  /** 为什么没执行。**必须说明理由** —— 静默跳过会让用户以为已经洗过了 */
  reason: string;
}

export interface CleaningResult {
  dataset: Dataset;
  applied: AppliedAction[];
  skipped: SkippedAction[];
}
