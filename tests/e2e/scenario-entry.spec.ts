import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { blockSemanticModelDownload, fixturesDir, gotoHydrated } from './helpers';

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

test('检查页「本次重点」只筛显示，不改变 8 项检查', async ({ page }) => {
  await gotoHydrated(page, '/import');
  await page.getByTestId('scenario-sample-survey').click();
  await expect(page.getByText('数据预览')).toBeVisible();
  await page.getByTestId('sidebar').getByRole('link', { name: '质量检查' }).click();

  await expect(page.getByText('8 项规则检查')).toBeVisible();
  await expect(page.getByTestId('scenario-focus-hint')).toContainText('8 项检查仍然全部执行');
  // 检查异步跑在 Worker 里，先等清单出现再数
  await expect(page.getByTestId('issue-card').first()).toBeVisible();

  // 示例数据实际可检出：缺失（年龄 2 个空）、类型一致性（年龄混入 abc）、重复记录（002）—— 共 3 条
  const before = await page.getByTestId('issue-card').count();
  expect(before).toBeGreaterThanOrEqual(3);

  await page.getByRole('button', { name: /本次重点/ }).click();
  const after = await page.getByTestId('issue-card').count();
  expect(after).toBeGreaterThan(0);
  expect(after).toBeLessThan(before);
  // 「重复记录」不在问卷场景的重点（缺失/类型/类别同义）里，筛掉后不应再出现
  await expect(page.getByTestId('issue-card').filter({ hasText: '重复' })).toHaveCount(0);
});

test('刷新后场景跟数据一起恢复；换文件后场景清空', async ({ page }) => {
  await gotoHydrated(page, '/import');
  await page.getByTestId('scenario-sample-experiment').click();
  await expect(page.getByText('数据预览')).toBeVisible();
  await page.getByTestId('sidebar').getByRole('link', { name: '质量检查' }).click();
  await expect(page.getByTestId('scenario-badge')).toContainText('实验数据');

  // 刷新：数据从 IndexedDB 恢复、场景从 sessionStorage 恢复
  await page.reload();
  await expect(page.getByTestId('scenario-badge')).toContainText('实验数据');

  // 换一份不同文件名的数据：上一份的场景必须清空
  await page.getByTestId('sidebar').getByRole('link', { name: '数据导入' }).click();
  await page.setInputFiles('input[type=file]', join(fixturesDir, 'messy-survey.csv'));
  await expect(page.getByText('数据预览')).toBeVisible();
  await page.getByTestId('sidebar').getByRole('link', { name: '质量检查' }).click();
  await expect(page.getByTestId('scenario-badge')).toHaveCount(0);
});

test('窄屏场景卡片按钮不小于 44px，且不横向溢出', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoHydrated(page, '/import');

  for (const id of ['survey', 'experiment', 'education']) {
    const box = await page.getByTestId(`scenario-sample-${id}`).boundingBox();
    expect(box?.height ?? 0, `${id} 示例按钮不足 44px`).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(
    false,
  );
});
