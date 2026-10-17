import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ParseResult, ParseError } from '@/parser/types';

// 控制解析结果：node 环境里没有真实 Worker，而且状态机的测试不该依赖解析细节
vi.mock('@/parser/workerClient', () => ({ parseInWorker: vi.fn() }));
// 暂存后端换成内存假实现：node 环境没有 IndexedDB，且这些用例要控制「缓存里有什么」
vi.mock('@/ui/lib/datasetCache', () => ({
  datasetCache: { save: vi.fn(), load: vi.fn(), clear: vi.fn() },
}));

import { parseInWorker } from '@/parser/workerClient';
import { datasetCache } from '@/ui/lib/datasetCache';
import { useDatasetStore, resetDatasetStoreForTest } from './datasetStore';

const mockParse = vi.mocked(parseInWorker);
const mockCache = {
  save: vi.mocked(datasetCache.save),
  load: vi.mocked(datasetCache.load),
  clear: vi.mocked(datasetCache.clear),
};

function makeFile(content: string, name = 'a.csv'): File {
  return new File([content], name, { type: 'text/csv' });
}

function okResult(): ParseResult {
  return {
    dataset: { rowCount: 2, columns: [{ name: '年龄', values: [20, 30] }] },
    meta: { fileName: 'a.csv', fileSize: 10, format: 'csv', truncated: false, warnings: [] },
  };
}

describe('datasetStore', () => {
  beforeEach(() => {
    resetDatasetStoreForTest();
    mockParse.mockReset();
    mockCache.save.mockReset().mockResolvedValue(undefined);
    mockCache.load.mockReset().mockResolvedValue(null);
    mockCache.clear.mockReset().mockResolvedValue(undefined);
    useDatasetStore.getState().reset();
  });

  it('初始状态是 idle', () => {
    const state = useDatasetStore.getState();
    expect(state.status).toBe('idle');
    expect(state.parseResult).toBeNull();
    expect(state.profile).toBeNull();
    expect(state.issues).toEqual([]);
  });

  it('解析成功后进入 ready，并同时算出画像与问题', async () => {
    mockParse.mockResolvedValue(okResult());

    await useDatasetStore.getState().loadFile(makeFile('年龄\n20\n30'));

    const state = useDatasetStore.getState();
    expect(state.status).toBe('ready');
    expect(state.profile?.columns).toHaveLength(1);
    expect(state.parseResult?.meta.fileName).toBe('a.csv');
  });

  it('解析失败后进入 error 并保留可读提示', async () => {
    const failure: ParseError = {
      kind: 'empty-file',
      message: '这个文件是空的，没有任何内容。',
    };
    mockParse.mockResolvedValue(failure);

    await useDatasetStore.getState().loadFile(makeFile(''));

    const state = useDatasetStore.getState();
    expect(state.status).toBe('error');
    expect(state.error).toContain('空');
    expect(state.parseResult).toBeNull();
  });

  it('重新上传会清掉上一次的结果，不出现新旧混合', async () => {
    mockParse.mockResolvedValueOnce(okResult());
    await useDatasetStore.getState().loadFile(makeFile('年龄\n20\n30'));
    expect(useDatasetStore.getState().status).toBe('ready');

    mockParse.mockResolvedValueOnce({ kind: 'corrupt', message: '无法读取这个文件。' });
    await useDatasetStore.getState().loadFile(makeFile('坏数据'));

    const state = useDatasetStore.getState();
    expect(state.status).toBe('error');
    expect(state.profile).toBeNull();
    expect(state.issues).toEqual([]);
  });

  it('解析抛异常时落到 error，不把界面永远卡在解析中', async () => {
    mockParse.mockRejectedValue(new Error('意外错误'));

    await useDatasetStore.getState().loadFile(makeFile('a\n1'));

    const state = useDatasetStore.getState();
    expect(state.status).toBe('error');
    expect(state.error).toContain('意外错误');
  });

  it('reset 清空全部状态', async () => {
    mockParse.mockResolvedValue(okResult());
    await useDatasetStore.getState().loadFile(makeFile('年龄\n20\n30'));

    useDatasetStore.getState().reset();

    const state = useDatasetStore.getState();
    expect(state.status).toBe('idle');
    expect(state.parseResult).toBeNull();
  });

  it('把文件读成 ArrayBuffer 再交给解析层', async () => {
    mockParse.mockResolvedValue(okResult());

    await useDatasetStore.getState().loadFile(makeFile('年龄\n20\n30'));

    const call = mockParse.mock.calls[0]?.[0];
    expect(call?.fileName).toBe('a.csv');
    expect(new TextDecoder().decode(call?.buffer)).toBe('年龄\n20\n30');
  });

  it('文件超过体积上限时直接报错，不读取也不交给解析层', async () => {
    // 关键在「不读取」：读完之后再检查等于没有保护，几百 MB 的文件
    // 会先把内存吃掉，与体积上限的初衷相反
    const huge = makeFile('x', 'huge.csv');
    Object.defineProperty(huge, 'size', { value: 999 * 1024 * 1024 });

    await useDatasetStore.getState().loadFile(huge);

    const state = useDatasetStore.getState();
    expect(state.status).toBe('error');
    expect(state.error).toContain('50');
    expect(mockParse).not.toHaveBeenCalled();
  });

  it('解析成功后把数据写进本地暂存，刷新才有得恢复', async () => {
    mockParse.mockResolvedValue(okResult());

    await useDatasetStore.getState().loadFile(makeFile('年龄\n20\n30'));

    expect(mockCache.save).toHaveBeenCalledTimes(1);
    expect(mockCache.save.mock.calls[0]?.[0]).toEqual(okResult());
  });

  it('reset 会连本地暂存一起清掉 —— 否则刷新之后被放弃的数据又回来了', async () => {
    // beforeEach 自己也 reset 过一次，先清掉那次记录，只看本次
    mockCache.clear.mockClear();

    await useDatasetStore.getState().reset();

    expect(mockCache.clear).toHaveBeenCalledTimes(1);
  });
});

describe('datasetStore 恢复上次的数据', () => {
  beforeEach(() => {
    resetDatasetStoreForTest();
    mockParse.mockReset();
    mockCache.save.mockReset().mockResolvedValue(undefined);
    mockCache.load.mockReset().mockResolvedValue(null);
    mockCache.clear.mockReset().mockResolvedValue(undefined);
    useDatasetStore.getState().reset();
    mockCache.clear.mockReset();
  });

  it('恢复上次的数据：进入 ready、重算画像与问题、并标出恢复时间', async () => {
    // 用一份**确实有问题**的数据：否则「问题清单被重算了」这条断言会因为
    // 「本来就没问题」而通过，等于什么都没验
    const withProblems: ParseResult = {
      dataset: {
        rowCount: 2,
        columns: [
          { name: '年龄', values: [20, null] },
          { name: '年龄', values: [30, 40] },
        ],
      },
      meta: { fileName: '重复列.csv', fileSize: 20, format: 'csv', truncated: false, warnings: [] },
    };
    mockCache.load.mockResolvedValue({
      parseResult: withProblems,
      savedAt: '2026-10-17T08:00:00.000Z',
    });

    await useDatasetStore.getState().restoreLastDataset();

    const state = useDatasetStore.getState();
    expect(state.status).toBe('ready');
    expect(state.parseResult?.meta.fileName).toBe('重复列.csv');
    // 画像与问题清单没被存下来，必须重算 —— 存两份就会有两个真相
    expect(state.profile?.columns).toHaveLength(2);
    expect(state.issues.length).toBeGreaterThan(0);
    expect(state.restored).toEqual({ savedAt: '2026-10-17T08:00:00.000Z' });
    // 恢复不该反过来再写一次盘
    expect(mockCache.save).not.toHaveBeenCalled();
  });

  it('缓存为空时什么也不做，界面停在 idle', async () => {
    mockCache.load.mockResolvedValue(null);

    await useDatasetStore.getState().restoreLastDataset();

    const state = useDatasetStore.getState();
    expect(state.status).toBe('idle');
    expect(state.restored).toBeNull();
  });

  it('只尝试恢复一次 —— 多个页面挂载不该反复读盘', async () => {
    mockCache.load.mockResolvedValue(null);

    await useDatasetStore.getState().restoreLastDataset();
    await useDatasetStore.getState().restoreLastDataset();

    expect(mockCache.load).toHaveBeenCalledTimes(1);
  });

  it('用户已经开始上传新数据时不覆盖它', async () => {
    mockParse.mockResolvedValue(okResult());
    await useDatasetStore.getState().loadFile(makeFile('年龄\n1\n2'));
    mockCache.load.mockResolvedValue({
      parseResult: {
        dataset: { rowCount: 1, columns: [{ name: '旧列', values: [1] }] },
        meta: { fileName: '旧.csv', fileSize: 3, format: 'csv', truncated: false, warnings: [] },
      },
      savedAt: '2026-10-16T08:00:00.000Z',
    });

    await useDatasetStore.getState().restoreLastDataset();

    const state = useDatasetStore.getState();
    expect(state.parseResult?.meta.fileName).toBe('a.csv');
    expect(state.restored).toBeNull();
  });

  it('读缓存失败时给出可读提示，且不把主流程拖进 error', async () => {
    mockCache.load.mockRejectedValue(new Error('浏览器本地存储被其他标签页占用'));

    await useDatasetStore.getState().restoreLastDataset();

    const state = useDatasetStore.getState();
    expect(state.status).toBe('idle');
    expect(state.cacheNote).toContain('其他标签页');
  });

  it('写缓存失败时说清「刷新会丢」，而不是悄悄什么都不发生', async () => {
    mockParse.mockResolvedValue(okResult());
    mockCache.save.mockRejectedValue(new Error('存储空间不足'));

    await useDatasetStore.getState().loadFile(makeFile('年龄\n20\n30'));

    const state = useDatasetStore.getState();
    // 数据本身仍然是可用的，只有「刷新后还在」这件事没做到
    expect(state.status).toBe('ready');
    expect(state.cacheNote).toContain('刷新');
    expect(state.cacheNote).toContain('存储空间不足');
  });
});
