import { create } from 'zustand';
import { isScenarioId, scenarioById, type Scenario, type ScenarioId } from '@/ui/lib/scenarios';

/**
 * 研究场景的选择状态。
 *
 * 这个 store 解决的问题不是存储，而是**归属**：场景只是「先看什么」的界面强调，
 * 一旦换了文件就必须清空 —— 上一份数据的「本次重点」套到新数据上，用户会看到
 * 一条没有依据的重点清单，还以为是自己刚上传的数据有问题。
 *
 * **保存范围**：跟着文件走（换文件清空、同名保留），存在当前标签页的 sessionStorage。
 * 选 sessionStorage 而不是 localStorage 的理由与值域规则相同：另一个标签页里的
 * 同名文件不该继承这份场景口径。刷新后数据与场景一起回来，关掉标签页才清空。
 */

const STORAGE_KEY = 'rdq:scenario:v1';

export interface PersistedScenario {
  fileName: string | null;
  scenarioId: ScenarioId | null;
}

/** 序列化成字符串；单独导出是为了能在 node 里测（store 不碰 JSON 细节） */
export function serializeScenario(
  fileName: string | null,
  scenarioId: ScenarioId | null,
): string {
  return JSON.stringify({ fileName, scenarioId } satisfies PersistedScenario);
}

/**
 * 反序列化并做形状校验。
 *
 * 未知场景 id 一律当没有：storage 是外部输入，也可能是旧版本留下的；
 * 把「chemistry」这种没注册过的场景恢复出来，界面会渲染出一张空卡片。
 */
export function parseScenario(raw: string | null): PersistedScenario | null {
  if (raw === null || raw.trim() === '') return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const value = parsed as { fileName?: unknown; scenarioId?: unknown };
    if (typeof value.fileName !== 'string' && value.fileName !== null) return null;
    if (value.scenarioId !== null && !isScenarioId(value.scenarioId)) return null;
    return { fileName: value.fileName ?? null, scenarioId: value.scenarioId ?? null };
  } catch {
    return null;
  }
}

function readStorage(): PersistedScenario | null {
  if (typeof window === 'undefined') return null;
  try {
    return parseScenario(window.sessionStorage.getItem(STORAGE_KEY));
  } catch {
    // 隐私模式 / 被禁用：退回纯内存，不影响当前页面使用
    return null;
  }
}

function writeStorage(state: PersistedScenario): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(
      STORAGE_KEY,
      serializeScenario(state.fileName, state.scenarioId),
    );
  } catch {
    // 写不进去不打断操作：内存里仍然生效，只是刷新后要重选
  }
}

const restored = readStorage();

interface ScenarioState {
  /** 场景属于哪份文件；换文件必须清空 */
  fileName: string | null;
  scenarioId: ScenarioId | null;
  /** 数据就位时调用；文件名变了就清空场景，同名保留（重试 / 重跑不丢选择） */
  beginFile: (fileName: string | null) => void;
  select: (scenarioId: ScenarioId) => void;
  clear: () => void;
  reset: () => void;
}

export const useScenarioStore = create<ScenarioState>((set) => ({
  fileName: restored?.fileName ?? null,
  scenarioId: restored?.scenarioId ?? null,

  beginFile: (fileName) =>
    set((state) => {
      if (state.fileName === fileName) return {};
      // 第一次绑定文件时保留用户先点过的场景（选场景 → 再上传自己的数据是常见顺序）；
      // 已经属于另一份文件时必须清空，否则上一份数据的重点会套到新数据上
      const scenarioId = state.fileName === null ? state.scenarioId : null;
      const next = { fileName, scenarioId };
      writeStorage(next);
      return next;
    }),

  select: (scenarioId) =>
    set((state) => {
      writeStorage({ fileName: state.fileName, scenarioId });
      return { scenarioId };
    }),

  clear: () =>
    set((state) => {
      writeStorage({ fileName: state.fileName, scenarioId: null });
      return { scenarioId: null };
    }),

  reset: () => {
    writeStorage({ fileName: null, scenarioId: null });
    return set({ fileName: null, scenarioId: null });
  },
}));

/**
 * 取当前场景对象。
 *
 * **不要写进 zustand selector**：`scenarioById` 每次返回相同引用（数据是静态的）
 * 其实安全，但为避免下一个人照抄成「每次返回新对象」的派生函数 —— `reviewStore`
 * 的 `confirmedActionsOf` 曾因此无限重渲染、整页白屏 —— 这里统一约定：
 * 需要场景的地方直接 `getState()` 调用一次。
 */
export function activeScenario(): Scenario | null {
  return scenarioById(useScenarioStore.getState().scenarioId);
}
