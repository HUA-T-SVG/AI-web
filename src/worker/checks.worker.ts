import { runAllChecks, type Dataset, type QualityIssue, type RunChecksOptions } from '@/core';

/**
 * 检查的 Web Worker 入口。
 *
 * **它自己不含任何检查逻辑** —— 唯一的计算是 `runAllChecks`，也就是主线程用的那一份。
 * 这是 Plan 4 Task 8 的硬约束（Review Focus 第 6 条）：搬进 Worker 的必须是同一份
 * `core` 实现，不得出现「Worker 版」和「主线程版」两套。一旦这里出现第二份逻辑，
 * 界面上显示的结果就会与导出脚本、与 MCP Server 慢慢分叉，而分叉不会有任何报错。
 *
 * 为什么值得搬（Plan 4 Task 4 的实测结论，别写成「性能不达标」）：
 * 5 万行 × 50 列的全量检查约 3.2 秒，预算 30 秒，**远没超**。成立的理由只有一条 ——
 * 这 3.2 秒是同步计算，会把主线程冻住，而 spec §2.3 要求「界面全程不卡顿」。
 */

/** 能过 `postMessage` 的选项子集。`extraChecks` 里是函数，结构化克隆过不去，见客户端 */
export type WorkerChecksOptions = Omit<RunChecksOptions, 'extraChecks'>;

export interface ChecksRequest {
  id: string;
  dataset: Dataset;
  options: WorkerChecksOptions;
}

export interface ChecksResponse {
  id: string;
  /** 成功时必有 */
  issues?: QualityIssue[];
  /**
   * 失败时带原因。
   *
   * 不把「算错了」伪装成「没问题」：`issues: []` 在界面上的意思是「这份数据干净」，
   * 而 Worker 里抛异常时我们并不知道数据干不干净。这两件事在科研数据场景里
   * 是完全不同的结论，宁可让调用方收到错误。
   */
  error?: string;
}

/**
 * 纯函数形态的请求处理，Worker 只是它的一层壳。
 *
 * 抽出来的理由是**可测**：单测能直接调它，与主线程 `runAllChecks` 的结果逐字段比对。
 * 若把它内联进 `addEventListener` 回调，等价性就只能靠「两边看起来一样」来相信。
 */
export function handleChecksRequest(request: ChecksRequest): ChecksResponse {
  try {
    return { id: request.id, issues: runAllChecks(request.dataset, request.options) };
  } catch (error) {
    return {
      id: request.id,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Worker 全局作用域在 tsconfig 的 dom lib 下被推断为 Window，而 Window.postMessage
 * 的签名要求 targetOrigin。这里显式声明实际用到的那部分，避免为类型去和 lib 配置较劲
 * （与 `src/parser/worker.ts` 同一处理）。
 *
 * 注意 `self` 的读取必须留在守卫内部：模块顶层直接引用它在 node 里是 ReferenceError，
 * 而单测（以及任何在 node 里 import 本文件的场景）都会撞上。
 */
type WorkerScope = {
  addEventListener(
    type: 'message',
    listener: (event: MessageEvent<ChecksRequest>) => void,
  ): void;
  postMessage(message: ChecksResponse): void;
};

// 单测在 node 里直接 import 本文件，那里没有 self —— 跳过注册。
// 真 Worker 里 self 一定存在，所以这不是「可能不生效的条件注册」。
if (typeof self !== 'undefined') {
  const workerScope = self as unknown as WorkerScope;
  workerScope.addEventListener('message', (event) => {
    workerScope.postMessage(handleChecksRequest(event.data));
  });
}
