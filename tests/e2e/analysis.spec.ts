import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const fixtures = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

/** 上传示例数据并等到预览出现 */
async function importFixture(page: Page, name = 'messy-survey.csv') {
  await page.goto('/import');
  await page.setInputFiles('input[type=file]', join(fixtures, name));
  await expect(page.getByText('数据预览')).toBeVisible();
}

/**
 * 导入数据后进入分析页。
 *
 * 必须走界面内的链接，不能用 page.goto：后者是整页重载，而数据集只存在
 * 内存 store 里，一重载就没了（已知技术债，Plan 4 会改成 IndexedDB 暂存）。
 * 用 goto 写测试会得到「明明导入了却提示没数据」的假失败。
 */
async function importThenOpenAnalysis(page: Page) {
  await importFixture(page);
  await page.getByTestId('sidebar').getByRole('link', { name: 'AI 分析' }).click();
  await expect(page).toHaveURL(/\/analysis$/);
}

test.describe('AI 分析 · 入口与前置条件', () => {
  test('未导入数据时给出引导，而不是一个点了没反应的输入框', async ({ page }) => {
    await page.goto('/analysis');

    await expect(page.getByText('还没有导入数据')).toBeVisible();
    // 没有数据就不该出现输入框：让人先打字再告诉他不行，是更差的体验
    await expect(page.getByPlaceholder(/这份问卷数据/)).toHaveCount(0);

    await page.getByRole('link', { name: '去导入数据' }).click();
    await expect(page).toHaveURL(/\/import$/);
  });

  test('导入数据后出现输入框，且空输入时不能提交', async ({ page }) => {
    await importThenOpenAnalysis(page);

    const input = page.getByPlaceholder(/这份问卷数据/);
    await expect(input).toBeVisible();

    const submit = page.getByRole('button', { name: '开始分析' });
    await expect(submit).toBeDisabled();

    await input.fill('这份数据有什么问题');
    await expect(submit).toBeEnabled();
  });

  test('页面明示只有摘要有可能外传', async ({ page }) => {
    await importThenOpenAnalysis(page);

    // 这是产品的核心承诺，必须在用户动手之前就写在眼前
    await expect(page.getByText(/原始数据不会上传/)).toBeVisible();
  });

  test('阶段指示从剖析开始', async ({ page }) => {
    await importThenOpenAnalysis(page);

    // 阶段只在步骤条里显示一处。之前还额外写了一行「当前阶段：X」，
    // 同一个状态写两遍迟早会不一致，已经删掉
    await expect(page.locator('[aria-current="step"]')).toContainText('剖析数据');
  });

  test('无控制台错误', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await importThenOpenAnalysis(page);
    await expect(page.getByPlaceholder(/这份问卷数据/)).toBeVisible();

    expect(consoleErrors).toEqual([]);
  });
});

test.describe('AI 分析 · 导航', () => {
  test('侧边栏里「AI 分析」已不再是禁用态', async ({ page }) => {
    await page.goto('/import');

    const sidebar = page.getByTestId('sidebar');
    const item = sidebar.getByRole('link', { name: 'AI 分析' });
    await expect(item).toBeVisible();
    // 之前这里是 aria-disabled 的占位项，现在应该是真链接
    await expect(item).toHaveAttribute('href', '/analysis');
  });

  test('从侧边栏进入分析页会被标记为当前项', async ({ page }) => {
    await page.goto('/analysis');

    const sidebar = page.getByTestId('sidebar');
    await expect(sidebar.getByRole('link', { name: 'AI 分析' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  test('切换视图不丢数据', async ({ page }) => {
    await importFixture(page);
    await page.getByTestId('sidebar').getByRole('link', { name: 'AI 分析' }).click();
    await expect(page).toHaveURL(/\/analysis$/);
    await expect(page.getByPlaceholder(/这份问卷数据/)).toBeVisible();

    // 切回导入页，数据仍在（store 在客户端路由间保持）
    await page.getByTestId('sidebar').getByRole('link', { name: '数据导入' }).click();
    await expect(page.getByText('共 7 行 × 5 列')).toBeVisible();
  });
});
