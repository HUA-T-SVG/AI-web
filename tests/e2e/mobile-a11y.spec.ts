import { test, expect, type Locator } from '@playwright/test';
import { join } from 'node:path';
import { blockSemanticModelDownload, fixturesDir, gotoHydrated } from './helpers';

/**
 * 触屏可访问性。
 *
 * 守两件在桌面宽度下看不出来的事：
 *   1. 手指点的控件至少 44px 高 —— 鼠标指针 36px 还够用，触屏上就是误触来源；
 *   2. 长描述与证据能在展开区完整读到 —— 预览是 line-clamp-2，触屏没有 hover，
 *      不能指望 title 提示补上被截掉的半句话。
 */

/** 44px 是 iOS HIG 与 WCAG 2.5.5 的同一道线，写成一个常量方便对照 */
const MIN_TOUCH_TARGET = 44;

test.beforeEach(async ({ page }) => {
  // 端侧语义模型约 25 MB，且依赖外网；拦掉后走产品自己的降级路径，
  // 检查结论仍然确定，用例不会随网络连通性变红
  await blockSemanticModelDownload(page);
  await page.setViewportSize({ width: 390, height: 844 });
});

async function expectMinTouchHeight(locator: Locator, label: string): Promise<void> {
  await expect(locator, `${label}应该可见`).toBeVisible();
  const box = await locator.boundingBox();
  // 用 boundingBox 而不是 CSS 高度：用户点到的是渲染出来的盒子
  expect(
    box?.height ?? 0,
    `${label}的点击区高度 ${box?.height ?? 0}px 不足 ${MIN_TOUCH_TARGET}px`,
  ).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
}

/** 找出预览确实被 line-clamp 截断的卡片；返回 -1 表示没有 */
async function findClampedCardIndex(cards: Locator): Promise<number> {
  const count = await cards.count();
  for (let index = 0; index < count; index += 1) {
    const preview = cards.nth(index).getByTestId('issue-description-preview');
    const isClamped = await preview.evaluate(
      (element) => element.scrollHeight > element.clientHeight + 1,
    );
    if (isClamped) return index;
  }
  return -1;
}

test('窄屏下按钮与顶部导航的点击区不小于 44px', async ({ page }) => {
  await gotoHydrated(page, '/import');

  // 桌面端这个按钮是 h-10（40px），窄屏要多出 4px 才够手指点
  await expectMinTouchHeight(page.getByRole('button', { name: '选择文件' }), '「选择文件」按钮');

  const navLinks = page.getByTestId('mobile-nav').getByRole('link');
  const linkCount = await navLinks.count();
  expect(linkCount).toBeGreaterThan(0);
  for (let index = 0; index < linkCount; index += 1) {
    await expectMinTouchHeight(navLinks.nth(index), `顶部导航第 ${index + 1} 个链接`);
  }
});

test('长描述在卡片里被截断后，展开区能看到全文与证据', async ({ page }) => {
  await gotoHydrated(page, '/import');
  await page.setInputFiles('input[type=file]', join(fixturesDir, 'messy-survey.csv'));
  await expect(page.getByText('数据预览')).toBeVisible();

  // 窄屏没有固定侧栏，走顶部导航；数据留在同一个会话的 store 里
  await page.getByTestId('mobile-nav').getByRole('link', { name: '质量检查' }).click();

  const cards = page.getByTestId('issue-card');
  await expect(cards.first()).toBeVisible();
  // 状态条消失才说明结论已定；否则清单为空会被误读成「没有可展开的卡片」
  await expect(page.getByTestId('checks-status')).toHaveCount(0);

  const clampedIndex = await findClampedCardIndex(cards);
  expect(clampedIndex, '这组脏数据里应当有被 line-clamp-2 截断的长描述').toBeGreaterThanOrEqual(0);

  const card = cards.nth(clampedIndex);
  const previewText = (await card.getByTestId('issue-description-preview').textContent())
    ?.replace(/\s+/g, ' ')
    .trim();
  expect(previewText?.length ?? 0).toBeGreaterThan(0);

  await card.click();

  const expanded = page.getByTestId('issue-expanded');
  // 点卡片既选中问题、也展开长文本；**不能**顺手把 tab 切到「判定依据」，
  // 否则列表立刻被隐藏，展开区等于白展开（这正是回归前的问题）。
  await expect(page.getByRole('tab', { name: /问题列表/ })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(expanded).toBeVisible();

  const fullDescription = expanded.getByTestId('issue-description-full');
  await expect(fullDescription).toBeVisible();
  // 展开区和预览是同一段文字：预览被截断，但 DOM 里文本本来完整，
  // 这条断言保证展开区真的把它渲染出来了，而不是只剩个标题
  await expect(fullDescription).toHaveText(previewText ?? '');
  // 展开区不能再截一次：整段高度必须装得下全文
  expect(
    await fullDescription.evaluate((element) => element.scrollHeight <= element.clientHeight + 1),
  ).toBe(true);

  await expect(expanded.getByText('证据')).toBeVisible();
  const evidenceValues = expanded.getByTestId('issue-evidence-value');
  const evidenceCount = await evidenceValues.count();
  expect(evidenceCount).toBeGreaterThan(0);
  for (let index = 0; index < evidenceCount; index += 1) {
    // 证据值可能是长串取值，必须允许换行；否则 390px 下会把卡片撑出横向滚动
    expect(
      await evidenceValues.nth(index).evaluate((element) => getComputedStyle(element).overflowWrap),
    ).toBe('break-word');
  }
});
