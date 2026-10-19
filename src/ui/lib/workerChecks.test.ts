import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  profileDataset,
  runAllChecks,
  type Dataset,
  type QualityIssue,
  type RunChecksOptions,
} from '@/core';
import { handleWorkerRequest, type WorkerRequest } from '@/worker/checks.worker';
import {
  isChecksWorkerAvailable,
  profileInWorker,
  resetChecksWorkerForTest,
  runChecksInWorker,
} from './workerChecks';

/**
 * 「搬进 Worker 的必须是同一份 core」这件事的验收。
 *
 * Plan 4 的 Review Focus 第 6 条：性能优化不得改变结果。所以这里先断言**等价**，
 * 再谈把计算挪走 —— 否则「更快了」随时可能是「算得不一样了」。
 *
 * 等价的口径：除 `id` 之外逐字段相等。`id` 由 `createIssueId` 的模块级计数器生成，
 * 同一次运行里每创建一条就自增，所以两次运行必然不同；把它排除掉之后比的是
 * **结论本身**（哪一列、什么严重度、什么证据、什么建议）。
 */

const DATASET_DIR = resolve(process.cwd(), 'knowledge/eval/dataset');

/** 用评测集那份真实脏数据：比手搓几条更能覆盖各检查项的分支 */
function loadMessy(): Dataset {
  const lines = readFileSync(resolve(DATASET_DIR, 'messy-eval.csv'), 'utf8').trimEnd().split('\n');
  const columns = lines[0]!.split(',');
  const rows = lines.slice(1).map((line) => line.split(','));
  return {
    rowCount: rows.length,
    columns: columns.map((name, index) => ({
      name,
      values: rows.map((row) => {
        const cell = row[index] ?? '';
        return cell === '' ? null : cell;
      }),
    })),
  };
}

function withoutIds(issues: QualityIssue[]): Omit<QualityIssue, 'id'>[] {
  return issues.map(({ id, ...rest }) => rest);
}

/** 事件监听的公共部分，供两个假 Worker 复用 */
class FakeWorkerBase {
  terminate = vi.fn();
  protected listeners = new Map<string, ((event: unknown) => void)[]>();

  addEventListener(type: string, listener: (event: unknown) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  removeEventListener(type: string, listener: (event: unknown) => void): void {
    this.listeners.set(
      type,
      (this.listeners.get(type) ?? []).filter((item) => item !== listener),
    );
  }

  emit(type: string, payload: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) listener(payload);
  }
}

/**
 * 一个**真的干活**的假 Worker：`postMessage` 时调用真正的 Worker 端处理函数
 * `handleWorkerRequest`，再把结果异步投递回去。
 *
 * 为什么不写成直接返回固定结果的桩：那样只测了客户端的分发代码，而这里要证明的
 * 恰恰是「Worker 那一侧算出来的东西和主线程一样」—— 桩无论如何都做不到这一点。
 */
class HandlerWorker extends FakeWorkerBase {
  static lastCreated: HandlerWorker | null = null;
  static created = 0;

  readonly posted: WorkerRequest[] = [];

  constructor() {
    super();
    HandlerWorker.lastCreated = this;
    HandlerWorker.created += 1;
  }

  postMessage(request: WorkerRequest): void {
    this.posted.push(request);
    // 真实 Worker 的消息是异步跨线程投递的，用 setTimeout 复现那个时序：
    // 同步回复会掩盖「结果还没回来就用了」这类问题
    // **并且过一遍 structuredClone**：真实的 postMessage 就是结构化克隆，直接传同一个
    // 引用会让「不可克隆的载荷」与「检查就地改了 dataset」这两类不等价永远测不出来
    setTimeout(() => {
      this.emit('message', { data: handleWorkerRequest(structuredClone(request)) });
    }, 0);
  }
}

/** 返回一条不合协议的消息：只有 id，没有结果 —— 模拟旧版本 chunk 或漏带字段 */
class MuteProtocolWorker extends FakeWorkerBase {
  postMessage(request: WorkerRequest): void {
    setTimeout(() => {
      this.emit('message', { data: { id: request.id } });
    }, 0);
  }
}

/** 构造成功但永远不回消息 —— 复现「Worker 脚本加载失败」那类运行期故障 */
class SilentWorker extends FakeWorkerBase {
  postMessage(): void {
    // 什么都不做
  }
}

function stubWorker(WorkerClass: new () => FakeWorkerBase): void {
  vi.stubGlobal(
    'Worker',
    class {
      constructor() {
        return new WorkerClass() as unknown as Worker;
      }
    },
  );
}

describe('runChecksInWorker', () => {
  beforeEach(() => {
    resetChecksWorkerForTest();
    HandlerWorker.lastCreated = null;
    HandlerWorker.created = 0;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    resetChecksWorkerForTest();
  });

  it('Worker 里算出来的结果与主线程 runAllChecks 逐字段一致（id 除外）', async () => {
    stubWorker(HandlerWorker);
    const dataset = loadMessy();

    const direct = runAllChecks(dataset);
    const fromWorker = await runChecksInWorker(dataset);

    // 空对空也算「相等」，所以先确认这份数据确实检出了问题
    expect(direct.length).toBeGreaterThan(0);
    expect(withoutIds(fromWorker)).toEqual(withoutIds(direct));
    // 而且确实走的是 Worker
    expect(HandlerWorker.lastCreated?.posted).toHaveLength(1);
  });

  it('只启用部分检查时同样一致 —— options 必须原样传进 Worker', async () => {
    stubWorker(HandlerWorker);
    const dataset = loadMessy();
    const options: RunChecksOptions = { enabled: ['missing', 'type-consistency'] };

    const fromWorker = await runChecksInWorker(dataset, options);

    expect(withoutIds(fromWorker)).toEqual(withoutIds(runAllChecks(dataset, options)));
    // 只看这两项：结果里不该混进别的检查项
    expect(new Set(fromWorker.map((issue) => issue.checkId))).toEqual(
      new Set(['missing', 'type-consistency']),
    );
  });

  it('Worker 构造失败时降级到主线程，且**告警**，而不是悄悄在主线程冻住界面', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const failing = vi.fn(() => {
      throw new Error('这个打包器不支持 Worker');
    });
    vi.stubGlobal('Worker', failing);
    const dataset = loadMessy();

    const issues = await runChecksInWorker(dataset);
    void runChecksInWorker(dataset);

    expect(withoutIds(issues)).toEqual(withoutIds(runAllChecks(dataset)));
    // 已知不可用就不该反复重试：每次重试都伴随一次异常抛出
    expect(failing).toHaveBeenCalledTimes(1);
    // 界面文案靠 `isChecksWorkerAvailable()` 决定要不要说「在后台线程」，
    // 而这条告警是给排查的人看的第二道证据 —— 静默降级会让「后台线程」的承诺变成假话
    expect(warn.mock.calls.some((call) => String(call[0]).includes('[checks]'))).toBe(true);
    expect(isChecksWorkerAvailable()).toBe(false);
    warn.mockRestore();
  });

  it('Worker 投递 error 事件时降级到主线程，而不是让 Promise 永不 settle', async () => {
    let created: SilentWorker | undefined;
    vi.stubGlobal(
      'Worker',
      class {
        constructor() {
          created = new SilentWorker();
          return created as unknown as Worker;
        }
      },
    );
    const dataset = loadMessy();

    const pending = runChecksInWorker(dataset);
    // 模拟浏览器的 Worker 脚本加载失败
    created?.emit('error', new Error('chunk 加载失败'));

    expect(withoutIds(await pending)).toEqual(withoutIds(runAllChecks(dataset)));
  });

  it('Worker 超时未响应时降级到主线程', async () => {
    stubWorker(SilentWorker);
    const dataset = loadMessy();

    // 假定时器必须在发起请求**之前**装上：请求内部的 setTimeout 用的是当时的时钟
    vi.useFakeTimers();
    const pending = runChecksInWorker(dataset);
    await vi.advanceTimersByTimeAsync(31_000);

    expect(withoutIds(await pending)).toEqual(withoutIds(runAllChecks(dataset)));
  });

  it('Worker 返回的消息缺 issues 时算失败，不当成「0 条问题」', async () => {
    stubWorker(MuteProtocolWorker);
    // 静默按空清单处理会把「不知道」说成「这份数据干净」—— 那是界面最会误导人的一句话
    await expect(runChecksInWorker(loadMessy())).rejects.toThrow(/不完整/);
  });

  it('并发请求里有一个把 Worker 弄挂了，另一个也必须立刻降级，而不是等满超时', async () => {
    let created: SilentWorker | undefined;
    vi.stubGlobal(
      'Worker',
      class {
        constructor() {
          created = new SilentWorker();
          return created as unknown as Worker;
        }
      },
    );
    const first: Dataset = { rowCount: 2, columns: [{ name: '列', values: [1, null] }] };
    const second: Dataset = { rowCount: 1, columns: [{ name: '另一列', values: ['x'] }] };

    const pending = Promise.all([runChecksInWorker(first), runChecksInWorker(second)]);
    await Promise.resolve();
    // 一次 error 事件会同时投递给两个请求的监听器
    created?.emit('error', new Error('chunk 加载失败'));

    // 若没有「一次降级叫醒全部在途请求」，第二个请求会等满 30 秒 —— 这条用例会超时失败
    const [fromFirst, fromSecond] = await pending;
    expect(withoutIds(fromFirst)).toEqual(withoutIds(runAllChecks(first)));
    expect(withoutIds(fromSecond)).toEqual(withoutIds(runAllChecks(second)));
  });

  it('并发请求不会串台：每个请求拿到自己的结果', async () => {
    stubWorker(HandlerWorker);
    const a: Dataset = { rowCount: 2, columns: [{ name: '列', values: [1, null] }] };
    const b: Dataset = { rowCount: 1, columns: [{ name: '另一列', values: ['x'] }] };

    const [fromA, fromB] = await Promise.all([runChecksInWorker(a), runChecksInWorker(b)]);

    expect(withoutIds(fromA)).toEqual(withoutIds(runAllChecks(a)));
    expect(withoutIds(fromB)).toEqual(withoutIds(runAllChecks(b)));
  });

  it('带 extraChecks 时直接在主线程跑 —— 函数过不了 postMessage', async () => {
    stubWorker(HandlerWorker);
    const dataset = loadMessy();
    const options: RunChecksOptions = {
      // extraChecks 的 id 也要写进 enabled，否则会被「只跑这几项」过滤掉
      enabled: ['missing', 'test-only'],
      extraChecks: [
        {
          id: 'test-only',
          title: '测试用检查',
          description: '只在这里存在',
          run: (): QualityIssue[] => [
            {
              id: 'test-only-1',
              checkId: 'test-only',
              severity: 'low',
              title: '测试用问题',
              description: '故意注入的一条',
              evidence: { columns: [], statistics: {} },
              confidence: 1,
            },
          ],
        },
      ],
    };

    const issues = await runChecksInWorker(dataset, options);

    // 悄悄换实现是「同一份 core」这条承诺的裂缝，所以断言它确实没进 Worker
    expect(HandlerWorker.lastCreated).toBeNull();
    expect(issues.some((issue) => issue.checkId === 'test-only')).toBe(true);
  });
});

/**
 * 列画像（T1）走的是同一个 Worker、同一套失败处理，区别只在请求与结果形状。
 * 所以这里不重复四条降级路径，只验两件它独有的事：**结果等价**、**协议残缺不能当空画像**。
 */
describe('profileInWorker', () => {
  beforeEach(() => {
    resetChecksWorkerForTest();
    HandlerWorker.lastCreated = null;
    HandlerWorker.created = 0;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    resetChecksWorkerForTest();
  });

  it('Worker 里算出来的画像与主线程 profileDataset 逐字段一致', async () => {
    stubWorker(HandlerWorker);
    const dataset = loadMessy();

    const direct = profileDataset(dataset);
    const fromWorker = await profileInWorker(dataset);

    expect(fromWorker).toEqual(direct);
    // 而且确实发的是画像请求（同一个实例里两种作业共用通道，kind 必须对得上）
    expect(HandlerWorker.lastCreated?.posted.map((request) => request.kind)).toEqual(['profile']);
  });

  it('Worker 返回的消息缺 profile 时算失败，不当成「0 列」', async () => {
    stubWorker(MuteProtocolWorker);
    // 空画像在界面上会显示成「0 列」，与「这份数据真的没有列」长得一样
    await expect(profileInWorker(loadMessy())).rejects.toThrow(/不完整/);
  });

  it('Worker 构造失败时画像也降级到主线程，并告警', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal(
      'Worker',
      vi.fn(() => {
        throw new Error('这个打包器不支持 Worker');
      }),
    );
    const dataset = loadMessy();

    const profile = await profileInWorker(dataset);

    expect(profile).toEqual(profileDataset(dataset));
    expect(warn.mock.calls.some((call) => String(call[0]).includes('[checks]'))).toBe(true);
    warn.mockRestore();
  });
});
