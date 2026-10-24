import { test, expect } from '@playwright/test';
import { blockSemanticModelDownload, gotoHydrated, importFixture } from './helpers';

/**
 * 「整页刷新之后，上次的数据还在」—— Plan 4 Task 7 的端到端验收。
 *
 * 这条路只有真浏览器能测：单测用注入的内存后端验的是缓存逻辑，
 * 而这里验的是**真的 IndexedDB 在真的刷新里活下来了**，以及界面有没有
 * 把「这是上次的数据」说出来。
 *
 * 三个用例分别守三件事：
 *   1. 刷新后数据真的回来，并且提示条上写着文件名
 *   2. 点过「放弃并重新上传」之后，刷新不能把被放弃的数据又翻出来
 *   3. 恢复之后各页面直接可用 —— 恢复不是「只在导入页显示一份预览」
 */
test.beforeEach(async ({ page }) => {
  await blockSemanticModelDownload(page);
});

test('刷新后数据还在，并明确说明它来自上次', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await importFixture(page);
  await expect(page.getByText('共 7 行 × 5 列')).toBeVisible();
  // 刚上传的数据不该出现恢复提示 —— 提示条如果一直挂着，它就不再传递信息
  await expect(page.getByTestId('restore-notice')).toHaveCount(0);

  await page.reload();

  const notice = page.getByTestId('restore-notice');
  await expect(notice).toBeVisible();
  // 只说「已恢复数据」不够：用户要能认出是哪个文件
  await expect(notice).toContainText('messy-survey.csv');
  // 也必须说清「没恢复什么」：清洗动作/人工决定不落盘，不说用户会以为还在
  await expect(notice).toContainText('清洗动作');
  await expect(notice).toContainText('人工复核理由');
  await expect(page.getByText('数据预览')).toBeVisible();
  await expect(page.getByText('共 7 行 × 5 列')).toBeVisible();

  expect(errors, `控制台出现错误：\n${errors.join('\n')}`).toEqual([]);
});

test('刷新后示例数据仍然标记为示例，不会冒充用户的真实文件', async ({ page }) => {
  await gotoHydrated(page, '/import');
  await page.getByRole('button', { name: '体验示例数据' }).click();
  await expect(page.getByText('当前是示例数据')).toBeVisible();

  await page.reload();

  await expect(page.getByTestId('restore-notice')).toBeVisible();
  // 示例标记必须和数据集一起回来；否则同一份数据刷新前是示例、刷新后成了“真实数据”
  await expect(page.getByText('当前是示例数据')).toBeVisible();

  await page.getByTestId('sidebar').getByRole('link', { name: '质量检查' }).click();
  await expect(page.getByTestId('data-context')).toContainText('示例数据');
});

test('放弃之后刷新，被放弃的数据不会再回来', async ({ page }) => {
  await importFixture(page);
  await page.reload();
  await expect(page.getByTestId('restore-notice')).toBeVisible();

  await page.getByRole('link', { name: '放弃并重新上传' }).click();
  await expect(page).toHaveURL(/\/import$/);
  await expect(page.getByText('数据预览')).toHaveCount(0);

  // 这一条是这个用例的重点：只消失不删盘的话，一刷新它就回来了
  await page.reload();
  await expect(page.getByTestId('restore-notice')).toHaveCount(0);
  await expect(page.getByText('数据预览')).toHaveCount(0);
});

test('恢复之后直接进质量检查就能看到结果，提示条跟到每一页', async ({ page }) => {
  await importFixture(page);
  await page.reload();
  await expect(page.getByTestId('restore-notice')).toBeVisible();

  await page.getByRole('link', { name: '质量检查' }).first().click();
  // 断言必须落在质量检查页自己的内容上：
  // 「共 N 行」是导入页表格的页脚，这里等不到它 / 或者会碰巧在导航完成前通过，
  // 两种结果都取决于导航快慢 —— 那是一条会随机红的假断言。
  await expect(page).toHaveURL(/\/check$/);
  await expect(page.getByText('列画像')).toBeVisible();
  // 恢复之后用户可能直接跳到别的页面，那一页也必须说明数据不是刚上传的
  await expect(page.getByTestId('restore-notice')).toBeVisible();
});

test('随时可以清除本机暂存数据（T8：不能只藏在恢复提示条里）', async ({ page }) => {
  await importFixture(page);
  await page.reload();
  await expect(page.getByTestId('restore-notice')).toBeVisible();

  await page.getByRole('link', { name: '数据导入' }).first().click();

  // 先验证「取消」不会真的删：确认框不是个只能往下点的陷阱
  await page.getByTestId('clear-cache-button').click();
  await expect(page.getByTestId('clear-cache-confirm-panel')).toBeVisible();
  await page.getByTestId('clear-cache-cancel').click();
  await page.reload();
  await expect(page.getByTestId('restore-notice')).toBeVisible();

  // 真正清除
  await page.getByTestId('clear-cache-button').click();
  await page.getByTestId('clear-cache-confirm').click();
  await expect(page.getByTestId('clear-cache-done')).toBeVisible();

  // 这一条是重点：只改界面不算清掉，刷新之后必须真的找不回来
  await page.reload();
  await expect(page.getByTestId('restore-notice')).toHaveCount(0);
  await expect(page.getByText('数据预览')).toHaveCount(0);
});
