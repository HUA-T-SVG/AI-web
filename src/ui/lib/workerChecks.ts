import { runAllChecks, type Dataset, type QualityIssue, type RunChecksOptions } from '@/core';
import type { ChecksRequest, ChecksResponse } from '@/worker/checks.worker';

/**
 * 在 Web Worker 里跑全部检查，Worker 不可用时降级到主线程。
 *
 * 与 `src/parser/workerClient.ts` 同一套模式（超时 / error 事件 / 构造失败 / 只降级一次），
 * 那里已经把三种失败都踩过一遍，这里不重新设计。
 *
 * 为什么要搬（Plan 4 Task 4 的实测结论，**不要写成「性能不达标」**）：
 * 5 万行 × 50 列的全量检查约 3.2 秒，预算 30 秒，余量很大。唯一成立的理由是
 * 这 3.2 秒同步计算会把主线程冻住，而 spec §2.3 要求「界面全程不卡顿」。
 */

/** Worker 迟迟不响应时的兜底时长。全量检查实测 3.2 秒，30 秒是约 10 倍余量 */
const WORKER_TIMEOUT_MS = 30_000;

let worker: Worker | null = null;
let workerUnavailable = false;
let sequence = 0;

function ensureWorker(): Worker | null {
  if (workerUnavailable) return null;
  if (worker) return worker;

  try {
    worker = new Worker(new URL('../../worker/checks.worker.ts', import.meta.url), {
      type: 'module',
    });
    return worker;
  } catch {
    // 打包器不支持 Worker，或运行环境禁用了它
    workerUnavailable = true;
    return null;
  }
}

/** Worker 已不可用，之后的请求都走主线程 */
function abandonWorker(instance: Worker | null, reason: string): void {
  instance?.terminate();
  if (worker === instance) worker = null;
  workerUnavailable = true;
  console.warn(`[checks] Worker ${reason}，改在主线程执行检查`);
}

/**
 * 执行全部检查，优先在 Worker 里跑。
 *
 * 三种失败都会降级到主线程：构造抛错（同步可知）、`error` 事件（Worker 脚本加载
 * 或执行失败，**不会抛错**）、以及超时。第二种必须显式处理 —— 不处理的话 Promise
 * 永不 settle，界面会永远停在「正在检查…」，用户只能刷新页面。
 *
 * **不转移 dataset 的所有权**：Worker 出问题时还要用同一份数据走主线程降级。
 * 结构化克隆会复制一份，5 万 × 50 的复制成本由 `eval-system.md` 里记的数给出 ——
 * 那是这个方案真正的主线程开销，比原来的 3.2 秒小一个量级。
 */
export function runChecksInWorker(
  dataset: Dataset,
  options: RunChecksOptions = {},
): Promise<QualityIssue[]> {
  // extraChecks 里是函数，过不了结构化克隆。这种情况直接在主线程跑，但要说出来 ——
  // 悄悄换实现会让「Worker 里跑的就是同一份 core」这条承诺出现看不见的裂缝
  if (options.extraChecks !== undefined) {
    console.warn('[checks] extraChecks 里是函数，无法传给 Worker，改在主线程执行');
    return Promise.resolve(runAllChecks(dataset, options));
  }

  const instance = ensureWorker();
  if (instance === null) return Promise.resolve(runAllChecks(dataset, options));

  sequence += 1;
  const id = `checks-${sequence}`;

  return new Promise<QualityIssue[]>((resolve, reject) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const cleanup = () => {
      if (timer !== undefined) clearTimeout(timer);
      instance.removeEventListener('message', onMessage);
      instance.removeEventListener('error', onError);
      instance.removeEventListener('messageerror', onMessageError);
    };

    const finish = (issues: QualityIssue[]) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(issues);
    };

    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };

    const onMessage = (event: MessageEvent<ChecksResponse>) => {
      // 并发请求共用同一个 Worker，必须按 id 认领自己的结果
      if (event.data.id !== id) return;
      if (event.data.error !== undefined) {
        // 算错了不等于数据干净。说清失败原因，让调用方显示出来
        fail(new Error(`在 Worker 中执行检查时出错：${event.data.error}`));
        return;
      }
      finish(event.data.issues ?? []);
    };

    const fallbackToMainThread = (reason: string) => {
      if (settled) return;
      abandonWorker(instance, reason);
      try {
        finish(runAllChecks(dataset, options));
      } catch (error) {
        fail(error instanceof Error ? error : new Error(String(error)));
      }
    };

    const onError = () => fallbackToMainThread('加载或执行失败');
    const onMessageError = () => fallbackToMainThread('返回的消息无法反序列化');

    instance.addEventListener('message', onMessage);
    instance.addEventListener('error', onError);
    instance.addEventListener('messageerror', onMessageError);

    timer = setTimeout(
      () => fallbackToMainThread(`${WORKER_TIMEOUT_MS}ms 内没有响应`),
      WORKER_TIMEOUT_MS,
    );

    const request: ChecksRequest = { id, dataset, options };
    instance.postMessage(request);
  });
}

/** 供测试使用：重置模块级的 Worker 状态 */
export function resetChecksWorkerForTest(): void {
  worker?.terminate();
  worker = null;
  workerUnavailable = false;
  sequence = 0;
}
