import { expect, test } from '@playwright/test';
import { blockSemanticModelDownload, gotoHydrated } from './helpers';

test.beforeEach(async ({ page }) => {
  await blockSemanticModelDownload(page);
});

/**
 * 首屏三张场景卡片。
 *
 * 入口做在导入页而不是新路由：`/` → `/import` 的重定向由 upload.spec 守着，
 * 为一个可选入口改路由只会多一处需要维护的断言。
 *
 * 示例按钮走的是真正的 `loadSample` → 解析 → 画像 → 检查，不是另造一份数据；
 * 所以这里能顺带验证「示例数据同样会报出问题」。
 */
test('首屏三张场景卡片，问卷示例走完整流程', async ({ page }) => {
  await gotoHydrated(page, '/import');

  await expect(page.getByTestId('scenario-card')).toHaveCount(3);
  await expect(page.getByTestId('scenario-card').filter({ hasText: '问卷数据' })).toContainText('编码');
  await expect(page.getByText(/8 项检查仍然全部执行/)).toBeVisible();

  await page.getByTestId('scenario-sample-survey').click();
  await expect(page.getByText('数据预览')).toBeVisible();
  await expect(page.getByText('共 7 行 × 5 列')).toBeVisible();
  await expect(page.getByText('当前是示例数据')).toBeVisible();
});
