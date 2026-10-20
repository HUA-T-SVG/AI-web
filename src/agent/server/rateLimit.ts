/**
 * `/api/agent` 的最简限流：固定窗口，按访客计数。
 *
 * **为什么需要它**：演示地址是公开的、接口没有鉴权 —— 任何人都能消耗模型配额。
 * 这不是「有人攻击」才成立的风险：一次误触发的前端重试、一个爬虫把接口当免费代理，
 * 都能在几分钟内把配额烧掉，而后台没有任何告警。
 *
 * **它做不到什么（必须写清）**：内存计数只在**当前实例**里有效。部署在 Serverless
 * 上时，多个实例各算各的（冷启动后还会清零）。所以它是「防误刷」而不是「硬配额」；
 * 真要硬配额得放 Redis/平台限流，那需要外部依赖 —— 对演示版不划算。
 * 这也意味着**答辩时不能说「我们有接口限流」**，只能说「有实例级的兜底」。
 */

export interface RateLimitDecision {
  allowed: boolean;
  /** 当前窗口还剩几次 */
  remaining: number;
  /** 被拒时：多少秒后可以再试 */
  retryAfterSeconds: number;
}

export interface RateLimiter {
  check(key: string): RateLimitDecision;
}

interface Window {
  count: number;
  resetAt: number;
}

/** 超过这个条目数就清一遍过期窗口 —— 否则不同 IP 会把内存撑大 */
const MAX_TRACKED_KEYS = 1000;

/**
 * 构造限流器。
 *
 * `now` 可注入：窗口过期这类行为要能被确定性地测到，不能靠 sleep。
 */
export function createRateLimiter(options: {
  max: number;
  windowMs: number;
  now?: () => number;
}): RateLimiter {
  const max = Math.max(1, Math.floor(options.max));
  const windowMs = Math.max(1, Math.floor(options.windowMs));
  const now = options.now ?? (() => Date.now());
  const windows = new Map<string, Window>();

  function prune(currentTime: number): void {
    if (windows.size < MAX_TRACKED_KEYS) return;
    for (const [key, window] of windows) {
      if (currentTime >= window.resetAt) windows.delete(key);
    }
  }

  return {
    check(key) {
      const currentTime = now();
      prune(currentTime);

      const existing = windows.get(key);
      if (existing === undefined || currentTime >= existing.resetAt) {
        windows.set(key, { count: 1, resetAt: currentTime + windowMs });
        return { allowed: true, remaining: max - 1, retryAfterSeconds: 0 };
      }

      existing.count += 1;
      if (existing.count > max) {
        // 向上取整：剩 0.2 秒时要说「1 秒后」，说 0 秒会让用户立刻重试再被拒
        const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - currentTime) / 1000));
        return { allowed: false, remaining: 0, retryAfterSeconds };
      }

      return { allowed: true, remaining: max - existing.count, retryAfterSeconds: 0 };
    },
  };
}
