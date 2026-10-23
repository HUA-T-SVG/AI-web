import { describe, it, expect } from 'vitest';
import type { ParseResult } from '@/parser/types';
import { CACHE_VERSION, createDatasetCache, datasetCache, type CacheBackend } from './datasetCache';

/**
 * 测试用的内存后端。
 *
 * 刻意用 `structuredClone` 复制一份进出 —— 真 IndexedDB 就是结构化克隆语义，
 * 若测试里直接传引用，就会漏掉「未定义/函数之类的值能不能存」这类只有真后端才有的问题。
 */
class MemoryBackend implements CacheBackend {
  private raw: unknown = undefined;

  async read(): Promise<unknown> {
    return this.raw === undefined ? undefined : structuredClone(this.raw);
  }

  async write(value: unknown): Promise<void> {
    this.raw = structuredClone(value);
  }

  async remove(): Promise<void> {
    this.raw = undefined;
  }

  /** 绕开读取逻辑直接看存了什么 —— 「版本不匹配时真的删掉了」要靠它断言 */
  peek(): unknown {
    return this.raw;
  }
}

function sampleResult(): ParseResult {
  return {
    dataset: {
      rowCount: 2,
      columns: [
        { name: '学号', values: ['001', '002'] },
        { name: '成绩', values: [90, null] },
        { name: '已提交', values: [true, false] },
      ],
    },
    meta: {
      fileName: '成绩 单.csv',
      fileSize: 128,
      format: 'csv',
      encoding: 'utf-8',
      truncated: false,
      warnings: ['第 3 行字段数多于表头'],
    },
  };
}

describe('datasetCache', () => {
  it('存进去再取出来，逐值相等（含 null、布尔、中文列名）', async () => {
    const backend = new MemoryBackend();
    const cache = createDatasetCache(backend);
    const result = sampleResult();

    await cache.save(result, '2026-10-17T08:00:00.000Z', 3);
    const restored = await cache.load();

    expect(restored).toEqual({
      parseResult: result,
      savedAt: '2026-10-17T08:00:00.000Z',
      dataVersion: 3,
    });
    // 逐值相等，而不是「列数相同」：一份列名对、取值串位的缓存比没有缓存更坏
    expect(restored?.parseResult.dataset.columns[1]?.values).toEqual([90, null]);
    expect(restored?.parseResult.dataset.columns[2]?.values).toEqual([true, false]);
  });

  it('空后端取回 null', async () => {
    const cache = createDatasetCache(new MemoryBackend());
    await expect(cache.load()).resolves.toBeNull();
  });

  it('版本不匹配时丢弃旧数据，并把旧条目清掉', async () => {
    const backend = new MemoryBackend();
    const result = sampleResult();
    await backend.write({
      version: CACHE_VERSION + 1,
      dataset: result.dataset,
      meta: result.meta,
      savedAt: '2026-09-01T00:00:00.000Z',
      dataVersion: 1,
    });

    const cache = createDatasetCache(backend);
    await expect(cache.load()).resolves.toBeNull();
    // 「丢弃」必须真的删掉：留着的话每次启动都会白读一遍，而且它随时可能被当成新格式读走
    expect(backend.peek()).toBeUndefined();
  });

  it('数据形状损坏时丢弃，不返回半个数据集', async () => {
    const backend = new MemoryBackend();
    const result = sampleResult();
    await backend.write({
      version: CACHE_VERSION,
      dataset: { rowCount: 2, columns: '不是数组' },
      meta: result.meta,
      savedAt: '2026-10-17T08:00:00.000Z',
      dataVersion: 1,
    });

    const cache = createDatasetCache(backend);
    await expect(cache.load()).resolves.toBeNull();
    expect(backend.peek()).toBeUndefined();
  });

  it('clear 之后取回 null', async () => {
    const backend = new MemoryBackend();
    const cache = createDatasetCache(backend);
    await cache.save(sampleResult(), '2026-10-17T08:00:00.000Z');

    await cache.clear();

    await expect(cache.load()).resolves.toBeNull();
    expect(backend.peek()).toBeUndefined();
  });

  it('只存 dataset 与 meta —— 画像与问题清单不落盘，它们能从 dataset 重算', async () => {
    const backend = new MemoryBackend();
    await createDatasetCache(backend).save(sampleResult(), '2026-10-17T08:00:00.000Z');

    const stored = backend.peek() as Record<string, unknown>;
    // 存两份就有两个真相：画像/问题改了口径之后，恢复出来的旧副本会与重算结果不一致
    expect(Object.keys(stored).sort()).toEqual([
      'dataVersion',
      'dataset',
      'meta',
      'savedAt',
      'version',
    ]);
  });

  it('数据版本随缓存一起存取：刷新后旧结论仍能对上版本', async () => {
    const backend = new MemoryBackend();
    const cache = createDatasetCache(backend);
    await cache.save(sampleResult(), '2026-10-17T08:00:00.000Z', 7);

    const restored = await cache.load();
    expect(restored?.dataVersion).toBe(7);
  });

  it('版本号缺失或非法时丢弃，而不是当成 0 版', async () => {
    const backend = new MemoryBackend();
    const result = sampleResult();
    await backend.write({
      version: CACHE_VERSION,
      dataset: result.dataset,
      meta: result.meta,
      savedAt: '2026-10-17T08:00:00.000Z',
      // 缺失 dataVersion：旧格式或坏数据，不能拿它冒充「第 0 版」
    });

    const cache = createDatasetCache(backend);
    await expect(cache.load()).resolves.toBeNull();
    expect(backend.peek()).toBeUndefined();
  });

  it('读取后端失败时抛错，不冒充「没有数据」', async () => {
    const brokenBackend: CacheBackend = {
      read: async () => {
        throw new Error('IndexedDB 被浏览器禁用');
      },
      write: async () => {},
      remove: async () => {},
    };

    // 返回 null 会让调用方以为「上次没数据」，于是悄悄丢掉一份本来还在的数据
    await expect(createDatasetCache(brokenBackend).load()).rejects.toThrow(
      'IndexedDB 被浏览器禁用',
    );
  });

  it('没传 savedAt 时记为当前时间', async () => {
    const cache = createDatasetCache(
      new MemoryBackend(),
      () => new Date('2026-10-17T09:30:00.000Z'),
    );
    await cache.save(sampleResult());

    await expect(cache.load()).resolves.toMatchObject({ savedAt: '2026-10-17T09:30:00.000Z' });
  });

  it('环境不支持本地存储时写入直接失败，而不是假装存好了', async () => {
    // node 里没有 indexedDB，正好等价于隐私模式 / 禁用站点存储的 webview / 受限 iframe
    // —— 那些场景里**用户是有数据的**，所以「存不了」必须成为一次可被看见的失败，
    // 由 store 变成「刷新会丢」的提示，而不是静默什么都不发生
    await expect(datasetCache.save(sampleResult())).rejects.toThrow(/不支持本地暂存/);
  });
});
