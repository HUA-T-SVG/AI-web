import { parseFile } from './index';
import type { WorkerRequest, WorkerResponse } from './worker';
import type { ParseError, ParseResult } from './types';

let worker: Worker | null = null;
let workerUnavailable = false;
let sequence = 0;

function ensureWorker(): Worker | null {
  if (workerUnavailable) return null;
  if (worker) return worker;

  try {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    return worker;
  } catch {
    // 打包器不支持 Worker，或运行环境禁用了它
    workerUnavailable = true;
    return null;
  }
}

/**
 * 在 Worker 中解析文件，Worker 不可用时降级到主线程。
 *
 * 降级不是可选项：Worker 的打包依赖构建工具支持 new Worker(new URL(...))，
 * 换构建器或部署平台时可能失效。降级后大文件会短暂卡住界面，但功能不丢。
 */
export function parseInWorker(input: {
  buffer: ArrayBuffer;
  fileName: string;
  fileSize: number;
}): Promise<ParseResult | ParseError> {
  const instance = ensureWorker();
  if (instance === null) return parseFile(input);

  sequence += 1;
  const id = `parse-${sequence}`;

  return new Promise((resolve) => {
    const onMessage = (event: MessageEvent<WorkerResponse>) => {
      if (event.data.id !== id) return;
      instance.removeEventListener('message', onMessage);
      resolve(event.data.result);
    };

    instance.addEventListener('message', onMessage);

    const request: WorkerRequest = { id, ...input };
    // 转移 buffer 的所有权，避免大文件被结构化克隆复制一份
    instance.postMessage(request, [input.buffer]);
  });
}

/** 供测试使用：重置模块级的 Worker 状态 */
export function resetWorkerForTest(): void {
  worker?.terminate();
  worker = null;
  workerUnavailable = false;
  sequence = 0;
}
