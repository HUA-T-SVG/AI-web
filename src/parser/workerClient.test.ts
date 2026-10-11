import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { parseInWorker, resetWorkerForTest } from './workerClient';
import { isParseError } from './types';

const csv = (content: string) => ({
  buffer: new TextEncoder().encode(content).buffer,
  fileName: 'a.csv',
  fileSize: content.length,
});

/** 构造成功但永远不返回结果的 Worker，用来复现「加载失败」这类运行期故障 */
class SilentWorker implements Partial<Worker> {
  onerror: ((event: unknown) => void) | null = null;
  terminate = vi.fn();

  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    this.listeners.set(
      type,
      (this.listeners.get(type) ?? []).filter((item) => item !== listener),
    );
  }
  postMessage(): void {
    // 什么都不做：模拟 Worker 脚本加载失败后既不回消息也不抛错
  }

  /** 手动触发一个事件，模拟浏览器投递 error */
  emit(type: string, payload: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) {
      (listener as (event: unknown) => void)(payload);
    }
  }

  private listeners = new Map<string, EventListenerOrEventListenerObject[]>();
}

describe('parseInWorker', () => {
  beforeEach(() => {
    resetWorkerForTest();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    resetWorkerForTest();
  });

  it('Worker 构造失败时降级到主线程，结果仍然正确', async () => {
    vi.stubGlobal('Worker', undefined as unknown as typeof Worker);

    const result = await parseInWorker(csv('姓名\n张三'));

    expect(isParseError(result)).toBe(false);
    if (!isParseError(result)) {
      expect(result.dataset.rowCount).toBe(1);
      expect(result.dataset.columns[0]?.name).toBe('姓名');
    }
  });

  it('降级路径同样处理解析错误', async () => {
    vi.stubGlobal('Worker', undefined as unknown as typeof Worker);
    expect(isParseError(await parseInWorker(csv('')))).toBe(true);
  });

  it('降级后第二次调用不再尝试构造 Worker', async () => {
    const failing = vi.fn(() => {
      throw new Error('构造失败');
    });
    vi.stubGlobal('Worker', failing);

    await parseInWorker(csv('a\n1'));
    await parseInWorker(csv('a\n2'));

    // 已知不可用就不该反复重试：每次重试都伴随一次异常抛出
    expect(failing).toHaveBeenCalledTimes(1);
  });

  it('Worker 投递 error 事件时降级到主线程，而不是永远卡住', async () => {
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

    const pending = parseInWorker(csv('姓名\n张三'));
    // 模拟浏览器在 Worker 脚本加载失败时投递 error
    created?.emit('error', new Error('chunk 加载失败'));

    const result = await pending;
    expect(isParseError(result)).toBe(false);
    if (!isParseError(result)) expect(result.dataset.rowCount).toBe(1);
  });

  it('Worker 超时未响应时降级到主线程', async () => {
    vi.useFakeTimers();
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

    const pending = parseInWorker(csv('姓名\n张三'));
    expect(created).toBeDefined();
    vi.advanceTimersByTime(31_000);

    const result = await pending;
    expect(isParseError(result)).toBe(false);
    if (!isParseError(result)) expect(result.dataset.rowCount).toBe(1);
  });
});
