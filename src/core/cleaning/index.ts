/**
 * 清洗执行：把审阅确认过的动作应用到数据上。
 *
 * 这是「AI 不直接执行任何破坏性操作」这条安全设计的落点 —— 动作只在
 * 用户逐条确认之后才进得来（`reviewStore.confirmedActionsOf` 过滤掉
 * pending 与 rejected），而这里只负责把这些动作**原样**执行并如实记账。
 *
 * 与 `core` 其余部分一样是纯函数、平台无关：同一份实现将来要能跑在 MCP Server 里
 * （设计文档 §3.4），所以它不碰 DOM，也不碰任何浏览器 API。
 *
 * `CleaningAction` 这个**类型契约也归这里**（原先在 `agent/shared/schemas.ts`，
 * 方向是反的）。agent 侧的 Zod schema 用 `satisfies` 钉在这份类型上。
 */
export { applyCleaningActions, rowKey } from './apply';
export { ACTION_LABELS, actionDisplayName } from './actionLabels';
export type {
  ActionSnapshot,
  AppliedAction,
  CleaningAction,
  CleaningResult,
  MergeGroupResolution,
  MergeResolution,
  SkippedAction,
} from './types';
