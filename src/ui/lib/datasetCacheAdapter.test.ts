import { describe, expect, it } from 'vitest';
import { createDatasetCache, createIndexedDbBackend, CACHE_VERSION } from './datasetCache';
import type { ParseResult } from '@/parser/types';

/**
 * 真 IndexedDB 适配器的错误路径（T10）。
 *
 * 单测跑在 node 环境、没有 IndexedDB，而这个适配器里有一半代码是**故障时才走**的：
 * `onblocked`、quota 超限、连接失效、事务中断、环境不支持……此前它们只有 E2E 的
 * happy path 走过，等于「写了处理但没人验证过」。
 *
 * 为什么不用 `fake-indexeddb`：那是一个只为几十行适配器引入的依赖，而且要能讲清它
 * 与真实现的差异。这里只需要 `IDBFactory` 的最小形状 —— 因此改成**注入 factory**，
 * 测试用一个 40 行的假实现精确触发每条分支。真 IndexedDB 仍由 E2E 覆盖。
 *
 * 覆盖的也正是「用户会遇到什么」：
 *   - 打开被别的标签页挡住 → 提示关掉其他标签页
 *   - 空间不够 → 提示清理存储，而不是抛一串英文 DOMException
 *   - 连接失效 → 提示刷新
 *   - 环境没有 IndexedDB → 写盘明确失败（不能假装存好了）
 */

type OpenBehavior = 'success' | 'error' | 'blocked' | 'throw';
type TxBehavior = 'complete' | 'error' | 'abort';

interface FakeOptions {
  open?: OpenBehavior;
  tx?: TxBehavior;
  /** 事务错误的名字（'QuotaExceededError' 等），用来验翻译 */
  txErrorName?: string;
  /** `database.transaction()` 抛出的错误名（'InvalidStateError' 等） */
  transactionThrows?: string;
  /** 读请求失败时的错误名 */
  readErrorName?: string;
  storeExists?: boolean;
}

interface FakeCallCounts {
  open: number;
  createObjectStore: number;
  transaction: number;
  put: number;
  delete: number;
}

class FakeRequest {
  onupgradeneeded: (() => void) | null = null;
  onsuccess: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onblocked: (() => void) | null = null;
  error: unknown = null;
  constructor(public result: unknown) {}
}

class FakeTransaction {
  oncomplete: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  error: unknown = null;
}

interface FakeFactory {
  factory: IDBFactory;
  counts: FakeCallCounts;
  /** 假后端里的那条记录（write 写入、read 读出、delete 清空） */
  state: { value: unknown };
}

function createFakeFactory(options: FakeOptions = {}): FakeFactory {
  const counts: FakeCallCounts = { open: 0, createObjectStore: 0, transaction: 0, put: 0, delete: 0 };
  const state: { value: unknown } = { value: undefined };

  function makeStore(transaction: FakeTransaction): IDBObjectStore {
    const fireTransaction = () => {
      queueMicrotask(() => {
        if (options.tx === 'error') {
          transaction.error = options.txErrorName
            ? new DOMException('事务失败', options.txErrorName)
            : new Error('事务失败');
          transaction.onerror?.();
        } else if (options.tx === 'abort') {
          transaction.error = options.txErrorName
            ? new DOMException('事务被中断', options.txErrorName)
            : new Error('事务被中断');
          transaction.onabort?.();
        } else {
          transaction.oncomplete?.();
        }
      });
    };

    const store = {
      transaction,
      get: () => {
        const request = new FakeRequest(undefined);
        queueMicrotask(() => {
          if (options.readErrorName) {
            request.error = new DOMException('读取失败', options.readErrorName);
            request.onerror?.();
          } else {
            request.result = state.value;
            request.onsuccess?.();
          }
        });
        return request;
      },
      put: (value: unknown) => {
        counts.put += 1;
        state.value = value;
        fireTransaction();
        return new FakeRequest(undefined);
      },
      delete: () => {
        counts.delete += 1;
        state.value = undefined;
        fireTransaction();
        return new FakeRequest(undefined);
      },
    };
    return store as unknown as IDBObjectStore;
  }

  const factory = {
    open: () => {
      counts.open += 1;
      if (options.open === 'throw') throw new Error('open 直接抛错');
      const database = {
        objectStoreNames: { contains: () => options.storeExists ?? true },
        createObjectStore: () => {
          counts.createObjectStore += 1;
          return {};
        },
        transaction: () => {
          counts.transaction += 1;
          if (options.transactionThrows) {
            throw new DOMException('连接已关闭', options.transactionThrows);
          }
          return { objectStore: () => makeStore(new FakeTransaction()) };
        },
      };
      const request = new FakeRequest(database);
      queueMicrotask(() => {
        request.onupgradeneeded?.();
        if (options.open === 'blocked') request.onblocked?.();
        else if (options.open === 'error') {
          request.error = new Error('open 失败');
          request.onerror?.();
        } else request.onsuccess?.();
      });
      return request;
    },
  } as unknown as IDBFactory;

  return { factory, counts, state };
}

const result: ParseResult = {
  dataset: { rowCount: 1, columns: [{ name: '年龄', values: [23] }] },
  meta: { fileName: 'a.csv', fileSize: 10, format: 'csv', truncated: false, warnings: [] },
};

describe('IndexedDB 适配器 · 正常路径', () => {
  it('读写走同一份记录：save 之后 load 能读回来', async () => {
    const { factory } = createFakeFactory();
    const cache = createDatasetCache(createIndexedDbBackend(factory));

    await cache.save(result, '2026-10-20T00:00:00.000Z');
    const restored = await cache.load();

    expect(restored?.parseResult.dataset.rowCount).toBe(1);
    expect(restored?.savedAt).toBe('2026-10-20T00:00:00.000Z');
  });

  it('clear 之后读不到东西', async () => {
    const { factory } = createFakeFactory();
    const cache = createDatasetCache(createIndexedDbBackend(factory));

    await cache.save(result);
    await cache.clear();

    await expect(cache.load()).resolves.toBeNull();
  });

  it('连接只建一次，两次操作复用同一个', async () => {
    const { factory, counts } = createFakeFactory();
    const cache = createDatasetCache(createIndexedDbBackend(factory));

    await cache.load();
    await cache.load();

    expect(counts.open).toBe(1);
  });

  it('object store 不存在时在 upgradeneeded 里建出来', async () => {
    const { factory, counts } = createFakeFactory({ storeExists: false });
    const cache = createDatasetCache(createIndexedDbBackend(factory));

    await cache.load();

    expect(counts.createObjectStore).toBe(1);
  });
});

describe('IndexedDB 适配器 · 打开连接失败', () => {
  it('open 报错时给可执行的中文，而不是英文 DOMException', async () => {
    const { factory } = createFakeFactory({ open: 'error' });
    const cache = createDatasetCache(createIndexedDbBackend(factory));

    await expect(cache.load()).rejects.toThrow(/无法打开浏览器的本地存储/);
  });

  it('被其他标签页占用（onblocked）时说清「关掉其他标签页」', async () => {
    const { factory } = createFakeFactory({ open: 'blocked' });
    const cache = createDatasetCache(createIndexedDbBackend(factory));

    // 不处理 onblocked 的话 open 永远不 settle —— 界面会永远停在「恢复中」
    await expect(cache.load()).rejects.toThrow(/被其他标签页占用/);
  });

  it('打开失败不会被缓存成永久状态：下次操作会重试', async () => {
    const { factory, counts } = createFakeFactory({ open: 'error' });
    const cache = createDatasetCache(createIndexedDbBackend(factory));

    await expect(cache.load()).rejects.toThrow();
    await expect(cache.load()).rejects.toThrow();

    expect(counts.open).toBe(2);
  });

  it('open 同步抛错也变成 rejected promise，而不是让调用方卡住', async () => {
    const { factory } = createFakeFactory({ open: 'throw' });
    const cache = createDatasetCache(createIndexedDbBackend(factory));

    await expect(cache.load()).rejects.toThrow(/open 直接抛错|无法打开/);
  });
});

describe('IndexedDB 适配器 · 写入失败', () => {
  it('空间不足时提示清理存储，而不是把 QuotaExceededError 原文甩给用户', async () => {
    const { factory } = createFakeFactory({ tx: 'error', txErrorName: 'QuotaExceededError' });
    const cache = createDatasetCache(createIndexedDbBackend(factory));

    await expect(cache.save(result)).rejects.toThrow(/空间不足/);
  });

  it('事务被中断（onabort）时说清是写入被中断', async () => {
    const { factory } = createFakeFactory({ tx: 'abort' });
    const cache = createDatasetCache(createIndexedDbBackend(factory));

    await expect(cache.save(result)).rejects.toThrow(/写入暂存数据被中断/);
  });

  it('普通事务错误带上是哪一步失败的', async () => {
    const { factory } = createFakeFactory({ tx: 'error' });
    const cache = createDatasetCache(createIndexedDbBackend(factory));

    await expect(cache.save(result)).rejects.toThrow(/写入暂存数据失败/);
  });

  it('连接失效（transaction 抛 InvalidStateError）时提示刷新重试', async () => {
    const { factory } = createFakeFactory({ transactionThrows: 'InvalidStateError' });
    const cache = createDatasetCache(createIndexedDbBackend(factory));

    await expect(cache.save(result)).rejects.toThrow(/连接已失效/);
  });
});

describe('IndexedDB 适配器 · 读取与清除失败', () => {
  it('读请求失败时抛出，而不是当成「上次没有数据」', async () => {
    const { factory } = createFakeFactory({ readErrorName: 'UnknownError' });
    const cache = createDatasetCache(createIndexedDbBackend(factory));

    // 返回 null 会让界面以为「没存过」，而数据其实还在 —— 用户的感受是「数据莫名没了」
    await expect(cache.load()).rejects.toThrow(/读取暂存数据失败/);
  });

  it('清除事务失败时抛出，而不是假装清掉了', async () => {
    const { factory } = createFakeFactory({ tx: 'error' });
    const cache = createDatasetCache(createIndexedDbBackend(factory));

    await expect(cache.clear()).rejects.toThrow(/清空暂存数据失败/);
  });
});

describe('IndexedDB 适配器 · 环境根本没有 IndexedDB', () => {
  it('读返回「没有数据」，写明确失败（不能假装存好了）', async () => {
    const cache = createDatasetCache(createIndexedDbBackend(undefined));

    await expect(cache.load()).resolves.toBeNull();
    await expect(cache.save(result)).rejects.toThrow(/不支持本地暂存/);
    await expect(cache.clear()).resolves.toBeUndefined();
  });

  it('被丢弃的旧缓存会被真删掉，而不是留在后端里每次白读', async () => {
    const { factory, counts, state } = createFakeFactory();
    const cache = createDatasetCache(createIndexedDbBackend(factory));
    state.value = { version: CACHE_VERSION + 1, dataset: {}, meta: {}, savedAt: 'x' };

    await expect(cache.load()).resolves.toBeNull();
    expect(counts.delete).toBe(1);
    expect(state.value).toBeUndefined();
  });
});
