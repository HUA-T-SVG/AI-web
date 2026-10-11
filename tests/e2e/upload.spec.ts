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
  });
});
