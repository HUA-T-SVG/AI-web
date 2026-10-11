import { parseFile } from './index';
import type { WorkerRequest, WorkerResponse } from './worker';
import type { ParseError, ParseResult } from './types';

/** Worker 迟迟不响应时的兜底时长 */
const WORKER_TIMEOUT_MS = 30_000;

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

/** Worker 已不可用，转为在当前线程解析 */
function abandonWorker(instance: Worker | null, reason: string): void {
  instance?.terminate();
  if (worker === instance) worker = null;
  workerUnavailable = true;
  console.warn(`[parser] Worker ${reason}，改用主线程解析`);
}

/**
 * 在 Worker 中解析文件，Worker 不可用时降级到主线程。
 *
 * 降级覆盖两种失败：
 *   1. 构造函数抛错（打包器不支持 Worker）—— 同步可知
 *   2. Worker 构造成功但加载或执行失败 —— 以 error 事件投递，**不会抛错**
 *
 * 第 2 种必须显式处理：Worker 的 chunk 是首次解析时才懒加载的，网络抖动、
 * CSP 限制或部署路径配错都会命中这条路，而它不处理的话 Promise 永不 settle，
 * 界面会永远停在「正在解析…」，用户只能刷新页面。
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
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const finish = (result: ParseResult | ParseError) => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      instance.removeEventListener('message', onMessage);
      instance.removeEventListener('error', onError);
      instance.removeEventListener('messageerror', onMessageError);
      resolve(result);
    };

    const onMessage = (event: MessageEvent<WorkerResponse>) => {
      if (event.data.id !== id) return;
      finish(event.data.result);
    };

    const fallbackToMainThread = (reason: string) => {
      if (settled) return;
      abandonWorker(instance, reason);
      void parseFile(input).then(finish, (error: unknown) =>
        finish({
          kind: 'corrupt',
          message: `解析时发生意外错误：${error instanceof Error ? error.message : String(error)}`,
        }),
      );
    };

    const onError = () => fallbackToMainThread('加载或执行失败');
    const onMessageError = () => fallbackToMainThread('返回的消息无法反序列化');

    instance.addEventListener('message', onMessage);
    instance.addEventListener('error', onError);
    instance.addEventListener('messageerror', onMessageError);

    timer = setTimeout(() => fallbackToMainThread(`${WORKER_TIMEOUT_MS}ms 内没有响应`), WORKER_TIMEOUT_MS);

    const request: WorkerRequest = { id, ...input };
    // 刻意不转移 buffer 的所有权：Worker 出问题时还要用同一份数据走主线程降级。
    // 结构化克隆会复制一份，几十 MB 的文件约几十毫秒，换回的是可恢复性。
    instance.postMessage(request);
  });
}

/** 供测试使用：重置模块级的 Worker 状态 */
export function resetWorkerForTest(): void {
  worker?.terminate();
  worker = null;
  workerUnavailable = false;
  sequence = 0;
}
