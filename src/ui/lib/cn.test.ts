import { describe, it, expect } from 'vitest';
import { cn } from './cn';

describe('cn', () => {
  it('拼接多个类名', () => {
    expect(cn('a', 'b')).toBe('a b');
  });

  it('忽略假值', () => {
    expect(cn('a', false, null, undefined, 'b')).toBe('a b');
  });

  it('支持条件对象写法', () => {
    expect(cn('base', { active: true, disabled: false })).toBe('base active');
  });

  it('后写的同类 Tailwind 工具类覆盖前面的', () => {
    // 这是 cn 存在的唯一理由：手写字符串拼接时 px-2 和 px-4 会同时留在 class 里，
    // 实际生效的取决于 CSS 顺序而不是书写顺序，调试起来很反直觉
    expect(cn('px-2', 'px-4')).toBe('px-4');
  });

  it('不同类别的工具类都保留', () => {
    expect(cn('px-2', 'text-sm')).toBe('px-2 text-sm');
  });
});
