import { create } from 'zustand';
import type { RangeRule } from '@/core';

/**
 * 用户在检查页填写的「适用范围」（值域规则）。
 *
 * 这个 store 解决的问题不是存储，而是**语义**：core 里的 `range-rules` 检查一直存在，
 * 但产品没有配规则的入口，所以那条检查实际上从未生效。检查覆盖地图会把这件事
 * 如实标成「领域范围尚未确认」，并给一个能真正填写的入口 —— 填完重跑检查，
 * 覆盖地图与问题清单一起更新。
 *
 * **规则只活在当前页面内存里**：值域是领域配置，跟着文件走。刷新后数据仍会从
 * IndexedDB 恢复，但规则不会 —— 界面上会重新显示「未配置」，不会假装还在生效。
 * 这比悄悄把规则留在内存里、却因为刷新丢了而让人以为漏检要好。
 */
interface RangeRuleState {
  /** 规则属于哪份文件；换文件必须清空，避免把上一份数据的领域口径套到新数据上 */
  fileName: string | null;
  /** key = 列名。同名列共用一条规则，与 core 的 `checkRangeRules` 行为一致 */
  rules: Record<string, RangeRule>;
  /** 数据就位时调用；文件名变了就清空规则，同名保留（重试/重跑不丢配置） */
  beginFile: (fileName: string | null) => void;
  upsert: (rule: RangeRule) => void;
  remove: (column: string) => void;
  reset: () => void;
}

export const useRangeRuleStore = create<RangeRuleState>((set) => ({
  fileName: null,
  rules: {},

  beginFile: (fileName) =>
    set((state) => (state.fileName === fileName ? {} : { fileName, rules: {} })),

  upsert: (rule) =>
    set((state) => ({ rules: { ...state.rules, [rule.column]: rule } })),

  remove: (column) =>
    set((state) => {
      const next = { ...state.rules };
      delete next[column];
      return { rules: next };
    }),

  reset: () => set({ fileName: null, rules: {} }),
}));

/**
 * 取当前规则数组。
 *
 * **不要写进 zustand selector**：它每次返回新数组，`Object.is` 判定「变了」会
 * 导致无限重渲染（`reviewStore` 的 `confirmedActionsOf` 踩过这个坑）。
 * 需要它的地方（跑检查时）直接 `getState()` 调用一次。
 */
export function activeRangeRules(): RangeRule[] {
  return Object.values(useRangeRuleStore.getState().rules);
}

/** 用户填写的规则用固定 id 前缀，便于与将来可能导入的规则区分 */
export function userRangeRuleId(column: string): string {
  return `user-range:${column}`;
}
