import { test, expect } from '@playwright/test';
import { blockSemanticModelDownload, importFixture } from './helpers';

/**
 * 检查真的跑在 Worker 里 —— Plan 4 Task 8 的端到端验收。
 *
 * **这条测试守的是一类「测试全绿但功能没生效」的问题**：`runChecksInWorker` 在
 * Worker 不可用时会静默降级到主线程，而两条路算出的结果一模一样（那正是它被设计
 * 成等价的原因）。于是「Worker 根本没加载起来」这件事在所有断言结果的地方都看不出来 ——
 * 曲线救国地看控制台：降级时 `workerChecks` 会打一条 `[checks] Worker … 改在主线程执行`。
 *
 * 所以这里断言的是：**没有那条警告**。它比断言结果更接近「这个功能真的在按设计工作」。
 *
 * 另一件顺带守着的事：Worker 里的计算用的是同一份 core，所以结果必须齐全 —— 用真实的
 * 脏数据，确认问题清单不是空的（空的也能过「无警告」这条）。
 */
test.beforeEach(async ({ page }) => {
  await blockSemanticModelDownload(page);
});

test('导入数据后的检查在 Worker 里执行，没有降级到主线程', async ({ page }) => {
  const warnings: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'warning') warnings.push(message.text());
  });

  await importFixture(page);
  await page.getByRole('link', { name: '质量检查' }).first().click();

  // 先等结论出来，否则「没有警告」可能只是还没跑到那一步
  await expect(page.getByTestId('issue-card').first()).toBeVisible();
  await expect(page.getByTestId('checks-status')).toHaveCount(0);

  const fallbacks = warnings.filter((text) => text.includes('[checks]'));
  expect(fallbacks, `检查降级到了主线程：\n${fallbacks.join('\n')}`).toEqual([]);
});

test('拿到的结论与主线程版本一致：真实脏数据能检出多项问题', async ({ page }) => {
  await importFixture(page);
  await page.getByRole('link', { name: '质量检查' }).first().click();

  // messy-survey.csv 的缺陷是确定性的（缺失、类别同义、异常值等），
  // 若 Worker 里跑的「另一份实现」把它漏了，这里会红
  await expect(page.getByTestId('issue-card')).not.toHaveCount(0);
  await expect(page.getByText('发现的问题')).toBeVisible();
});
