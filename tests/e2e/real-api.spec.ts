import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { gotoHydrated } from './helpers';

const fixtures = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

/**
 * 真实调用大模型的联调测试。
 *
 * 默认跳过，因为它会花钱，而且网络抖动会让门禁随机变红 ——
 * 到时候分不清是「代码坏了」还是「网断了」。需要时手动跑：
 *
 *   $env:REAL_API='1'; pnpm test:e2e tests/e2e/real-api.spec.ts
 *
 * 它的主要价值不是断言，而是**证伪**：默认 mock 走的是手写的 SSE 框架，
 * 一旦怀疑消息组装有问题，只有真接口才能分清是应用的问题还是 mock 的问题。
 * 之前两条 Critical（工具结果把原始数据带出去、单次载荷过大导致工具输入流不完）
 * 都是靠它定性的。
 */
test.skip(process.env.REAL_API !== '1', '真实调用需要 REAL_API=1 与已配置的 .env.local');

async function importFixture(page: Page) {
  await gotoHydrated(page, '/import');
  await page.setInputFiles('input[type=file]', join(fixtures, 'messy-survey.csv'));
  await expect(page.getByText('数据预览')).toBeVisible();
}

/**
 * 等到某段文本不再变化。
 *
 * 不能拿「开始分析按钮恢复可用」当完成信号：提交后输入框被清空，
 * 而空输入本来就会让按钮保持禁用，那个条件永远不成立（写错过一次）。
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
    .fill('只跑一次检查，然后提交 1 条问题即可，各项都写得简短一些。');
  await page.getByRole('button', { name: '开始分析' }).click();

  // 先等助手消息真的出现，再等整块内容稳定。
  //
  // 这里原先等的是 `text=/^DEBUG 共/` —— 那段调试代码后来被删了，于是
  // 这条测试每次空转满 240 秒然后「通过」，什么都没验证。教训是：
  // 测试等的东西必须是产品里真实存在的，否则它会在无声无息中失效。
  await expect(page.getByText('分析助手')).toBeVisible({ timeout: 180_000 });
  const mainText = await waitUntilStable(page, 'main');

  const toolLines = mainText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.includes('·'));
  const reviewItems = await page.getByTestId('issue-review').getByRole('listitem').count();

  console.log('REAL-工具行>>>' + JSON.stringify(toolLines));
  console.log('REAL-审阅卡片数>>>' + reviewItems);
  console.log('REAL-控制台错误>>>' + JSON.stringify(consoleErrors));
  console.log('REAL-正文长度>>>' + mainText.length);

  // 真的断言，而不是只打日志：
  // 模型必须在浏览器里调过工具 —— 这是「原始数据不出本机」那条架构的证据
  expect(toolLines.length, '模型一次工具都没调，链路没跑通').toBeGreaterThan(0);
  // 工具结果要能回填（卡住的话既没有工具行也没有卡片）
  expect(mainText).toContain('提交问题清单');
  expect(consoleErrors).toEqual([]);
});
