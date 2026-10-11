import { describe, it, expect } from 'vitest';
import { NAV_GROUPS, isActivePath } from './navigation';

describe('导航配置', () => {
  it('每项都有 href、标签与图标', () => {
    for (const group of NAV_GROUPS) {
      for (const item of group.items) {
        expect(item.href.startsWith('/')).toBe(true);
        expect(item.label.length).toBeGreaterThan(0);
        expect(item.icon).toBeDefined();
      }
    }
  });

  it('已实现的项才有 available: true', () => {
    const available = NAV_GROUPS.flatMap((g) => g.items).filter((i) => i.available !== false);
    expect(available.map((i) => i.href).sort()).toEqual(['/check', '/import']);
  });

  it('未实现的项必须写明原因，不能只置灰', () => {
    const pending = NAV_GROUPS.flatMap((g) => g.items).filter((i) => i.available === false);
    expect(pending.length).toBeGreaterThan(0);
    for (const item of pending) expect(item.note?.length).toBeGreaterThan(0);
  });
});

describe('isActivePath', () => {
  it('完全相同算激活', () => {
    expect(isActivePath('/import', '/import')).toBe(true);
  });

  it('子路径也算激活，父项要能高亮', () => {
    expect(isActivePath('/check', '/check/detail')).toBe(true);
  });

  it('前缀相同但不是同一段的不算激活', () => {
    expect(isActivePath('/import', '/import-extra')).toBe(false);
  });

  it('根路径只在完全相等时激活', () => {
    expect(isActivePath('/', '/import')).toBe(false);
    expect(isActivePath('/', '/')).toBe(true);
  });
});
