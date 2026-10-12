import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const fixtures = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

/**
 * 真实调用大模型的联调测试。
 *
 * 默认跳过，因为它会花钱，而且网络抖动会让门禁随机变红 ——
 * 到时候分不清是「代码坏了」还是「网断了」。
 * 需要时手动跑：
 *
 *   $env:REAL_API='1'; pnpm test:e2e tests/e2e/real-api.spec.ts
 *
 * 它的主要价值不是断言，而是**证伪**：默认 mock 走的是手写的 SSE 框架，
 * 一旦怀疑消息组装有问题，只有真接口才能分清是应用的问题还是 mock 的问题。
 */
test.skip(process.env.REAL_API !== '1', '真实调用需要 REAL_API=1 与已配置的 .env.local');

async function importFixture(page: Page) {
  await page.goto('/import');
  await page.setInputFiles('input[type=file]', join(fixtures, 'messy-survey.csv'));
  await expect(page.getByText('数据预览')).toBeVisible();
}

/**
 * 等到某段文本不再变化。
 *
 * 不能拿「开始分析按钮恢复可用」当完成信号：提交后输入框被清空，
 * 而空输入本来就会让按钮保持禁用，那个条件永远不成立（写错过一次，
 * 白等了 3 分钟）。
 */
async function waitUntilStable(
  page: Page,
  selector: string,
  quietMs = 5_000,
  timeoutMs = 240_000,
): Promise<string> {
  const started = Date.now();
  let previous = '';
  let lastChange = Date.now();

  while (Date.now() - started < timeoutMs) {
    const current = await page
      .locator(selector)
      .innerText()
      .catch(() => '');
    if (current !== previous) {
      previous = current;
      lastChange = Date.now();
    } else if (Date.now() - lastChange > quietMs && current.trim() !== '') {
      return current;
    }
    await page.waitForTimeout(500);
  }
  return previous;
}

test('真实跑通一次完整分析', async ({ page }) => {
  test.setTimeout(300_000);

  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  await importFixture(page);
  await page.getByTestId('sidebar').getByRole('link', { name: 'AI 分析' }).click();

  await page
    .getByPlaceholder(/这份问卷数据/)
    .fill('只跑一次检查，然后提交 1 条问题即可。description 与 rationale 都控制在 15 字以内，不要多查。');
  await page.getByRole('button', { name: '开始分析' }).click();

  // 先等助手消息真的出现。不等的话，稳定性判断会在「只有用户消息」时
  // 就认定「没变化」，拿到一个请求都还没回来的快照（踩过一次）
  await expect(page.getByText('分析助手')).toBeVisible({ timeout: 180_000 });

  const structure = await waitUntilStable(page, 'text=/^DEBUG 共/');

  console.log('REAL-STRUCTURE>>>' + structure);
  console.log('REAL-提交工具出现次数>>>' + (await page.getByText('提交问题清单').count()));
  console.log('REAL-审阅卡片>>>' + (await page.getByText('发现的问题').count()));
  console.log('REAL-未确认提示>>>' + (await page.getByText(/还有 \d+ 条未确认/).count()));
  console.log('REAL-控制台错误>>>' + JSON.stringify(consoleErrors));

  // 工具部分的完整文案，含失败原因 —— 校验没过时唯一能看到线索的地方
  const toolLines = (await page.locator('main').innerText())
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.includes('·'));
  console.log('REAL-工具行>>>' + JSON.stringify(toolLines));

  // 断言只保留最低限度：真的产生了一条助手消息
  await expect(page.getByText('分析助手').first()).toBeVisible();
});
