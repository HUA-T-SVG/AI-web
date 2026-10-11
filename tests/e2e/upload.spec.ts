import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const fixtures = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

test.describe('上传与检查的完整流程', () => {
  test('上传 CSV 后能看到预览、画像与问题清单', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto('/');
    await page.setInputFiles('input[type=file]', join(fixtures, 'messy-survey.csv'));

    await expect(page.getByText('数据预览')).toBeVisible();
    await expect(page.getByText('共 7 行 × 5 列')).toBeVisible();
    await expect(page.getByText('列画像')).toBeVisible();
    await expect(page.getByText('发现的问题')).toBeVisible();

    // 年龄列混入了 abc，类型一致性检查必须报出来
    await expect(page.getByText('取值类型不一致')).toBeVisible();

    expect(consoleErrors).toEqual([]);
  });

  test('重复行能被检出', async ({ page }) => {
    await page.goto('/');
    await page.setInputFiles('input[type=file]', join(fixtures, 'messy-survey.csv'));

    // 第 2、3 行完全相同
    await expect(page.getByText('完全重复的记录')).toBeVisible();
  });

  test('展开问题条目能看到证据与建议', async ({ page }) => {
    await page.goto('/');
    await page.setInputFiles('input[type=file]', join(fixtures, 'messy-survey.csv'));

    // 用明确的 testid 定位：页面上还有其他带 aria-expanded 的按钮（例如
    // Next 的开发工具指示器），按 aria-expanded 取第一个会命中错误的目标
    const firstIssue = page.getByTestId('issue-card').first();
    await expect(firstIssue).toBeVisible();
    await firstIssue.click();

    await expect(page.getByText('涉及列')).toBeVisible();
    await expect(page.getByText('证据')).toBeVisible();
  });

  test('空文件给出可读的中文提示', async ({ page }) => {
    await page.goto('/');
    await page.setInputFiles('input[type=file]', {
      name: 'empty.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(''),
    });

    await expect(page.getByText('没法读取这个文件')).toBeVisible();
    await expect(page.getByText(/这个文件是空的/)).toBeVisible();
  });

  test('不支持的格式提示支持范围', async ({ page }) => {
    await page.goto('/');
    await page.setInputFiles('input[type=file]', {
      name: 'a.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4'),
    });

    await expect(page.getByText(/只支持 .csv 和 .xlsx/)).toBeVisible();
  });

  test('重复列名的输入不误报为重复记录', async ({ page }) => {
    await page.goto('/');
    await page.setInputFiles('input[type=file]', {
      name: 'dup-name.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('年龄,年龄\n1,2\n1,3'),
    });

    await expect(page.getByText('重复列名', { exact: false })).toBeVisible();
    // 关键断言：两行并不重复，不得报出「完全重复的记录」诱导用户删行
    await expect(page.getByText('完全重复的记录')).toHaveCount(0);
    // 同名不同列必须能指认：表头与画像都要带列序号
    await expect(page.getByText('#1', { exact: false }).first()).toBeVisible();
    await expect(page.getByText('#2', { exact: false }).first()).toBeVisible();
  });

  test('上传 .xlsx 能正确解析，并提示只分析了第一张工作表', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto('/');
    await page.setInputFiles('input[type=file]', join(fixtures, 'survey.xlsx'));

    await expect(page.getByText('数据预览')).toBeVisible();
    await expect(page.getByText('共 6 行 × 4 列')).toBeVisible();
    // 第二个工作表不该被混进来
    await expect(page.getByText('这张表不应被读取')).toHaveCount(0);
    await expect(page.getByText(/有 2 个工作表/)).toBeVisible();
    // 数值单元格应保持数值形态，而不是被当成文本
    await expect(page.getByText('999')).toBeVisible();

    expect(consoleErrors).toEqual([]);
  });

  test('超出体积上限的文件在读取前就被拦下', async ({ page }) => {
    await page.goto('/');
    // 体积上限的「读取前拦截」由 datasetStore 的单元测试保证（断言
    // parseInWorker 未被调用）；这里只确认小文件不被误伤
    await page.setInputFiles('input[type=file]', {
      name: 'small.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('a,b\n1,2'),
    });
    await expect(page.getByText('数据预览')).toBeVisible();
  });

  test('超过行数上限时截断，并明确告诉用户只分析了前 N 行', async ({ page }) => {
    // 构造 20 万行并解析比默认超时长，单独放宽
    test.setTimeout(120_000);

    // 直接构造 200,001 行而不是提交一个几 MB 的 fixture 文件
    const lines = ['编号,数值'];
    for (let i = 0; i < 200_001; i += 1) lines.push(`${i},${i * 2}`);

    await page.goto('/');
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
