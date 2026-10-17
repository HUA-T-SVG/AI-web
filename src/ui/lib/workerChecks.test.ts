import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runAllChecks, type Dataset, type QualityIssue, type RunChecksOptions } from '@/core';
import { handleChecksRequest, type ChecksRequest } from '@/worker/checks.worker';
import { resetChecksWorkerForTest, runChecksInWorker } from './workerChecks';

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
 * `handleChecksRequest`，再把结果异步投递回去。
 *
 * 为什么不写成直接返回固定结果的桩：那样只测了客户端的分发代码，而这里要证明的
 * 恰恰是「Worker 那一侧算出来的东西和主线程一样」—— 桩无论如何都做不到这一点。
 */
class HandlerWorker extends FakeWorkerBase {
  static lastCreated: HandlerWorker | null = null;
  static created = 0;

  readonly posted: ChecksRequest[] = [];

  constructor() {
    super();
    HandlerWorker.lastCreated = this;
    HandlerWorker.created += 1;
  }

  postMessage(request: ChecksRequest): void {
    this.posted.push(request);
    // 真实 Worker 的消息是异步跨线程投递的，用 setTimeout 复现那个时序：
    // 同步回复会掩盖「结果还没回来就用了」这类问题
    setTimeout(() => {
      this.emit('message', { data: handleChecksRequest(request) });
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

  it('Worker 构造失败时降级到主线程，结果不变', async () => {
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
