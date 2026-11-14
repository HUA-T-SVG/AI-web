import { create } from 'zustand';
import { hasRangeConstraints, type RangeRule } from '@/core';

/**
 * 用户在检查页填写的「适用范围」（值域规则）。
 *
 * 这个 store 解决的问题不是存储，而是**语义**：core 里的 `range-rules` 检查一直存在，
 * 但产品没有配规则的入口，所以那条检查实际上从未生效。检查覆盖地图会把这件事
 * 如实标成「领域范围尚未确认」，并给一个能真正填写的入口 —— 填完重跑检查，
 * 覆盖地图与问题清单一起更新。
 *
 * **保存范围**：规则跟着单次导入走（重新上传即清空），存在当前标签页的
 * sessionStorage 里 —— 刷新后数据与规则都还在，关掉标签页才丢。
 * 只在内存里的话，「刷新恢复数据」和「规则消失」会同时发生，用户会以为配置生效过
 * 而结果没保住；存在 localStorage 又会让另一个标签页的同名文件误用这份领域口径，
 * 所以选 sessionStorage。
 */

const STORAGE_KEY = 'rdq:range-rules:v1';

export interface PersistedRangeRules {
  fileName: string | null;
  importId?: string;
  rules: Record<string, RangeRule>;
  dictionaryCodes?: DictionaryCodeMap;
}

export interface ConfirmedDictionaryCode { column: string; code: string; quote: string }
type DictionaryCodeMap = Record<string, ConfirmedDictionaryCode[]>;

export function validDictionaryCode(entry: unknown): entry is ConfirmedDictionaryCode {
  if (!entry || typeof entry !== 'object') return false;
  const { column, code, quote } = entry as Partial<ConfirmedDictionaryCode>;
  return typeof column === 'string' && column.length > 0 && column.length <= 512 &&
    typeof code === 'string' && code.trim() === code && code.length > 0 && code.length <= 80 &&
    typeof quote === 'string' && quote.trim().length > 0 && quote.length <= 1000;
}

function validCodeMap(raw: unknown): DictionaryCodeMap {
  const result: DictionaryCodeMap = Object.create(null);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return result;
  for (const [column, entries] of Object.entries(raw)) {
    if (!Array.isArray(entries)) continue;
    const codes = [...new Map(entries.filter((entry): entry is ConfirmedDictionaryCode =>
      validDictionaryCode(entry) && entry.column === column).map((entry) => [entry.code, entry])).values()];
    if (codes.length > 0) result[column] = codes;
  }
  return result;
}

/** 序列化成字符串；单独导出是为了能在 node 里测（组件/store 都不该碰 JSON 细节） */
export function serializeRangeRules(
  fileName: string | null,
  rules: Record<string, RangeRule>,
  dictionaryCodes?: DictionaryCodeMap,
  importId?: string,
): string {
  return JSON.stringify({ fileName, importId, rules, dictionaryCodes } satisfies PersistedRangeRules);
}

/** 反序列化并做形状校验；坏数据一律当没有，不能让一段脏 storage 让整页白屏 */
export function parseRangeRules(raw: string | null): PersistedRangeRules | null {
  if (raw === null || raw.trim() === '') return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object') return null;
    const value = parsed as { fileName?: unknown; importId?: unknown; rules?: unknown; dictionaryCodes?: unknown };
    if (typeof value.fileName !== 'string' && value.fileName !== null) return null;
    if (value.importId !== undefined && (typeof value.importId !== 'string' || !value.importId)) return null;
    if (value.rules === null || typeof value.rules !== 'object' || Array.isArray(value.rules)) {
      return null;
    }
    const rules: Record<string, RangeRule> = Object.create(null);
    for (const [column, rule] of Object.entries(value.rules as Record<string, unknown>)) {
      if (rule === null || typeof rule !== 'object') continue;
      const item = rule as Partial<RangeRule>;
      if (typeof item.column !== 'string' || item.column !== column) continue;
      const allowedValues = Array.isArray(item.allowedValues)
        ? [...new Set(item.allowedValues
          .filter((entry): entry is string => typeof entry === 'string')
          .map((entry) => entry.trim())
          .filter(Boolean))]
        : [];
      const restoredRule: RangeRule = {
        id: typeof item.id === 'string' ? item.id : `user-range:${column}`,
        column,
        ...(typeof item.min === 'number' && Number.isFinite(item.min) ? { min: item.min } : {}),
        ...(typeof item.max === 'number' && Number.isFinite(item.max) ? { max: item.max } : {}),
        ...(allowedValues.length > 0 ? { allowedValues } : {}),
        ...(typeof item.rationale === 'string' ? { rationale: item.rationale } : {}),
      };
      if (hasRangeConstraints(restoredRule)) rules[column] = restoredRule;
    }
    return { fileName: value.fileName ?? null, rules,
      ...(value.importId !== undefined ? { importId: value.importId } : {}),
      ...(value.dictionaryCodes !== undefined ? { dictionaryCodes: validCodeMap(value.dictionaryCodes) } : {}),
    };
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

function writeStorage(state: PersistedRangeRules & { persist?: boolean }): void {
  if (typeof window === 'undefined' || state.persist === false) return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, serializeRangeRules(state.fileName, state.rules, state.dictionaryCodes, state.importId));
  } catch {
    // 写不进去不打断操作：内存里仍然生效，只是刷新后要重填
  }
}

const restored = readStorage();

interface RangeRuleState extends PersistedRangeRules {
  dictionaryCodes: DictionaryCodeMap;
  persist: boolean;
  beginFile: (fileName: string | null, importId?: string) => void;
  clearPersistence: () => void;
  upsert: (rule: RangeRule) => void;
  remove: (column: string) => void;
  saveDictionaryCodes: (codes: readonly ConfirmedDictionaryCode[]) => void;
  removeDictionaryCode: (column: string, code: string) => void;
  reset: () => void;
}

export const useRangeRuleStore = create<RangeRuleState>((set) => ({
  fileName: restored?.fileName ?? null,
  importId: restored?.importId,
  persist: true,
  rules: restored?.rules ?? {},
  dictionaryCodes: restored?.dictionaryCodes ?? Object.create(null),

  beginFile: (fileName, importId) =>
    set((state) => {
      if (state.fileName === fileName && state.importId === importId) return state;
      const next = { fileName, importId, persist: true, rules: {}, dictionaryCodes: Object.create(null) };
      writeStorage(next);
      return next;
    }),

  clearPersistence: () => {
    if (typeof window !== 'undefined') window.sessionStorage.removeItem(STORAGE_KEY);
    set({ persist: false });
  },

  upsert: (rule) =>
    set((state) => {
      const rules = { ...state.rules, [rule.column]: rule };
      writeStorage({ ...state, rules });
      return { rules };
    }),

  remove: (column) =>
    set((state) => {
      const rules = { ...state.rules };
      delete rules[column];
      writeStorage({ ...state, rules });
      return { rules };
    }),

  saveDictionaryCodes: (codes) => set((state) => {
    if (codes.length === 0) return state;
    const grouped: DictionaryCodeMap = Object.create(null);
    for (const code of codes) if (validDictionaryCode(code)) (grouped[code.column] ??= []).push(code);
    const dictionaryCodes: DictionaryCodeMap = Object.assign(Object.create(null), state.dictionaryCodes, validCodeMap(grouped));
    writeStorage({ ...state, dictionaryCodes });
    return { dictionaryCodes };
  }),

  removeDictionaryCode: (column, code) => set((state) => {
    const remaining = (state.dictionaryCodes[column] ?? []).filter((item) => item.code !== code);
    const dictionaryCodes: DictionaryCodeMap = Object.assign(Object.create(null), state.dictionaryCodes);
    if (remaining.length > 0) dictionaryCodes[column] = remaining;
    else delete dictionaryCodes[column];
    writeStorage({ ...state, dictionaryCodes });
    return { dictionaryCodes };
  }),

  reset: () => {
    const next = { fileName: null, importId: undefined, persist: true, rules: {}, dictionaryCodes: Object.create(null) };
    writeStorage(next);
    return set(next);
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
  return Object.values(useRangeRuleStore.getState().rules).filter(hasRangeConstraints);
}

/** 用户填写的规则用固定 id 前缀，便于与将来可能导入的规则区分 */
export function userRangeRuleId(column: string): string {
  return `user-range:${column}`;
}
