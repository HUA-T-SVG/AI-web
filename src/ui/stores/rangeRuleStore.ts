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
 * **保存范围**：规则跟着文件走（换文件清空、同名保留），存在当前标签页的
 * sessionStorage 里 —— 刷新后数据与规则都还在，关掉标签页才丢。
 * 只在内存里的话，「刷新恢复数据」和「规则消失」会同时发生，用户会以为配置生效过
 * 而结果没保住；存在 localStorage 又会让另一个标签页的同名文件误用这份领域口径，
 * 所以选 sessionStorage。
 */

const STORAGE_KEY = 'rdq:range-rules:v1';

export interface PersistedRangeRules {
  fileName: string | null;
  rules: Record<string, RangeRule>;
}

/** 序列化成字符串；单独导出是为了能在 node 里测（组件/store 都不该碰 JSON 细节） */
export function serializeRangeRules(
  fileName: string | null,
  rules: Record<string, RangeRule>,
): string {
  return JSON.stringify({ fileName, rules } satisfies PersistedRangeRules);
}

/** 反序列化并做形状校验；坏数据一律当没有，不能让一段脏 storage 让整页白屏 */
export function parseRangeRules(raw: string | null): PersistedRangeRules | null {
  if (raw === null || raw.trim() === '') return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object') return null;
    const value = parsed as { fileName?: unknown; rules?: unknown };
    if (typeof value.fileName !== 'string' && value.fileName !== null) return null;
    if (value.rules === null || typeof value.rules !== 'object' || Array.isArray(value.rules)) {
      return null;
    }
    const rules: Record<string, RangeRule> = {};
    for (const [column, rule] of Object.entries(value.rules as Record<string, unknown>)) {
      if (rule === null || typeof rule !== 'object') continue;
      const item = rule as Partial<RangeRule>;
      if (typeof item.column !== 'string' || item.column !== column) continue;
      rules[column] = {
        id: typeof item.id === 'string' ? item.id : `user-range:${column}`,
        column,
        ...(typeof item.min === 'number' && Number.isFinite(item.min) ? { min: item.min } : {}),
        ...(typeof item.max === 'number' && Number.isFinite(item.max) ? { max: item.max } : {}),
        ...(typeof item.rationale === 'string' ? { rationale: item.rationale } : {}),
      };
    }
    return { fileName: value.fileName ?? null, rules };
  } catch {
    return null;
  }
}

function readStorage(): PersistedRangeRules | null {
  if (typeof window === 'undefined') return null;
  try {
    return parseRangeRules(window.sessionStorage.getItem(STORAGE_KEY));
  } catch {
    // 隐私模式/被禁用：退回纯内存，不影响当前页面使用
    return null;
  }
}

function writeStorage(state: PersistedRangeRules): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, serializeRangeRules(state.fileName, state.rules));
  } catch {
    // 写不进去不打断操作：内存里仍然生效，只是刷新后要重填
  }
}

const restored = readStorage();

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
  fileName: restored?.fileName ?? null,
  rules: restored?.rules ?? {},

  beginFile: (fileName) =>
    set((state) => {
      if (state.fileName === fileName) return {};
      const next = { fileName, rules: {} };
      writeStorage(next);
      return next;
    }),

  upsert: (rule) =>
    set((state) => {
      const rules = { ...state.rules, [rule.column]: rule };
      writeStorage({ fileName: state.fileName, rules });
      return { rules };
    }),

  remove: (column) =>
    set((state) => {
      const rules = { ...state.rules };
      delete rules[column];
      writeStorage({ fileName: state.fileName, rules });
      return { rules };
    }),

  reset: () => {
    writeStorage({ fileName: null, rules: {} });
    return set({ fileName: null, rules: {} });
  },
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
