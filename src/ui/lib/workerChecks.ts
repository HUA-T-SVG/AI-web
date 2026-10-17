import { runAllChecks, type Dataset, type QualityIssue, type RunChecksOptions } from '@/core';
import type { ChecksRequest, ChecksResponse, WorkerChecksOptions } from '@/worker/checks.worker';

/**
 * 在 Web Worker 里跑全部检查，Worker 不可用时降级到主线程。
 *
 * 与 `src/parser/workerClient.ts` 同一套模式（超时 / error 事件 / 构造失败 / 只降级一次），
 * 那里已经把三种失败都踩过一遍，这里不重新设计。**唯一的扩展**是「共用实例死了要把
 * 所有在途请求一起降级」，见 `failWorker`。
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

/**
 * 在途请求 → 它的「退回主线程」动作。
 *
 * 为什么需要这张表：Worker 是**单例**，而并发是真实可达的（上一份数据的检查还在跑，
 * 用户又传了一份）。一旦实例因 error / 超时被放弃，它的监听器不会再有消息回来 ——
 * 没有这张表，其余在途请求只能各自等满 30 秒超时才降级，界面白等半分钟。
 */
const pendingFallbacks = new Map<string, () => void>();

function ensureWorker(): Worker | null {
  if (workerUnavailable) return null;
  if (worker) return worker;

  try {
    worker = new Worker(new URL('../../worker/checks.worker.ts', import.meta.url), {
      type: 'module',
    });
    return worker;
  } catch (error) {
    // 构造失败是最常见的「Worker 没生效」形态：打包器不认 `new URL(..., import.meta.url)`、
    // CSP 禁 worker、或页面在受限 iframe 里。**必须告警** —— 否则界面会继续承诺
    // 「计算在后台线程进行」，而实际是在主线程里冻了几秒，用户点了没反应
    workerUnavailable = true;
    console.warn(
      `[checks] 无法创建 Worker（${error instanceof Error ? error.message : String(error)}），改在主线程执行检查`,
    );
    return null;
  }
}

/**
 * 这个实例不能用了：终止它，并让**所有**在途请求退回主线程。
 *
 * 一次降级影响全部在途请求是有意的：共用同一个实例时，「它死了」对所有请求都成立。
 * 代价是罕见情况下会有多次主线程计算（每个请求各自算自己的数据）—— 那仍好过
 * 让用户对着「正在检查…」等 30 秒。
 */
function failWorker(instance: Worker | null, reason: string): void {
  if (workerUnavailable && worker === null && pendingFallbacks.size === 0) return;

  instance?.terminate();
  if (worker === instance) worker = null;
  workerUnavailable = true;
  console.warn(`[checks] Worker ${reason}，改在主线程执行检查`);

  const fallbacks = [...pendingFallbacks.values()];
  pendingFallbacks.clear();
  for (const fallback of fallbacks) fallback();
}

/**
 * 现在起一次检查会在 Worker 里跑吗？
 *
 * 给界面文案用。**不能一边承诺「计算在后台线程」一边静默在主线程跑** ——
 * 那会让用户以为点击没生效（实际是主线程被占住了）。
 */
export function isChecksWorkerAvailable(): boolean {
  return ensureWorker() !== null;
}

/**
 * 执行全部检查，优先在 Worker 里跑。
 *
 * 三种失败都会降级到主线程：构造抛错（同步可知，见 `ensureWorker`）、`error` 事件
 * （Worker 脚本加载或执行失败，**不会抛错**）、以及超时。第二种必须显式处理 ——
 * 不处理的话 Promise 永不 settle，界面会永远停在「正在检查…」，用户只能刷新页面。
 *
 * **不转移 dataset 的所有权**：Worker 出问题时还要用同一份数据走主线程降级。
 * 结构化克隆会复制一份，5 万 × 50 的成本记在 `knowledge/reports/eval-system.md` 里 ——
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
      pendingFallbacks.delete(id);
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

    /** 退回主线程自己算。注册进 `pendingFallbacks`，好让实例故障时被一起叫醒 */
    const settleOnMainThread = () => {
      if (settled) return;
      try {
        finish(runAllChecks(dataset, options));
      } catch (error) {
        fail(error instanceof Error ? error : new Error(String(error)));
      }
    };

    const onMessage = (event: MessageEvent<ChecksResponse>) => {
      // 并发请求共用同一个 Worker，必须按 id 认领自己的结果
      if (event.data.id !== id) return;
      if (event.data.error !== undefined) {
        // 算错了不等于数据干净。说清失败原因，让调用方显示出来
        fail(new Error(`在 Worker 中执行检查时出错：${event.data.error}`));
        return;
      }
      if (!Array.isArray(event.data.issues)) {
        // 协议不完整（旧版本的 worker chunk、或将来加了字段漏带 issues）不能当成
        // 「0 条问题」—— 空数组在界面上的意思是「这份数据干净」，而这里我们并不知道
        fail(new Error('Worker 返回的检查结果不完整'));
        return;
      }
      finish(event.data.issues);
    };

    const onError = () => failWorker(instance, '加载或执行失败');
    const onMessageError = () => failWorker(instance, '返回的消息无法反序列化');

    instance.addEventListener('message', onMessage);
    instance.addEventListener('error', onError);
    instance.addEventListener('messageerror', onMessageError);

    pendingFallbacks.set(id, settleOnMainThread);
    timer = setTimeout(
      () => failWorker(instance, `${WORKER_TIMEOUT_MS}ms 内没有响应`),
      WORKER_TIMEOUT_MS,
    );

    // options 收窄成「能过 postMessage 的子集」：将来给 RunChecksOptions 加一个
    // 不可克隆的字段时，这里会编译不过，而不是等到线上抛 DataCloneError
    const request: ChecksRequest = { id, dataset, options: options as WorkerChecksOptions };
    instance.postMessage(request);
  });
}

/** 供测试使用：重置模块级的 Worker 状态 */
export function resetChecksWorkerForTest(): void {
  worker?.terminate();
  worker = null;
  workerUnavailable = false;
  sequence = 0;
  pendingFallbacks.clear();
}
