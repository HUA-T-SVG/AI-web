import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  profileDataset,
  runAllChecks,
  type ColumnData,
  type Dataset,
  type QualityIssue,
} from '@/core';
import type { ParseResult, ParseError } from '@/parser/types';

// 控制解析结果：node 环境里没有真实 Worker，而且状态机的测试不该依赖解析细节
vi.mock('@/parser/workerClient', () => ({ parseInWorker: vi.fn() }));
// 暂存后端换成内存假实现：node 环境没有 IndexedDB，且这些用例要控制「缓存里有什么」
vi.mock('@/ui/lib/datasetCache', () => ({
  datasetCache: { save: vi.fn(), load: vi.fn(), clear: vi.fn() },
}));
// 检查与画像换成本进程的默认实现，但保留「它可以挂起、可以失败」这两种可编程形态
vi.mock('@/ui/lib/workerChecks', () => ({
  profileInWorker: vi.fn(),
  runChecksInWorker: vi.fn(),
  isChecksWorkerAvailable: vi.fn(() => true),
}));
// 语义归并会去下模型；单测里要的是「它有没有把结果并进同一个清单」，不是模型本身
vi.mock('@/ui/lib/synonymBridge', () => ({ runSynonymCheck: vi.fn() }));

import { parseInWorker } from '@/parser/workerClient';
import { datasetCache } from '@/ui/lib/datasetCache';
import { profileInWorker, isChecksWorkerAvailable, runChecksInWorker } from '@/ui/lib/workerChecks';
import { runSynonymCheck } from '@/ui/lib/synonymBridge';
import { useDatasetStore, resetDatasetStoreForTest } from './datasetStore';
import { useScenarioStore } from './scenarioStore';

const mockParse = vi.mocked(parseInWorker);
const mockChecks = vi.mocked(runChecksInWorker);
const mockProfile = vi.mocked(profileInWorker);
const mockWorkerAvailable = vi.mocked(isChecksWorkerAvailable);
const mockSynonym = vi.mocked(runSynonymCheck);
const mockCache = {
  save: vi.mocked(datasetCache.save),
  load: vi.mocked(datasetCache.load),
  clear: vi.mocked(datasetCache.clear),
};

/** 检查的默认实现：真的跑一遍 core，这样「问题清单有没有重算」才是真的被验到 */
function installRealChecks(): void {
  mockChecks
    .mockReset()
    .mockImplementation(async (dataset, options) => runAllChecks(dataset, options));
}

/** 画像的默认实现同上：调用真实的 core 计算，保留「挂起 / 失败」可编程 */
function installRealProfile(): void {
  mockProfile.mockReset().mockImplementation(async (dataset) => profileDataset(dataset));
}

function resetStoreMocks(): void {
  resetDatasetStoreForTest();
  mockParse.mockReset();
  installRealChecks();
  installRealProfile();
  mockWorkerAvailable.mockReset().mockReturnValue(true);
  mockSynonym.mockReset().mockResolvedValue({ issues: [], degraded: false, embeddedKeyCount: 0 });
  mockCache.save.mockReset().mockResolvedValue(undefined);
  mockCache.load.mockReset().mockResolvedValue(null);
  mockCache.clear.mockReset().mockResolvedValue(undefined);
  useDatasetStore.getState().reset();
  useScenarioStore.getState().reset();
}

function makeFile(content: string, name = 'a.csv'): File {
  return new File([content], name, { type: 'text/csv' });
}

function okResult(): ParseResult {
  return {
    dataset: { rowCount: 2, columns: [{ name: '年龄', values: [20, 30] }] },
    meta: { fileName: 'a.csv', fileSize: 10, format: 'csv', truncated: false, warnings: [] },
  };
}

/** 示例入口用：meta.fileName 必须与场景登记的文件名一致（store 会据此防并发串数据） */
function sampleResult(fileName: string): ParseResult {
  const base = okResult();
  return { ...base, meta: { ...base.meta, fileName } };
}

function makeIssue(
  overrides: Partial<QualityIssue> & Pick<QualityIssue, 'id' | 'checkId'>,
): QualityIssue {
  return {
    severity: 'medium',
    title: '问题',
    description: '说明',
    evidence: { columns: ['年龄'], statistics: {} },
    confidence: 1,
    ...overrides,
  };
}

describe('datasetStore', () => {
  beforeEach(() => {
    resetStoreMocks();
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
    resetStoreMocks();
    // beforeEach 自己也会 reset 一次，先清掉那次记录，只看用例里的调用
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
      dataVersion: 4,
      // 示例数据刷新后仍然要是示例：标记必须跟着缓存回来
      isSample: true,
    });

    await useDatasetStore.getState().restoreLastDataset();

    const state = useDatasetStore.getState();
    expect(state.status).toBe('ready');
    expect(state.parseResult?.meta.fileName).toBe('重复列.csv');
    // 画像与问题清单没被存下来，必须重算 —— 存两份就会有两个真相
    expect(state.profile?.columns).toHaveLength(2);
    expect(state.issues.length).toBeGreaterThan(0);
    expect(state.restored).toEqual({ savedAt: '2026-10-17T08:00:00.000Z' });
    // 恢复沿用落盘时的版本，而不是凭空 +1：同一份数据刷新后版本必须稳定，
    // 否则「旧结论属于哪一版」在刷新前后会指到不同版本
    expect(state.dataVersion).toBe(4);
    expect(state.checksVersion).toBe(4);
    expect(state.isSample).toBe(true);
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
      dataVersion: 1,
      isSample: false,
    });

    await useDatasetStore.getState().restoreLastDataset();

    const state = useDatasetStore.getState();
    expect(state.parseResult?.meta.fileName).toBe('a.csv');
    expect(state.restored).toBeNull();
  });

  it('读缓存失败时给出可读提示、说明接下来怎么办，且不把主流程拖进 error', async () => {
    mockCache.load.mockRejectedValue(new Error('浏览器本地存储被其他标签页占用'));

    await useDatasetStore.getState().restoreLastDataset();

    const state = useDatasetStore.getState();
    expect(state.status).toBe('idle');
    expect(state.cacheNote).toContain('其他标签页');
    // 用户此刻看到的是空态，必须知道下一步是重新上传，而不是以为应用坏了
    expect(state.cacheNote).toContain('重新上传');
  });

  it('恢复过程中出错时被接住并提示，不留下未处理的 rejection', async () => {
    // 结构不合法的 ParseResult：读缓存那层被 mock 掉了，于是错误会发生在
    // adoptDataset 的画像计算里 —— 那正是要接住的位置
    mockCache.load.mockResolvedValue({
      parseResult: {
        // 刻意构造一份类型上不合法、运行时会炸的数据：读缓存那层被 mock 掉了，
        // 于是错误会发生在 adoptDataset 的画像计算里 —— 那正是要接住的位置
        dataset: { rowCount: 1, columns: null as unknown as ColumnData[] },
        meta: { fileName: 'x.csv', fileSize: 1, format: 'csv', truncated: false, warnings: [] },
      },
      savedAt: '2026-10-17T08:00:00.000Z',
      dataVersion: 1,
      isSample: false,
    });

    await expect(useDatasetStore.getState().restoreLastDataset()).resolves.toBeUndefined();

    const state = useDatasetStore.getState();
    expect(state.cacheNote).toContain('恢复上次数据时出错');
    expect(state.restored).toBeNull();
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

  it('预览出现之前必须已经落盘 —— 关掉「看得见但没存住」的窗口（T9）', async () => {
    mockParse.mockResolvedValue(okResult());
    let releaseSave!: () => void;
    mockCache.save.mockReset().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          releaseSave = resolve;
        }),
    );

    const pending = useDatasetStore.getState().loadFile(makeFile('年龄\n20\n30'));

    await vi.waitFor(() => {
      expect(mockCache.save).toHaveBeenCalledTimes(1);
    });
    // 落盘还没完成：界面必须还停在解析态，不能先给出预览
    const during = useDatasetStore.getState();
    expect(during.status).toBe('parsing');
    expect(during.parseResult).toBeNull();

    releaseSave();
    await pending;
    expect(useDatasetStore.getState().status).toBe('ready');
    expect(useDatasetStore.getState().parseResult).not.toBeNull();
  });

  it('随时可以清除本机暂存 —— 只清浏览器里的副本，不动内存里这份数据', async () => {
    mockParse.mockResolvedValue(okResult());
    await useDatasetStore.getState().loadFile(makeFile('年龄\n20\n30'));
    mockCache.clear.mockClear();

    await useDatasetStore.getState().clearLocalCache();

    expect(mockCache.clear).toHaveBeenCalledTimes(1);
    const state = useDatasetStore.getState();
    expect(state.cacheCleared).toBe(true);
    expect(state.cacheNote).toBeNull();
    // 当前会话照常可用：用户可能只是想把机器交还，然后继续用这份数据
    expect(state.status).toBe('ready');
    expect(state.parseResult).not.toBeNull();
  });

  it('清除失败时说清「数据还在机器上」，而不是假装清掉了', async () => {
    mockParse.mockResolvedValue(okResult());
    await useDatasetStore.getState().loadFile(makeFile('年龄\n20\n30'));
    mockCache.clear.mockRejectedValue(new Error('存储被占用'));

    await useDatasetStore.getState().clearLocalCache();

    const state = useDatasetStore.getState();
    // 静默失败最糟：用户以为清掉了，数据其实还在公用机上
    expect(state.cacheCleared).toBe(false);
    expect(state.cacheNote).toContain('没能清掉本机暂存数据');
    expect(state.cacheNote).toContain('存储被占用');
  });
});

describe('datasetStore 的异步检查', () => {
  beforeEach(() => {
    resetStoreMocks();
  });

  it('检查还没回来时，不把空清单当成「这份数据没问题」', async () => {
    mockParse.mockResolvedValue(okResult());
    let release!: (issues: QualityIssue[]) => void;
    mockChecks.mockReset().mockImplementation(
      () =>
        new Promise<QualityIssue[]>((resolve) => {
          release = resolve;
        }),
    );

    const pending = useDatasetStore.getState().loadFile(makeFile('年龄\n20\n30'));
    await vi.waitFor(() => {
      expect(useDatasetStore.getState().status).toBe('ready');
    });

    // 数据可用、画像已算，但结论还没出来 —— 界面必须能区分这两件事
    const running = useDatasetStore.getState();
    expect(running.checksStatus).toBe('running');
    expect(running.issues).toEqual([]);
    expect(running.profile).not.toBeNull();

    release([makeIssue({ id: 'issue-1', checkId: 'missing', severity: 'high', title: '缺失值' })]);
    await pending;

    const done = useDatasetStore.getState();
    expect(done.checksStatus).toBe('done');
    expect(done.issues.map((issue) => issue.checkId)).toEqual(['missing']);
  });

  it('检查失败时说清原因，而不是显示「没有发现质量问题」', async () => {
    mockParse.mockResolvedValue(okResult());
    mockChecks.mockReset().mockRejectedValue(new Error('Worker 返回的消息无法反序列化'));

    await useDatasetStore.getState().loadFile(makeFile('年龄\n20\n30'));

    const state = useDatasetStore.getState();
    expect(state.checksStatus).toBe('failed');
    expect(state.checksNote).toContain('无法反序列化');
    // 检查失败不该把整份数据作废：画像与预览仍然有效
    expect(state.status).toBe('ready');
    expect(state.profile).not.toBeNull();
    // 不要断言「清单是空的」—— 语义归并可能先回来，那时这句话就是假的
    expect(state.checksNote).not.toContain('清单是空的');
  });

  it('换一份数据时，上一份的检查状态一并复位', async () => {
    mockParse.mockResolvedValue(okResult());
    mockChecks.mockReset().mockRejectedValue(new Error('上一次失败了'));
    await useDatasetStore.getState().loadFile(makeFile('年龄\n1\n2'));
    expect(useDatasetStore.getState().checksStatus).toBe('failed');

    // 第二次检查挂起，观察解析/就位期间的状态：不能还挂着上一份的 failed
    let release!: (issues: QualityIssue[]) => void;
    mockChecks.mockImplementation(
      () =>
        new Promise<QualityIssue[]>((resolve) => {
          release = resolve;
        }),
    );
    const pending = useDatasetStore.getState().loadFile(makeFile('年龄\n3\n4'));
    await vi.waitFor(() => {
      expect(useDatasetStore.getState().status).toBe('ready');
    });

    const running = useDatasetStore.getState();
    expect(running.checksStatus).toBe('running');
    expect(running.checksNote).toBeNull();

    release([]);
    await pending;
  });

  it('Worker 不可用时把「跑在后台线程」换成实话', async () => {
    mockParse.mockResolvedValue(okResult());
    mockWorkerAvailable.mockReturnValue(false);
    mockChecks.mockReset().mockResolvedValue([]);

    await useDatasetStore.getState().loadFile(makeFile('年龄\n20\n30'));

    // 界面文案靠这个字段决定说不说「后台线程」—— 降级了还那样说就是假话
    expect(useDatasetStore.getState().checksOffThread).toBe(false);
  });

  it('检查结果与语义归并的结果互不覆盖 —— 两边都往同一个清单里追加', async () => {
    mockParse.mockResolvedValue(okResult());
    mockChecks
      .mockReset()
      .mockResolvedValue([
        makeIssue({ id: 'check-1', checkId: 'missing', severity: 'high', title: '缺失值' }),
      ]);
    mockSynonym.mockResolvedValue({
      issues: [makeIssue({ id: 'semantic-1', checkId: 'category-synonyms' })],
      degraded: false,
      embeddedKeyCount: 3,
    });

    await useDatasetStore.getState().loadFile(makeFile('年龄\n20\n30'));
    // 语义检查是 fire-and-forget，等它把结果并进来
    await vi.waitFor(() => {
      expect(useDatasetStore.getState().synonymStatus).toBe('ready');
    });

    // 这条是本次改动的重点：两边都往 issues 追加，任何一方用整体赋值
    // 都会把另一方刚写进去的结果冲掉
    const ids = useDatasetStore
      .getState()
      .issues.map((issue) => issue.id)
      .sort();
    expect(ids).toEqual(['check-1', 'semantic-1']);
  });
});

/**
 * 画像搬进 Worker（T1）之后新增的中态。
 *
 * 它要回答的是「解析完了、画像还没算完」那段界面该显示什么 —— 以前画像在主线程
 * 同步算，这段窗口根本不存在（它被冻住了），所以没有对应的状态可复用。
 */
describe('datasetStore 的画像计算（Worker 化之后）', () => {
  beforeEach(() => {
    resetStoreMocks();
  });

  it('画像没回来时停在 profiling，不提前进入 ready', async () => {
    mockParse.mockResolvedValue(okResult());
    let release!: (profile: ReturnType<typeof profileDataset>) => void;
    mockProfile.mockReset().mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );

    const pending = useDatasetStore.getState().loadFile(makeFile('年龄\n20\n30'));

    await vi.waitFor(() => {
      expect(useDatasetStore.getState().status).toBe('profiling');
    });
    // 「ready 但画像为空」是最糟的组合：/check 会把它渲染成「还没有导入数据」
    const profiling = useDatasetStore.getState();
    expect(profiling.profile).toBeNull();
    expect(profiling.checksStatus).toBe('idle');

    release(profileDataset(okResult().dataset));
    await pending;

    const ready = useDatasetStore.getState();
    expect(ready.status).toBe('ready');
    expect(ready.profile?.columns).toHaveLength(1);
  });

  it('画像算不出来时说清是画像这一环，而不是「这个文件读不了」', async () => {
    mockParse.mockResolvedValue(okResult());
    mockProfile.mockReset().mockRejectedValue(new Error('Worker 返回的列画像结果不完整'));

    await useDatasetStore.getState().loadFile(makeFile('年龄\n20\n30'));

    const state = useDatasetStore.getState();
    expect(state.status).toBe('error');
    expect(state.error).toContain('列画像');
    expect(state.error).toContain('不完整');
  });

  it('解析阶段不会去调画像 —— 两者别串成一步', async () => {
    mockParse.mockResolvedValue(okResult());
    let releaseParse!: (result: ParseResult) => void;
    mockParse.mockReset().mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseParse = resolve;
        }),
    );

    void useDatasetStore.getState().loadFile(makeFile('年龄\n20\n30'));
    await vi.waitFor(() => {
      expect(mockParse).toHaveBeenCalledTimes(1);
    });
    expect(useDatasetStore.getState().status).toBe('parsing');
    expect(mockProfile).not.toHaveBeenCalled();

    releaseParse(okResult());
    await vi.waitFor(() => {
      expect(useDatasetStore.getState().status).toBe('ready');
    });
  });
});

/**
 * 「旧结论按数据版本失效」的地基。
 *
 * 版本号不是装饰：检查、AI 分析、审阅都要记录自己基于哪一版；数据一变，
 * 旧版本的结果必须立刻从当前位置撤下，而不是等用户自己发现数字对不上。
 */
describe('datasetStore 的数据版本与清洗后重检', () => {
  beforeEach(() => {
    resetStoreMocks();
  });

  it('载入文件后版本 +1，检查结论绑定同一版本', async () => {
    mockParse.mockResolvedValue(okResult());

    await useDatasetStore.getState().loadFile(makeFile('年龄\n20\n30'));

    const state = useDatasetStore.getState();
    expect(state.dataVersion).toBe(1);
    expect(state.checksVersion).toBe(1);
    // 工作数据一开始就是导入数据；原始数据另存在 parseResult 里
    expect(state.workingDataset).toEqual(okResult().dataset);
    // 版本随缓存一起落盘
    expect(mockCache.save).toHaveBeenCalledWith(okResult(), undefined, 1, false);
  });

  it('清洗后同步工作数据：版本 +1、旧结论立刻撤下、重算完成后再绑定新版本', async () => {
    mockParse.mockResolvedValue(okResult());
    await useDatasetStore.getState().loadFile(makeFile('年龄\n20\n30'));

    const cleaned: Dataset = { rowCount: 1, columns: [{ name: '年龄', values: [20] }] };
    const version = useDatasetStore.getState().syncWorkingDataset(cleaned);

    // 同步返回：审阅页要立刻用它标记「已执行」，不能等几秒的检查
    expect(version).toBe(2);
    const running = useDatasetStore.getState();
    expect(running.dataVersion).toBe(2);
    expect(running.workingDataset).toEqual(cleaned);
    expect(running.checksStatus).toBe('running');
    // 旧清单不能留着冒充新结论
    expect(running.checksVersion).toBeNull();
    expect(running.issues).toEqual([]);

    await vi.waitFor(() => {
      expect(useDatasetStore.getState().checksStatus).toBe('done');
    });
    const done = useDatasetStore.getState();
    expect(done.checksVersion).toBe(2);
    // 画像是按清洗后的数据重算的，不是沿用原始数据的
    expect(done.workingProfile?.rowCount).toBe(1);
    // 原始数据没被覆盖：导出指纹仍要算在它上面
    expect(done.parseResult?.dataset.rowCount).toBe(2);
  });

  it('重试检查不改变版本号 —— 同一份数据重试不是一次数据变更', async () => {
    mockParse.mockResolvedValue(okResult());
    await useDatasetStore.getState().loadFile(makeFile('年龄\n20\n30'));

    await useDatasetStore.getState().rerunChecks();

    await vi.waitFor(() => {
      expect(useDatasetStore.getState().checksStatus).toBe('done');
    });
    expect(useDatasetStore.getState().dataVersion).toBe(1);
    expect(useDatasetStore.getState().checksVersion).toBe(1);
  });

  it('检查失败时 checksVersion 保持 null，不把旧结论冒充新结论', async () => {
    mockParse.mockResolvedValue(okResult());
    await useDatasetStore.getState().loadFile(makeFile('年龄\n20\n30'));

    mockChecks.mockReset().mockRejectedValue(new Error('Worker 返回的结果不完整'));
    useDatasetStore.getState().syncWorkingDataset({
      rowCount: 1,
      columns: [{ name: '年龄', values: [20] }],
    });

    await vi.waitFor(() => {
      expect(useDatasetStore.getState().checksStatus).toBe('failed');
    });
    const state = useDatasetStore.getState();
    expect(state.checksVersion).toBeNull();
    expect(state.checksNote).toContain('重新检查');
  });
});

describe('datasetStore 的示例数据入口', () => {
  beforeEach(() => {
    resetStoreMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('体验示例走同一条解析路径，并标记为示例数据', async () => {
    mockParse.mockResolvedValue(sampleResult('示例-科研问卷.csv'));
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('学号,年龄\n001,20', { status: 200 })),
    );

    await useDatasetStore.getState().loadSample();

    const state = useDatasetStore.getState();
    expect(state.status).toBe('ready');
    expect(state.isSample).toBe(true);
    // 示例也必须经过真正的解析器：文件名要带出来，不能另造一份数据
    expect(mockParse).toHaveBeenCalledWith(
      expect.objectContaining({ fileName: '示例-科研问卷.csv' }),
    );
    // 标记要落盘：先写缓存，再把 isSample 置到内存
    expect(mockCache.save).toHaveBeenLastCalledWith(
      sampleResult('示例-科研问卷.csv'),
      undefined,
      1,
      true,
    );
  });

  it('手动再上传文件时清掉示例标记', async () => {
    mockParse.mockResolvedValue(sampleResult('示例-科研问卷.csv'));
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('学号,年龄\n001,20', { status: 200 })),
    );
    await useDatasetStore.getState().loadSample();
    expect(useDatasetStore.getState().isSample).toBe(true);

    await useDatasetStore.getState().loadFile(makeFile('年龄\n20\n30'));

    expect(useDatasetStore.getState().isSample).toBe(false);
  });

  it('示例文件请求失败时抛错，界面才能说出发生了什么', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 404 })));

    await expect(useDatasetStore.getState().loadSample()).rejects.toThrow('404');
    expect(useDatasetStore.getState().status).toBe('idle');
    expect(useDatasetStore.getState().isSample).toBe(false);
  });

  it('按场景加载示例：请求对应 URL，文件名与场景一起记录', async () => {
    mockParse.mockResolvedValue(sampleResult('示例-实验数据.csv'));
    const fetchMock = vi.fn().mockResolvedValue(new Response('学号,年龄\n001,20', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await useDatasetStore.getState().loadSample('experiment');

    expect(fetchMock).toHaveBeenCalledWith('/sample/experiment-data.csv');
    expect(mockParse).toHaveBeenCalledWith(expect.objectContaining({ fileName: '示例-实验数据.csv' }));
    expect(useScenarioStore.getState().scenarioId).toBe('experiment');
  });

  it('换文件时场景被清空，避免上一份数据的重点套到新数据上', async () => {
    mockParse.mockResolvedValue(sampleResult('示例-教育数据.csv'));
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('学号,年龄\n001,20', { status: 200 })),
    );
    await useDatasetStore.getState().loadSample('education');
    expect(useScenarioStore.getState().scenarioId).toBe('education');

    // 第二份数据用不同的文件名：store 按解析结果的 meta.fileName 判归属，
    // 若两份 mock 都叫 a.csv，相当于「同名重传」，场景本就该保留
    mockParse.mockResolvedValue({
      ...okResult(),
      meta: { ...okResult().meta, fileName: 'b.csv' },
    });
    await useDatasetStore.getState().loadFile(makeFile('年龄\n20\n30', 'b.csv'));

    expect(useScenarioStore.getState().scenarioId).toBeNull();
  });
});
