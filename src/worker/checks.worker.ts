import {
  profileDataset,
  runAllChecks,
  type Dataset,
  type DatasetProfile,
  type QualityIssue,
  type RunChecksOptions,
} from '@/core';

/**
 * 数据计算的 Web Worker 入口：列画像与全部检查。
 *
 * **它自己不含任何计算逻辑** —— 唯一的计算是 `profileDataset` 与 `runAllChecks`，
 * 也就是主线程用的那一份。这是 Plan 4 Task 8 的硬约束（Review Focus 第 6 条）：
 * 搬进 Worker 的必须是同一份 `core` 实现，不得出现「Worker 版」和「主线程版」两套。
 * 一旦这里出现第二份逻辑，界面上显示的结果就会与导出脚本、与 MCP Server 慢慢分叉，
 * 而分叉不会有任何报错。
 *
 * 两种作业共用一个实例（同一个 `src/ui/lib/workerChecks.ts` 客户端）：
 * 列画像（T1，约 0.9 秒 / 5 万 × 50）与检查（Task 8，约 3.2 秒）。它们的共同点是
 * **同步计算**，而 spec §2.3 要求「界面全程不卡顿」—— 成立的理由只有这一条，
 * 不要写成「性能不达标」：两项都远在预算内（3 秒 / 30 秒）。
 *
 * 为什么分成两次请求而不是合并成一次：合并确实能省一次结构化克隆，但**列画像要等
 * 检查跑完（约 3 秒）才回来**，界面上的列画像会凭空晚三秒出现。分开请求、各自
 * 一次克隆，是拿一次约 90 ms 的复制换「画像先出来」这个体验。
 */

/** 能过 `postMessage` 的选项子集。`extraChecks` 里是函数，结构化克隆过不去，见客户端 */
export type WorkerChecksOptions = Omit<RunChecksOptions, 'extraChecks'>;

export interface ChecksRequest {
  kind: 'checks';
  id: string;
  dataset: Dataset;
  options: WorkerChecksOptions;
}

export interface ProfileRequest {
  kind: 'profile';
  id: string;
  dataset: Dataset;
}

/** 响应也带 `kind`：两个作业共用一条消息通道，靠它确认「回来的正是我要的那类结果」 */
export type WorkerRequest = ChecksRequest | ProfileRequest;

export interface ChecksResponse {
  kind: 'checks';
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

export interface ProfileResponse {
  kind: 'profile';
  id: string;
  /** 成功时必有 */
  profile?: DatasetProfile;
  /** 失败时带原因。空画像在界面上会显示成「0 列」，同样是「不知道」被说成了结论 */
  error?: string;
}

export type WorkerResponse = ChecksResponse | ProfileResponse;

/**
 * 纯函数形态的请求处理，Worker 只是它们的一层壳。
 *
 * 抽出来的理由是**可测**：单测能直接调它，与主线程 `profileDataset` / `runAllChecks`
 * 的结果逐字段比对。若把它们内联进 `addEventListener` 回调，等价性就只能靠
 * 「两边看起来一样」来相信。
 */
export function handleChecksRequest(request: ChecksRequest): ChecksResponse {
  try {
    return { kind: 'checks', id: request.id, issues: runAllChecks(request.dataset, request.options) };
  } catch (error) {
    return {
      kind: 'checks',
      id: request.id,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function handleProfileRequest(request: ProfileRequest): ProfileResponse {
  try {
    return { kind: 'profile', id: request.id, profile: profileDataset(request.dataset) };
  } catch (error) {
    return {
      kind: 'profile',
      id: request.id,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Worker 里真正的入口：按 `kind` 分派。分派写在这里而不是 `addEventListener` 里，为了可测 */
export function handleWorkerRequest(request: WorkerRequest): WorkerResponse {
  return request.kind === 'profile' ? handleProfileRequest(request) : handleChecksRequest(request);
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
    listener: (event: MessageEvent<WorkerRequest>) => void,
  ): void;
  postMessage(message: WorkerResponse): void;
};

// 单测在 node 里直接 import 本文件，那里没有 self —— 跳过注册。
// 真 Worker 里 self 一定存在，所以这不是「可能不生效的条件注册」。
if (typeof self !== 'undefined') {
  const workerScope = self as unknown as WorkerScope;
  workerScope.addEventListener('message', (event) => {
    workerScope.postMessage(handleWorkerRequest(event.data));
  });
}
