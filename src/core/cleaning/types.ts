import type { Dataset } from '../types';

/**
 * 一条清洗动作。
 *
 * **契约归 core 所有。** 它原先定义在 `agent/shared/schemas.ts`（作为 Zod schema
 * 的推断结果），而 `core/cleaning` 与 `scriptgen` 反过来去 import 它 ——
 * 方向是反的：core 是平台无关的底层，要能被浏览器与将来的 MCP Server 复用
 * （设计文档 §3.4），不该依赖编排/界面层。
 *
 * 所以类型搬到这里，agent 侧改为 import，并用 `satisfies` 把 Zod schema 与它
 * 钉在一起：**schema 是运行时校验，类型是编译期契约，两者必须一致** ——
 * 只搬类型而不管 schema，就会留下「验证的和执行的不是同一个形状」这个隐患。
 */
export interface CleaningAction {
  action: string;
  params: Record<string, unknown>;
  /** 为什么建议这么做。用户要据此决定接不接受，不能是空话。 */
  rationale: string;
  /** 受影响的列，界面用来定位到具体数据 */
  columns: string[];
}

/** 一次动作执行前后的形状摘要。留痕与界面都靠它说明「改了什么」。 */
export interface ActionSnapshot {
  rowCount: number;
  /** 各列唯一值数。归并类动作的效果在这一项上一眼可见 */
  uniqueCounts: Record<string, number>;
}

/** 归并类别时，一个组实际采用的统一方向。 */
export interface MergeGroupResolution {
  /** 统一成的写法 */
  winner: string;
  /** 组内其它写法 → winner。按执行顺序记录 */
  mapping: Record<string, string>;
}

/**
 * 一次 merge_categories 动作执行时**实际采用**的归并方向。
 *
 * 为什么要记录而不是让脚本重算：归并方向取决于当时的计数，而后续动作会改变计数。
 * 例如 a,b,b,c,c,c,c 先并 a/b 再并 b/c：执行时第一步 b 胜、第二步 c 胜，最终全 c；
 * 若脚本拿最终数据重算第一步，a/b 都是 0 次，会选组内第一个 a，结果变成三个 a。
 */
export interface MergeResolution {
  column: string;
  groups: MergeGroupResolution[];
}

export interface AppliedAction {
  action: CleaningAction;
  /** ISO 时间戳 */
  appliedAt: string;
  before: ActionSnapshot;
  after: ActionSnapshot;
  changedCells: number;
  /** 仅 merge_categories：执行时实际采用的映射，供脚本原样重放 */
  mergeResolution?: MergeResolution;
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
