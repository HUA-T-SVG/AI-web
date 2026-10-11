import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { parseInWorker, resetWorkerForTest } from './workerClient';
import { isParseError } from './types';

describe('parseInWorker', () => {
  beforeEach(() => {
    resetWorkerForTest();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    resetWorkerForTest();
  });

  it('Worker 构造失败时降级到主线程，结果仍然正确', async () => {
    // node 环境里没有 Worker，构造必然失败 —— 这正好复现降级路径
    vi.stubGlobal('Worker', undefined as unknown as typeof Worker);

    const result = await parseInWorker({
      buffer: new TextEncoder().encode('姓名\n张三').buffer,
      fileName: 'a.csv',
      fileSize: 20,
    });

    expect(isParseError(result)).toBe(false);
    if (!isParseError(result)) {
      expect(result.dataset.rowCount).toBe(1);
      expect(result.dataset.columns[0]?.name).toBe('姓名');
    }
  });

  it('降级路径同样处理解析错误', async () => {
    vi.stubGlobal('Worker', undefined as unknown as typeof Worker);

    const result = await parseInWorker({
      buffer: new TextEncoder().encode('').buffer,
      fileName: 'a.csv',
      fileSize: 0,
    });

    expect(isParseError(result)).toBe(true);
  });

  it('降级后第二次调用不再尝试构造 Worker', async () => {
    const failing = vi.fn(() => {
      throw new Error('构造失败');
    });
    vi.stubGlobal('Worker', failing);

    await parseInWorker({
      buffer: new TextEncoder().encode('a\n1').buffer,
      fileName: 'a.csv',
      fileSize: 10,
    });
    await parseInWorker({
      buffer: new TextEncoder().encode('a\n2').buffer,
      fileName: 'a.csv',
      fileSize: 10,
    });

    // 已知不可用就不该反复重试：每次重试都伴随一次异常抛出
    expect(failing).toHaveBeenCalledTimes(1);
  });
});
