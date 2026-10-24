import { test, expect } from '@playwright/test';
import { join } from 'node:path';
import { blockSemanticModelDownload, fixturesDir, gotoHydrated } from './helpers';

/**
 * 冷启动预热。
 *
 * Next dev 是**按需编译**：第一次访问某个路由、第一次创建 Worker 时都要现场编译。
 * 默认多 worker 跑测试时，多个页面同时首访会把编译和检查一起拖慢，表现为
 * 「数据预览 15 秒还没出现」的假红（实测首批 4–16 条，重跑全绿）。
 *
 * 这个 setup project 在所有用例之前把五个路由、一次上传、检查 Worker 都跑热；
 * 被测用例不再承担「第一次编译」的时间。它本身失败说明环境真的起不来，应当红。
 */
test('预热 dev server 路由与 Worker', async ({ page }) => {
  test.setTimeout(180_000);
  await blockSemanticModelDownload(page);

  for (const path of ['/', '/import', '/check', '/analysis', '/rules', '/export']) {
    await page.goto(path);
    await page.waitForFunction(
      () => document.documentElement.dataset.appHydrated === 'true',
      undefined,
      { timeout: 60_000 },
    );
  }

  // 上传一次，强制编译解析、画像与检查三段 Worker；再等检查完成
  await gotoHydrated(page, '/import');
  await page.setInputFiles('input[type=file]', join(fixturesDir, 'messy-survey.csv'));
  await expect(page.getByText('数据预览')).toBeVisible({ timeout: 60_000 });
  await page.getByTestId('sidebar').getByRole('link', { name: '质量检查' }).click();
  await expect(page.getByTestId('data-context')).toContainText('检查完成', {
    timeout: 60_000,
  });
});
