import { test, expect } from '@playwright/test';

/**
 * 响应式布局。
 *
 * 设计文档把宽度分成三档：≥1280 固定侧栏，768–1279 可收起，<768 顶部导航。
 * 这里只测中间那档的收起/展开与 1280 的固定行为 —— 移动端底部操作区
 * 依赖审阅列表，放在 analysis.spec.ts 里和它的 mock 一起测。
 */
test.describe('响应式布局', () => {
  test('768–1279 侧栏可收起再展开；≥1280 固定显示', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 800 });
    await page.goto('/import');

    const sidebar = page.getByTestId('sidebar');
    await expect(sidebar).toBeVisible();

    await page.getByRole('button', { name: '收起导航' }).click();
    await expect(sidebar).toBeHidden();
    // 收起不是删掉入口：展开按钮必须还在，否则用户只能刷新页面
    await expect(page.getByRole('button', { name: '展开导航' })).toBeVisible();

    await page.getByRole('button', { name: '展开导航' }).click();
    await expect(sidebar).toBeVisible();

    // 1280 起回到设计文档的「固定侧栏」，收起入口不再出现
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(page.getByRole('button', { name: '收起导航' })).toBeHidden();
    await expect(sidebar).toBeVisible();
  });
});
