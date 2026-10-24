import type { ColumnData, Dataset } from '@/core';
import type { ParseMeta, ParseResult } from '@/parser/types';

/**
 * 数据集暂存。
 *
 * spec §3.1 的分层图里 `IndexedDB（原始数据暂存）` 就排在这里：整页刷新之后，
 * 上一次导入的数据还在。在此之前数据集只存在内存 store 里，刷新即空态 ——
 * 演示时按一下 F5 就得重新上传，`/export` 的看板直接变成「还没有载入数据」。
 *
 * **只存 Dataset + meta，不存画像与问题清单。** 那两样都能从 Dataset 重算，
 * 而存两份就会有两个真相：某天检查口径改了，恢复出来的旧结论会与重算结果不一致，
 * 且没有任何东西会提醒你。重算的代价是几百毫秒，存两份的代价是悄悄说两套话。
 *
 * **版本号是硬门槛。** 缓存里的结构跨迭代会变，而旧结构读出来可能「看着能用」——
 * 例如以后给 ColumnData 加了一个字段，旧缓存没有它，检查会按缺失值处理，于是
 * 用户看到的是一份被静默改坏的数据。这种情况比「没有缓存」坏得多，所以版本不匹配
 * 一律丢弃。这也是 `knowledge/tools/build-index.py` 里那条「半份坏索引比没有索引更难查」
 * 的同一个判断。
 *
 * **「数据留在本机」这件事必须说清，它是本轮新增的唯一数据落地面**：
 * 原始数据从此保存在这台机器的浏览器存储里 —— 明文、默认不过期、同源的所有标签页共享，
 * 直到用户点「放弃并重新上传」或清除站点数据。硬承诺「数据不出浏览器」没有被违反，
 * 但「留在本机」本身是要告知用户的事实：实验室公用机上，下一个人打开浏览器就能
 * 恢复上一个人的原始表。见交接说明 §8.12。
 */

/**
 * 缓存载荷的结构版本。**改动 CachedEntry 的形状时必须一起 +1。**
 *
 * v2（2026-10-23）：随数据一起持久化 `dataVersion`，让「旧结论属于哪个版本」
 * 在刷新后仍然成立。
 * v3（2026-10-24）：持久化 `isSample`，刷新后「示例数据」标记不再丢失。
 * **v2 缓存仍可读**（缺 isSample 时按 false 处理）：升级不应该让用户丢掉已经导好的数据；
 * 而示例标记只影响提示文案，不存在「读错会算错」的风险。
 */
export const CACHE_VERSION = 3;

const DB_NAME = 'research-data-quality-agent';
const DB_VERSION = 1;
const STORE_NAME = 'dataset';
const RECORD_KEY = 'current';

/**
 * 缓存的实际存储后端。
 *
 * 抽成接口是为了让单测能用内存实现 —— 本项目的 vitest 跑在 node 环境、没有 DOM，
 * 而为了测试引入 `fake-indexeddb` 等于为一个几十行的适配器加一个要能讲清的依赖。
 * 真 IndexedDB 由 E2E 的「刷新后数据还在」覆盖，那本来就是它唯一该被验证的地方。
 */
export interface CacheBackend {
  /** 没有条目时返回 undefined */
  read(): Promise<unknown>;
  write(value: unknown): Promise<void>;
  remove(): Promise<void>;
}

export interface RestoredDataset {
  parseResult: ParseResult;
  savedAt: string;
  /** 落盘时的数据版本。恢复后直接沿用，不再凭空 +1 */
  dataVersion: number;
  /** 落盘时这份数据是不是「体验示例」 */
  isSample: boolean;
}

export interface DatasetCache {
  save(
    result: ParseResult,
    savedAt?: string,
    dataVersion?: number,
    isSample?: boolean,
  ): Promise<void>;
  load(): Promise<RestoredDataset | null>;
  clear(): Promise<void>;
}

/** 落盘的形状。见文件头的版本号说明。 */
interface CachedEntry {
  version: number;
  dataset: Dataset;
  meta: ParseMeta;
  savedAt: string;
  dataVersion: number;
  isSample: boolean;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isColumnData(value: unknown, rowCount: number): value is ColumnData {
  if (!isPlainObject(value)) return false;
  if (typeof value.name !== 'string') return false;
  if (!Array.isArray(value.values)) return false;
  // 长度必须与 rowCount 一致：这是「半个数据集」唯一能低成本查出来的形态。
  // 逐个单元格验类型要 200k × 50 次判断（几十毫秒），换不来额外保证，查到长度为止。
  return value.values.length === rowCount;
}

function isParseMeta(value: unknown): value is ParseMeta {
  if (!isPlainObject(value)) return false;
  if (typeof value.fileName !== 'string') return false;
  if (typeof value.fileSize !== 'number') return false;
  if (value.format !== 'csv' && value.format !== 'xlsx') return false;
  if (typeof value.truncated !== 'boolean') return false;
  if (!Array.isArray(value.warnings)) return false;
  return value.warnings.every((warning) => typeof warning === 'string');
}

function isDataset(value: unknown): value is Dataset {
  if (!isPlainObject(value)) return false;
  const rowCount = value.rowCount;
  if (typeof rowCount !== 'number' || !Number.isInteger(rowCount) || rowCount < 0) return false;
  if (!Array.isArray(value.columns)) return false;
  return value.columns.every((column) => isColumnData(column, rowCount));
}

type DecodeOutcome =
  { kind: 'empty' } | { kind: 'ok'; entry: CachedEntry } | { kind: 'discard'; reason: string };

/** 把后端里的原始值判定成「可以用的条目」或「该丢掉的东西」。纯函数，便于单测。 */
function decodeEntry(raw: unknown): DecodeOutcome {
  if (raw === undefined || raw === null) return { kind: 'empty' };
  if (!isPlainObject(raw)) return { kind: 'discard', reason: '缓存不是一个对象' };

  // v2 仍可读：v3 只多了一个不影响计算的示例标记，为了一个提示文案
  // 丢掉用户已经导好的数据是不值得的。更旧的版本（v1 没有 dataVersion）仍丢弃。
  if (raw.version !== CACHE_VERSION && raw.version !== 2) {
    // 读出旧版本里的 version 字段本身可能缺失，如实报出它是什么，便于排查
    return {
      kind: 'discard',
      reason: `结构版本不匹配（缓存 ${String(raw.version)}，当前 ${CACHE_VERSION}）`,
    };
  }
  if (!isDataset(raw.dataset)) return { kind: 'discard', reason: '数据集结构不完整' };
  if (!isParseMeta(raw.meta)) return { kind: 'discard', reason: '文件元信息结构不完整' };
  if (typeof raw.savedAt !== 'string' || Number.isNaN(Date.parse(raw.savedAt))) {
    return { kind: 'discard', reason: '暂存时间无法解析' };
  }
  // 版本号是「旧结论失效」的判据。缺失或非法一律丢弃：把未知版本当成 0，
  // 会让恢复出来的结论看起来属于一个真实存在的版本。
  if (
    typeof raw.dataVersion !== 'number' ||
    !Number.isInteger(raw.dataVersion) ||
    raw.dataVersion < 0
  ) {
    return { kind: 'discard', reason: '数据版本缺失或非法' };
  }

  return {
    // v2 没有 isSample，按 false 处理；只有显式 true 才算示例
    kind: 'ok',
    entry: { ...raw, isSample: raw.isSample === true } as unknown as CachedEntry,
  };
}

/**
 * 用给定的后端构造一套缓存操作。
 *
 * `now` 可注入，只为让「没传 savedAt 时记为当前时间」这条能被确定性地测到。
 */
export function createDatasetCache(
  backend: CacheBackend,
  now: () => Date = () => new Date(),
): DatasetCache {
  return {
    async save(result, savedAt, dataVersion = 1, isSample = false) {
      const entry: CachedEntry = {
        version: CACHE_VERSION,
        dataset: result.dataset,
        meta: result.meta,
        savedAt: savedAt ?? now().toISOString(),
        dataVersion,
        isSample,
      };
      await backend.write(entry);
    },

    async load() {
      // 后端读失败**必须抛出去**：返回 null 会让调用方以为「上次没有数据」，
      // 于是把一份其实还在的缓存当成不存在 —— 用户看不到任何异常，只是数据没了
      const raw = await backend.read();
      const outcome = decodeEntry(raw);

      if (outcome.kind === 'empty') return null;
      if (outcome.kind === 'discard') {
        // 读不懂的缓存就是垃圾。留着它是每次启动都白读一遍，且随时可能被后续逻辑误用
        await backend.remove();
        console.warn(`[cache] 已丢弃上次的暂存数据：${outcome.reason}`);
        return null;
      }

      const { entry } = outcome;
      return {
        parseResult: { dataset: entry.dataset, meta: entry.meta },
        savedAt: entry.savedAt,
        dataVersion: entry.dataVersion,
        isSample: entry.isSample,
      };
    },

    async clear() {
      await backend.remove();
    },
  };
}

/**
 * 把 IndexedDB 的失败翻译成用户能照着做的中文。
 *
 * **不要把 DOMException 原样扔给界面**：`QuotaExceededError`、「The transaction was
 * aborted」这类原文对用户没有信息量，而它们的处置方式完全不同（清空间 / 刷新重试 /
 * 换浏览器）。这一层是唯一知道「是哪种失败」的地方，翻译要在这里做。
 */
function describeIndexedDbError(error: unknown, fallback: string): Error {
  if (error instanceof Error) {
    if (error.name === 'QuotaExceededError') {
      return new Error(
        '浏览器本地存储空间不足，这次数据没能存下来。可以清理本站点的存储后重试，或换一个浏览器。',
      );
    }
    if (error.name === 'InvalidStateError') {
      return new Error(
        '浏览器本地存储连接已失效（可能是另一个标签页动过数据库）。刷新页面后重试。',
      );
    }
    return new Error(`${fallback}（${error.message}）`);
  }
  return new Error(fallback);
}

/**
 * 真 IndexedDB 后端。
 *
 * 打开连接是惰性的：模块被 import 时（含服务端渲染、静态分析）不能碰 `indexedDB`，
 * 否则在 node 下直接 ReferenceError。连接也只建一次，之后复用。
 *
 * `factory` 显式传入（而不是在函数里直接读全局）：单测要能注入一个假的 `IDBFactory`
 * 来覆盖 `onblocked` / quota / `InvalidStateError` 这些**真 IndexedDB 只在故障时才走**
 * 的分支。传 `undefined` 表示这个环境没有 IndexedDB（服务端渲染、隐私模式、禁用站点
 * 存储的 webview）—— 调用方按「没有后端」处理。
 */
export function createIndexedDbBackend(factory: IDBFactory | undefined): CacheBackend {
  let opening: Promise<IDBDatabase | null> | null = null;

  function open(): Promise<IDBDatabase | null> {
    if (factory === undefined) return Promise.resolve(null);

    opening ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = factory.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          database.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(describeIndexedDbError(request.error, '无法打开浏览器的本地存储'));
      // 别的标签页正占着旧版本连接时会走到这里。不处理的话 open 永远不 settle，
      // 界面就永远等不到「恢复上次数据」的结论 —— 与 parser 的 Worker 超时是同一类问题
      request.onblocked = () =>
        reject(new Error('浏览器本地存储被其他标签页占用：关闭其他标签页后刷新重试。'));
    }).catch((error: unknown) => {
      // 失败的 Promise 不能留在 opening 里，否则重试永远拿到同一个失败
      opening = null;
      throw error;
    });

    return opening;
  }

  /** 无 runtime 环境（node 下渲染）时返回 null，调用方按「没有后端」处理 */
  async function store(mode: IDBTransactionMode): Promise<IDBObjectStore | null> {
    const database = await open();
    if (database === null) return null;
    try {
      return database.transaction(STORE_NAME, mode).objectStore(STORE_NAME);
    } catch (error) {
      // 连接被别的标签页升级/关闭后再用会抛 InvalidStateError。它必须变成一句
      // 能照着做的中文，否则界面只会显示 "The database connection is closing"。
      throw describeIndexedDbError(error, '无法访问浏览器的本地存储');
    }
  }

  return {
    async read() {
      const objectStore = await store('readonly');
      if (objectStore === null) return undefined;
      return new Promise<unknown>((resolve, reject) => {
        const request = objectStore.get(RECORD_KEY);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(describeIndexedDbError(request.error, '读取暂存数据失败'));
      });
    },

    async write(value) {
      const objectStore = await store('readwrite');
      if (objectStore === null) {
        // 没有 IndexedDB **不只是服务端渲染**：隐私模式、禁用站点存储的 webview、
        // 未带 allow-same-origin 的受限 iframe 里也会走到这里，而那时候用户是有数据的。
        // 悄悄返回会让「刷新后还在」这个新承诺失效且一个字都不说 —— 抛出去，
        // 让调用方把「刷新会丢」告诉用户
        throw new Error('这个浏览器环境不支持本地暂存（可能处于隐私模式，或禁用了站点存储）');
      }
      await new Promise<void>((resolve, reject) => {
        // 等事务 complete 而不是 put 的 onsuccess —— 只有事务提交了才算真的写进去了
        objectStore.transaction.oncomplete = () => resolve();
        objectStore.transaction.onerror = () =>
          reject(describeIndexedDbError(objectStore.transaction.error, '写入暂存数据失败'));
        objectStore.transaction.onabort = () =>
          reject(describeIndexedDbError(objectStore.transaction.error, '写入暂存数据被中断'));
        objectStore.put(value, RECORD_KEY);
      });
    },

    async remove() {
      const objectStore = await store('readwrite');
      if (objectStore === null) return;
      await new Promise<void>((resolve, reject) => {
        objectStore.transaction.oncomplete = () => resolve();
        objectStore.transaction.onerror = () =>
          reject(describeIndexedDbError(objectStore.transaction.error, '清空暂存数据失败'));
        objectStore.delete(RECORD_KEY);
      });
    },
  };
}

/** 产品里用的那一份（浏览器 IndexedDB）。`typeof` 守卫让它在 node/SSR 下也只是「没有后端」 */
export const datasetCache: DatasetCache = createDatasetCache(
  createIndexedDbBackend(typeof indexedDB === 'undefined' ? undefined : indexedDB),
);
