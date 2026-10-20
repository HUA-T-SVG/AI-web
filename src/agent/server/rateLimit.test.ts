import { describe, expect, it } from 'vitest';
import { createRateLimiter } from './rateLimit';

/**
 * 限流器的行为测试。**时间全部注入**：窗口过期这类行为靠 sleep 测既慢又不稳定。
 */

function fakeClock(startAt = 1_000_000) {
  let current = startAt;
  return {
    now: () => current,
    advance(ms: number) {
      current += ms;
    },
  };
}

function limiterWith(max: number, windowMs: number, clock = fakeClock()) {
  return { limiter: createRateLimiter({ max, windowMs, now: clock.now }), clock };
}

describe('createRateLimiter', () => {
  it('额度内放行，超出后拒绝并给出剩余等待秒数', () => {
    const { limiter, clock } = limiterWith(2, 10_000);

    expect(limiter.check('a')).toEqual({ allowed: true, remaining: 1, retryAfterSeconds: 0 });
    expect(limiter.check('a')).toEqual({ allowed: true, remaining: 0, retryAfterSeconds: 0 });

    clock.advance(1_500);
    const blocked = limiter.check('a');
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    // 剩 8.5 秒 → 向上取整 9：说「8 秒」会让用户到点再被拒一次
    expect(blocked.retryAfterSeconds).toBe(9);
  });

  it('窗口过去后重新计数，而不是永久封禁', () => {
    const { limiter, clock } = limiterWith(1, 5_000);

    expect(limiter.check('a').allowed).toBe(true);
    expect(limiter.check('a').allowed).toBe(false);

    clock.advance(5_000);
    expect(limiter.check('a')).toEqual({ allowed: true, remaining: 0, retryAfterSeconds: 0 });
  });

  it('不同访客各算各的 —— 一个人刷爆不影响别人', () => {
    const { limiter } = limiterWith(1, 5_000);

    expect(limiter.check('a').allowed).toBe(true);
    expect(limiter.check('a').allowed).toBe(false);
    expect(limiter.check('b').allowed).toBe(true);
  });

  it('窗口重置后 remaining 回到满额', () => {
    const { limiter, clock } = limiterWith(3, 1_000);

    expect(limiter.check('a').remaining).toBe(2);
    clock.advance(1_001);
    expect(limiter.check('a').remaining).toBe(2);
  });
});
