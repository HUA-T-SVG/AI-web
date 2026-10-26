import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import {
  blockSemanticModelDownload,
  fixturesDir,
  gotoHydrated,
  waitForAppHydrated,
} from './helpers';

test.beforeEach(async ({ page }) => {
  await blockSemanticModelDownload(page);
});

/**
 * 首屏三张场景卡片。
 *
 * 入口做在导入页而不是新路由：`/` → `/import` 的重定向由 upload.spec 守着，
 * 为一个可选入口改路由只会多一处需要维护的断言。
 *
 * 示例按钮走真正的 `loadSample` → 解析 → 画像 → 检查，不是另造一份数据。
 */
test('首屏三张场景卡片，问卷示例走完整流程', async ({ page }) => {
  await gotoHydrated(page, '/import');

  await expect(page.getByTestId('scenario-card')).toHaveCount(3);
  await expect(page.getByTestId('scenario-card').filter({ hasText: '问卷数据' })).toContainText('编码');
  await expect(page.getByText(/8 项规则检查仍然全部执行/)).toBeVisible();

  await page.getByTestId('scenario-sample-survey').click();
  await expect(page.getByText('数据预览')).toBeVisible();
  await expect(page.getByText('共 7 行 × 5 列')).toBeVisible();
  await expect(page.getByText('当前是示例数据')).toBeVisible();
  // 示例是合成的，界面必须说清，不能让人当成真实数据
  await expect(page.getByText(/合成示例数据/)).toBeVisible();
});

test('导入页刷新时场景恢复不触发 hydration 报错', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await gotoHydrated(page, '/import');
  const surveyCard = page.getByTestId('scenario-card').filter({ hasText: '问卷数据' });
  await surveyCard.getByRole('button', { name: '选为本次场景' }).click();
  await expect(surveyCard).toHaveAttribute('data-selected', 'true');

  // 预渲染页刷新：服务端没有 sessionStorage，客户端必须在 mount 后恢复，
  // 否则首帧选中态与 SSR HTML 不一致，React 会报 hydration 错误并整树重渲
  await page.reload();
  await waitForAppHydrated(page);
  await expect(surveyCard).toHaveAttribute('data-selected', 'true');
  expect(consoleErrors.filter((text) => /hydrat/i.test(text))).toEqual([]);
});

test('检查页「本次重点」只筛显示，不影响统计与 8 项检查', async ({ page }) => {
  await gotoHydrated(page, '/import');
  await page.getByTestId('scenario-sample-survey').click();
  await expect(page.getByText('数据预览')).toBeVisible();
  await page.getByTestId('sidebar').getByRole('link', { name: '质量检查' }).click();

  await expect(page.getByText('8 项规则检查', { exact: true })).toBeVisible();
  await expect(page.getByTestId('scenario-focus-hint')).toContainText('8 项规则检查仍然全部执行');
  // 检查异步跑在 Worker 里，先等清单与覆盖地图出现再取基准
  await expect(page.getByTestId('issue-card').first()).toBeVisible();
  await expect(page.getByTestId('coverage-map')).toBeVisible();

  const issueHeader = page.getByText(/共 \d+ 条，可按严重程度与字段筛选/);
  const headerBefore = await issueHeader.textContent();
  const coverageBefore = await page.getByTestId('coverage-map').textContent();
  const before = await page.getByTestId('issue-card').count();
  expect(before).toBeGreaterThanOrEqual(3);

  await page.getByRole('button', { name: /本次重点/ }).click();
  const after = await page.getByTestId('issue-card').count();
  expect(after).toBeGreaterThan(0);
  expect(after).toBeLessThan(before);
  // 「重复记录」不在问卷场景的重点（缺失/类型/类别同义）里，筛掉后不应再出现
  await expect(page.getByTestId('issue-card').filter({ hasText: '重复' })).toHaveCount(0);

  // 筛选只影响显示：清单总数、严重度统计与覆盖地图必须与筛选前逐字一致
  await expect(issueHeader).toHaveText(headerBefore ?? '');
  await expect(page.getByTestId('coverage-map')).toHaveText(coverageBefore ?? '');
  await expect(page.getByText('8 项规则检查', { exact: true })).toBeVisible();
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
