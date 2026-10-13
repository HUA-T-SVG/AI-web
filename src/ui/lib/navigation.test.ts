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
    const available = NAV_GROUPS.flatMap((g) => g.items).filter((i) => i.available);
    // `/rules` 在 Task 7、`/export` 在 Task 9 接通之后解禁 —— 这份清单是
    // 「界面上声称能用的功能」的清单，新增一项就是在声称它可用
    expect(available.map((i) => i.href).sort()).toEqual([
      '/analysis',
      '/check',
      '/export',
      '/import',
      '/rules',
    ]);
  });

  it('每一项要么可用，要么写明为什么不可用 —— 不能只置灰不解释', () => {
    // 原来写成「pending 必须非空」，而 Plan 3 之后五项全部实现了，
    // 那条断言就变成空转。改成双向规则，它不依赖「现在有没有禁用项」这个状态。
    const items = NAV_GROUPS.flatMap((group) => group.items);
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      if (item.available) continue;
      expect(item.note?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it('可用的项不该带「开发中」说明，避免两处矛盾', () => {
    const contradictory = NAV_GROUPS.flatMap((g) => g.items).filter(
      (i) => i.available && i.note !== undefined,
    );
    expect(contradictory).toEqual([]);
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
