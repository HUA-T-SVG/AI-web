import { test, expect } from '@playwright/test';
import { blockSemanticModelDownload, importAndOpen } from './helpers';

/**
 * 指标看板（`/export`）的端到端验收。
 *
 * 守四件事：
 *   1. 看板真的渲染出来（不是只在类型层面存在）
 *   2. **每个指标都带着判据与达标线** —— 这是看板存在的前提，
 *      没有判据的数字读不出好坏
 *   3. 图表容器渲染（ECharts 在无数据/有数据两条路上都不能抛错）
 *   4. 没有控制台错误
 *
 * 第 2 条是这一页最容易退化的地方：把「Precision 93.3%」单独摆出来很好看，
 * 但读者无法判断它算好还是算差。所以断言里直接查「达标 / 未达标」与判据文案。
 *
 * **需要数据的那几个用例走客户端导航**（`importAndOpen`）而不是 `page.goto()`：
 * 数据在内存 store 里，整页重新加载会清空它。理由见 helpers.ts。
 */
test.beforeEach(async ({ page }) => {
  await blockSemanticModelDownload(page);
});

test('看板在未导入数据时也给出引导，而不是空白', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await page.goto('/export');

  await expect(page.getByTestId('quality-report-panel')).toBeVisible();
  await expect(page.getByRole('heading', { name: '数据质量概览' })).toBeVisible();
  // 没有数据时要给出下一步，而不是留一块空白
  await expect(page.getByText('还没有载入数据')).toBeVisible();
  await expect(page.getByRole('heading', { name: '系统准确率（各层评测）' })).toBeVisible();

  expect(errors, `控制台出现错误：\n${errors.join('\n')}`).toEqual([]);
});

test('导入数据后看板显示本次分析的质量概览与图表', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await importAndOpen(page, '报告与导出');

  // 概览四项：规模、检出问题、高优先级、处理动作
  const overview = page.getByTestId('quality-overview');
  await expect(overview.getByText('数据规模')).toBeVisible();
  await expect(overview.getByText('检出问题')).toBeVisible();
  // 规模只匹配概览里那一个 `dd`：不加范围会同时命中评测描述里的
  // 「1002 行 × 12 列」，strict mode 直接报两个元素
  await expect(overview.getByText(/^\d+ 行 × \d+ 列$/)).toBeVisible();
  // 本次分析的文件名要显示出来，证明读的是当前 store 而不是静态数据
  await expect(page.getByText('messy-survey.csv')).toBeVisible();

  // 图表容器：ECharts 画在 canvas 上，断言容器存在 + 有无障碍标签
  const chart = page.getByTestId('chart').first();
  await expect(chart).toBeVisible();
  await expect(chart).toHaveAttribute('aria-label', /.+/);

  expect(errors, `控制台出现错误：\n${errors.join('\n')}`).toEqual([]);
});

test('评测指标带着判据与达标线显示', async ({ page }) => {
  await page.goto('/export');

  const panel = page.getByTestId('quality-report-panel');
  await expect(panel).toBeVisible();
  await expect(panel.getByText(/spec §2\.3 要求/).first()).toBeVisible();

  // 评测结论由 public/eval/*.json 提供（scripts/sync-eval.mjs 同步），
  // 仓库里已经有这几份产物，所以这里可以断言「判据 + 达标标记」真的被渲染
  await expect(panel.getByText(/要求 ≥/).first()).toBeVisible();
  await expect(panel.getByTestId('metric-verdict').first()).toBeVisible();

  // 未覆盖的部分必须能在界面上读到，而不是只写在报告里
  await expect(panel.getByText(/这一层没覆盖什么/).first()).toBeVisible();
});

test('看板不影响同一页的导出功能', async ({ page }) => {
  await importAndOpen(page, '报告与导出');

  // 看板在上、导出在下，两者共存。导出按钮的文案取自 ExportPanel
  // （三样产出 + 撤销），不另猜名称
  await expect(page.getByTestId('quality-report-panel')).toBeVisible();
  await expect(page.getByRole('button', { name: '清洗后数据（CSV）' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'pandas 脚本' })).toBeVisible();
});
