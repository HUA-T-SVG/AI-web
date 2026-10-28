import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { blockSemanticModelDownload, importAndOpen, importFixture } from './helpers';

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
 * 整页加载会先经过一次「从本地暂存恢复」，那是另一条路径（由 `persistence.spec.ts`
 * 专门测），在这里会把一个用例变成验两件事。理由见 helpers.ts。
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
  // 本次分析的文件名要显示出来，证明读的是当前 store 而不是静态数据。
  // 限定在顶部文件上下文条里查：可读报告预览里也有同一个文件名，
  // 直接 page.getByText 会命中多个节点（strict mode 直接报错）
  await expect(page.getByTestId('data-context').getByText('messy-survey.csv')).toBeVisible();

  // 图表容器：ECharts 画在 canvas 上，断言容器存在 + 有无障碍标签
  const chart = page.getByTestId('chart').first();
  await expect(chart).toBeVisible();
  await expect(chart).toHaveAttribute('aria-label', /.+/);

  // 检查是异步的（Worker）。看板**不许**在检查没跑完或跑失败时给结论 ——
  // 一句绿色的「这份数据没检出问题」在那一页就等于伪造结论。
  // 具体判定由 `src/ui/lib/qualityOverview.test.ts` 钉着，这里只验接线没接反
  await expect(page.getByTestId('quality-checks-failed')).toHaveCount(0);
  await expect(page.getByTestId('quality-checks-pending')).toHaveCount(0);

  expect(errors, `控制台出现错误：\n${errors.join('\n')}`).toEqual([]);
});

test('评测指标默认折叠，展开后能看到判据与达标线', async ({ page }) => {
  await page.goto('/export');

  const panel = page.getByTestId('quality-report-panel');
  await expect(panel).toBeVisible();

  // 折叠态：只留标题 + 一行概况。指标明细此时**不可见**（注意：<details> 的子元素
  // 仍在 DOM 里，所以断言不可见而不是 count=0 —— 后者会永远失败）
  await expect(panel.getByTestId('eval-summary')).toBeVisible();
  await expect(panel.getByTestId('metric-verdict').first()).toBeHidden();

  // 展开：判据与达标标记由 public/eval/*.json 提供（scripts/sync-eval.mjs 同步），
  // 仓库里已经有这几份产物，所以可以断言它们真的被渲染
  await panel.getByText('展开查看各层指标与判据').click();
  // 判据文案必须带着 spec 出处 —— 「要求 ≥ 3000 ms（spec §2.3）」这类
  await expect(panel.getByText(/spec §2\.3 要求/).first()).toBeVisible();
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

test('整页加载导出页时，从本机暂存恢复数据不会打乱 Hook 顺序', async ({ page }) => {
  // 这条守的是一个真实缺陷：ExportPanel 曾在「没有 current」时提前 return，
  // 而 useMemo 写在 return 之后。整页加载时 current 先是 null（空状态），
  // IndexedDB 恢复完成后才变成有值 —— 两次渲染的 Hooks 数量不同，React 直接报错。
  // 其它看板用例都走客户端导航，构造不出「空状态 → 恢复后有值」这个时序。
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));

  await importFixture(page, 'messy-survey.csv');
  await page.goto('/export');

  // 先确认走的确实是「整页加载 → 从本机暂存恢复」这条路
  await expect(page.getByTestId('restore-notice')).toBeVisible();
  // 再从空状态恢复出可用的导出面板
  await expect(page.getByRole('button', { name: '清洗后数据（CSV）' })).toBeVisible();
  await expect(page.getByRole('button', { name: '处理留痕（JSON）' })).toBeVisible();

  expect(errors, `控制台出现错误：\n${errors.join('\n')}`).toEqual([]);
});

/**
 * 第三轮「可读 PDF / Word 报告」的端到端验收。
 *
 * 守五件事：
 *   1. 报告真的渲染出来，且设计文档要求的分区一个不少（含「检查结论」）；
 *   2. 检查跑完之后，结论区给出检出分布与「结论基于数据版本 vN」的口径；
 *   3. 打印按钮走的是**浏览器打印**（不是自己伪造一个 PDF 下载）；
 *   4. Word 按钮真的产出一个 `.docx` 下载；
 *   5. `@media print` 下只剩报告 —— 否则「另存为 PDF」会把导航和按钮一起打进去。
 *
 * 报告内容里的口径（删行不重复计入单元格改动、旧版本提示、检查未完成时不给结论等）
 * 由 `src/ui/lib/report.test.ts` 与 `reportDocx.test.ts` 钉着，这里只验接线。
 */

test('可读报告：分区齐全，打印按钮调用浏览器打印', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  // 无头浏览器里 window.print 会挂住；换成可观测的桩，验证按钮真的走到打印路径
  await page.addInitScript(() => {
    const marker = { calls: 0 };
    Object.defineProperty(window, '__reportPrintCalls', { value: marker });
    window.print = () => {
      marker.calls += 1;
    };
  });

  await importAndOpen(page, '报告与导出');

  const section = page.getByTestId('readable-report-section');
  await expect(section).toBeVisible();
  const report = page.getByTestId('readable-report');
  await expect(report).toBeVisible();
  await expect(report.getByText('数据处理质量报告')).toBeVisible();

  // 设计文档要求的分区：摘要 / 字段变化 / 逐步动作 / 人工决定与理由 / 遗留风险 / 版本
  await expect(report.getByTestId('report-checks')).toBeVisible();
  await expect(report.getByTestId('report-summary')).toBeVisible();
  await expect(report.getByTestId('report-fields')).toBeVisible();
  await expect(report.getByTestId('report-steps')).toBeVisible();
  await expect(report.getByTestId('report-decisions')).toBeVisible();
  await expect(report.getByTestId('report-risks')).toBeVisible();
  await expect(report.getByTestId('report-version')).toBeVisible();
  await expect(report.getByText('人工决定与理由')).toBeVisible();

  // 「检查结论」必须有自己的一段，且检查没跑完时也不允许整段消失。
  // 用 heading 定位而不是文本子串：未完成时的说明里也会出现「检查结论」四个字
  await expect(report.getByRole('heading', { name: '检查结论' })).toBeVisible();

  // 覆盖与能力边界同样要进报告：只给结论的 PDF 被带走时会被读成「都查过了」
  const coverageSection = report.getByTestId('report-coverage');
  await expect(coverageSection).toBeVisible();
  await expect(coverageSection.getByText('检查覆盖与能力边界')).toBeVisible();
  await expect(coverageSection).toContainText('跨表检查');
  await expect(coverageSection).toContainText('不代表数据没有问题');
  await expect(report).not.toContainText(/全部通过|检查合格/);

  // 本轮只导入了数据、没有跑 AI 审阅：没有人工决定不等于这两段可以留白，
  // 「没有记录」「没有遗留风险」都要写成一句能读的话（§4 报告口径）
  await expect(report.getByTestId('report-decisions')).toContainText(
    '本次分析没有留下人工决定记录。',
  );
  await expect(report.getByTestId('report-risks')).toContainText(
    '本轮没有待确认建议、被拒建议或未执行动作。',
  );

  // 数据指纹与应用版本来自同一份 provenance，不是另算一份
  await expect(report.getByText('清洗前数据指纹')).toBeVisible();
  await expect(report.getByText('应用版本')).toBeVisible();

  // 两个入口的文案必须如实描述路径：这里没有「直接生成 PDF」，只有打印
  const printButton = page.getByRole('button', { name: '打印 / 另存为 PDF' });
  await expect(printButton).toBeVisible();
  await expect(page.getByRole('button', { name: 'Word 报告（.docx）' })).toBeVisible();

  await printButton.click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __reportPrintCalls?: { calls: number } }).__reportPrintCalls
            ?.calls ?? 0,
      ),
    )
    .toBe(1);

  expect(errors, `控制台出现错误：\n${errors.join('\n')}`).toEqual([]);
});

test('可读报告：检查结论给出检出分布，并写明结论基于哪一版数据', async ({ page }) => {
  await importAndOpen(page, '报告与导出');

  const report = page.getByTestId('readable-report');
  await expect(report).toBeVisible();

  // 检查跑在 Worker 里，统计要等它跑完才出现。先等看板脱离「正在检查 / 失败」，
  // 报告里的结论区才会从「检查尚未完成」的说明变成可度量的结论
  await expect(page.getByTestId('quality-checks-pending')).toHaveCount(0);
  await expect(page.getByTestId('quality-checks-failed')).toHaveCount(0);

  const conclusion = report.getByTestId('report-checks');
  await expect(conclusion).toBeVisible();
  await expect(conclusion.getByRole('heading', { name: '检查结论' })).toBeVisible();

  // 完成态必须写清：检出多少条、严重度分布、涉及多少字段
  await expect(conclusion).toContainText(
    /检出问题 \d+ 条（严重 \d+ 条、中等 \d+ 条、轻微 \d+ 条），涉及 \d+ 个字段。/,
  );

  // 版本口径不能只是装饰：结论说自己基于哪一版，就必须是报告信息里的那一版。
  // 对不上的话，读者无从判断这条结论是不是已经随数据变更失效了
  const metaText = await report.getByTestId('report-meta').innerText();
  const version = /数据版本\s*v(\d+)/.exec(metaText)?.[1];
  expect(version, '报告信息里应有「数据版本 vN」').toBeTruthy();
  await expect(conclusion).toContainText(`结论基于数据版本 v${version}`);
});

test('可读报告：Word 按钮下载真实的 .docx', async ({ page }) => {
  await importAndOpen(page, '报告与导出');

  const wordButton = page.getByRole('button', { name: 'Word 报告（.docx）' });
  await expect(wordButton).toBeVisible();

  const [download] = await Promise.all([page.waitForEvent('download'), wordButton.click()]);

  expect(download.suggestedFilename()).toMatch(/^数据处理报告-.+\.docx$/);
  // failure() 会等到下载真正完成；有 failure 说明字节没生成成功
  expect(await download.failure()).toBeNull();
});

test('打印媒体下只保留报告，页面其余部分不输出', async ({ page }) => {
  await importAndOpen(page, '报告与导出');

  await page.emulateMedia({ media: 'print' });

  // 报告要留在打印输出里，且不能是深色底 / 固定定位
  const report = page.getByTestId('readable-report');
  await expect(report).toBeVisible();
  await expect(report).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(report).toHaveCSS('position', 'static');

  // 导航、页面标题、看板与其它导出按钮都应该从打印输出里消失
  await expect(page.getByTestId('quality-report-panel')).toBeHidden();
  await expect(page.getByRole('button', { name: '清洗后数据（CSV）' })).toBeHidden();
  await expect(page.getByRole('link', { name: '报告与导出' }).first()).toBeHidden();

  await page.emulateMedia({ media: 'screen' });
});

test('可读报告：末尾附方法草稿，预览与 .md 下载逐字同源', async ({ page }) => {
  await importAndOpen(page, '报告与导出');

  const report = page.getByTestId('readable-report');
  const draft = report.getByTestId('report-method-draft');
  await expect(draft).toBeVisible();
  await expect(draft).toContainText('一、样本与字段');
  await expect(draft).toContainText('六、依据与边界');
  // 只导入、没有执行清洗：草稿必须如实写「未执行」，不许写成已处理
  await expect(draft).toContainText('本次未执行任何清洗动作');
  // Word / Markdown 有「需要作者核对的要点」，预览也必须同源出现
  await expect(draft).toContainText('需要作者核对的要点');
  await expect(report).not.toContainText(/全部通过|检查合格/);

  const disclaimer = (await draft.getByTestId('method-draft-disclaimer').textContent())?.trim() ?? '';
  expect(disclaimer.length).toBeGreaterThan(20);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('download-method-draft').click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^数据处理方法草稿-.+\.md$/);
  const path = await download.path();
  expect(path).not.toBeNull();
  const content = readFileSync(path!, 'utf8');

  // 预览里的免责声明必须逐字出现在下载文件里：三处同源不是口号
  expect(content).toContain(disclaimer);
  expect(content).toContain('本次未执行任何清洗动作');
  expect(content).toContain('# 数据处理方法（草稿）');
});
