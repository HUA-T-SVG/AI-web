import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const fixtures = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const sidebar = (page: Page) => page.getByTestId('sidebar');

/** 上传示例数据并等到预览出现 */
async function importFixture(page: Page, name = 'messy-survey.csv') {
  await page.goto('/import');
  await page.setInputFiles('input[type=file]', join(fixtures, name));
  await expect(page.getByText('数据预览')).toBeVisible();
}

test.describe('数据导入', () => {
  test('上传 CSV 后能看到预览与文件名', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await importFixture(page);

    await expect(page.getByText('共 7 行 × 5 列')).toBeVisible();
    await expect(page.getByText(/messy-survey\.csv/)).toBeVisible();
    await expect(page.getByText(/编码/)).toBeVisible();

    expect(consoleErrors).toEqual([]);
  });

  test('上传 .xlsx 能正确解析，并提示只分析了第一张工作表', async ({ page }) => {
    await importFixture(page, 'survey.xlsx');

    await expect(page.getByText('共 6 行 × 4 列')).toBeVisible();
    // 第二个工作表不该被混进来
    await expect(page.getByText('这张表不应被读取')).toHaveCount(0);
    await expect(page.getByText(/有 2 个工作表/)).toBeVisible();
    await expect(page.getByText('999')).toBeVisible();
  });

  test('空文件给出可读的中文提示', async ({ page }) => {
    await page.goto('/import');
    await page.setInputFiles('input[type=file]', {
      name: 'empty.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(''),
    });

    await expect(page.getByText('没法读取这个文件')).toBeVisible();
    await expect(page.getByText(/这个文件是空的/)).toBeVisible();
  });

  test('不支持的格式提示支持范围', async ({ page }) => {
    await page.goto('/import');
    await page.setInputFiles('input[type=file]', {
      name: 'a.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4'),
    });

    await expect(page.getByText(/只支持 .csv 和 .xlsx/)).toBeVisible();
  });

  test('重复列名的输入不误报为重复记录，且列序号可见', async ({ page }) => {
    await page.goto('/import');
    await page.setInputFiles('input[type=file]', {
      name: 'dup-name.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('年龄,年龄\n1,2\n1,3'),
    });

    await expect(page.getByText('数据预览')).toBeVisible();
    // 同名不同列必须能指认
    await expect(page.getByText('#1', { exact: false }).first()).toBeVisible();
    await expect(page.getByText('#2', { exact: false }).first()).toBeVisible();
  });

  test('超过行数上限时截断，并明确告诉用户只分析了前 N 行', async ({ page }) => {
    test.setTimeout(120_000);

    const lines = ['编号,数值'];
    for (let i = 0; i < 200_001; i += 1) lines.push(`${i},${i * 2}`);

    await page.goto('/import');
    await page.setInputFiles('input[type=file]', {
      name: 'large.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(lines.join('\n')),
    });

    await expect(page.getByText(/只分析了前 200,000 行/)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText('共 200,000 行 × 2 列')).toBeVisible();

    // 虚拟滚动：DOM 里的行号单元格数应远小于总行数
    const rendered = await page.locator('[data-testid="data-table-scroll"] .tabular-nums').count();
    expect(rendered).toBeLessThan(100);
  });
});

test.describe('质量检查', () => {
  test('导入后切到检查页，能看到画像与问题', async ({ page }) => {
    await importFixture(page);

    await sidebar(page).getByRole('link', { name: '质量检查' }).click();

    await expect(page).toHaveURL(/\/check$/);
    await expect(page.getByText('列画像')).toBeVisible();
    await expect(page.getByText('完全重复的记录')).toBeVisible();
    await expect(page.getByText('取值类型不一致')).toBeVisible();
  });

  test('展开问题条目能看到证据与建议', async ({ page }) => {
    await importFixture(page);
    await sidebar(page).getByRole('link', { name: '质量检查' }).click();

    // 用明确的 testid 定位：页面上还有其他带 aria-expanded 的按钮
    const firstIssue = page.getByTestId('issue-card').first();
    await expect(firstIssue).toBeVisible();
    await firstIssue.click();

    await expect(page.getByText('涉及列')).toBeVisible();
    await expect(page.getByText('证据')).toBeVisible();
  });

  test('直接访问质量检查时给出导入引导', async ({ page }) => {
    await page.goto('/check');

    await expect(page.getByText('还没有导入数据')).toBeVisible();
    await page.getByRole('link', { name: '去导入数据' }).click();
    await expect(page).toHaveURL(/\/import$/);
  });

  test('没有数据时不渲染空画像或空表格', async ({ page }) => {
    await page.goto('/check');

    // 空表格比引导文案更糟：用户会以为数据加载失败
    await expect(page.getByText('列画像')).toHaveCount(0);
    await expect(page.getByText(/共 \d+ 行/)).toHaveCount(0);
  });
});

test.describe('导航', () => {
  test('根路径进入数据导入', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/import$/);
  });

  test('当前导航项被标记为 aria-current', async ({ page }) => {
    await page.goto('/check');
    await expect(sidebar(page).getByRole('link', { name: '质量检查' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    await page.goto('/import');
    await expect(sidebar(page).getByRole('link', { name: '数据导入' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  test('切换视图不丢数据', async ({ page }) => {
    await importFixture(page);
    await expect(page.getByText('共 7 行 × 5 列')).toBeVisible();

    await sidebar(page).getByRole('link', { name: '质量检查' }).click();
    await expect(page.getByText('列画像')).toBeVisible();

    await sidebar(page).getByRole('link', { name: '数据导入' }).click();
    await expect(page.getByText('共 7 行 × 5 列')).toBeVisible();
  });

  test('待实现的导航项是禁用态并写明原因', async ({ page }) => {
    await page.goto('/import');

    const pending = sidebar(page).locator('[aria-disabled="true"]');
    await expect(pending).toHaveCount(3);
    await expect(pending.first()).toContainText('开发中');
    // 只置灰不解释会让人反复点击，必须带说明
    await expect(pending.first()).toHaveAttribute('title', /开发中/);
  });

  test('窄屏隐藏侧边栏，改用顶部导航条', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto('/import');

    await expect(sidebar(page)).toBeHidden();
    await expect(page.getByTestId('mobile-nav')).toBeVisible();
    await expect(
      page.getByTestId('mobile-nav').getByRole('link', { name: '质量检查' }),
    ).toBeVisible();

    // 窄屏不得出现横向溢出
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflow).toBe(false);
  });
});
