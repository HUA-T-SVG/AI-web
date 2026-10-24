import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { NAV_GROUPS } from '../../src/ui/lib/navigation';
import { blockSemanticModelDownload, gotoHydrated } from './helpers';

const fixtures = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const sidebar = (page: Page) => page.getByTestId('sidebar');

/**
 * 掐断端侧模型下载 —— 「导入数据 → 打开质量检查」会触发语义归并检查，
 * 不掐断就等于让这些用例依赖 huggingface.co 的连通性（见 tests/e2e/helpers.ts）。
 */
test.beforeEach(async ({ page }) => {
  await blockSemanticModelDownload(page);
});

/** 上传示例数据并等到预览出现 */
async function importFixture(page: Page, name = 'messy-survey.csv') {
  await gotoHydrated(page, '/import');
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
    await gotoHydrated(page, '/import');
    await page.setInputFiles('input[type=file]', {
      name: 'empty.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(''),
    });

    await expect(page.getByText('没法读取这个文件')).toBeVisible();
    await expect(page.getByText(/这个文件是空的/)).toBeVisible();
  });

  test('不支持的格式提示支持范围', async ({ page }) => {
    await gotoHydrated(page, '/import');
    await page.setInputFiles('input[type=file]', {
      name: 'a.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4'),
    });

    await expect(page.getByText(/只支持 .csv 和 .xlsx/)).toBeVisible();
  });

  test('重复列名的输入不误报为重复记录，且列序号可见', async ({ page }) => {
    await gotoHydrated(page, '/import');
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

    await gotoHydrated(page, '/import');
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

  test('导入失败后访问检查页，说的必须是失败而不是「还没导入」', async ({ page }) => {
    await gotoHydrated(page, '/import');
    await page.setInputFiles('input[type=file]', {
      name: 'a.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4'),
    });
    await expect(page.getByText('没法读取这个文件')).toBeVisible();

    await sidebar(page).getByRole('link', { name: '质量检查' }).click();

    // 用户刚被告知文件读不了，这里再说「你还没导入」是两件不同的事
    await expect(page.getByText('上一次导入没有成功')).toBeVisible();
    await expect(page.getByText(/只支持 .csv 和 .xlsx/)).toBeVisible();
    await expect(page.getByText('还没有导入数据')).toHaveCount(0);

    await page.getByRole('link', { name: '换一个文件' }).click();
    await expect(page).toHaveURL(/\/import$/);
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

    await gotoHydrated(page, '/import');
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
    await gotoHydrated(page, '/import');

    // 数量从导航配置推导，不写死。写死的话每启用一项都要回来改这个数字，
    // 而改数字这个动作本身不会让人去看「剩下没实现的是不是真的都标了原因」。
    const pendingHrefs = NAV_GROUPS.flatMap((group) => group.items)
      .filter((item) => item.available !== true)
      .map((item) => item.href);

    const pending = sidebar(page).locator('[aria-disabled="true"]');
    await expect(pending).toHaveCount(pendingHrefs.length);

    // Plan 3 之后五项全部实现，pendingHrefs 变成空 —— 这条规则暂时没有适用对象。
    // 不去掉它：它守的约定（未实现的功能要禁用 + 标注原因）仍然成立，
    // 一旦有人再加一个「开发中」的项，下面的分支会立刻要求他写明原因。
    if (pendingHrefs.length > 0) {
      await expect(pending.first()).toContainText('开发中');
      // 只置灰不解释会让人反复点击，必须带说明
      await expect(pending.first()).toHaveAttribute('title', /开发中/);
    } else {
      // 没有禁用项时，把另一条更有价值的事实钉住：**声称能用 = 真的能用**。
      // 侧边栏里每一项都应当是可点的链接，而不是「看起来能点、其实是灰的」
      const allItems = NAV_GROUPS.flatMap((group) => group.items);
      await expect(sidebar(page).getByRole('link')).toHaveCount(allItems.length);
    }
  });

  test('窄屏隐藏侧边栏，改用顶部导航条', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await gotoHydrated(page, '/import');

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

  test('窄屏顶部导航同样标记当前项', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto('/check');

    // 侧边栏在窄屏是 display:none，不进无障碍树，所以这条只能查顶部条
    const mobileNav = page.getByTestId('mobile-nav');
    await expect(mobileNav.getByRole('link', { name: '质量检查' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(mobileNav.locator('[aria-current="page"]')).toHaveCount(1);
  });

  test('窄屏也能看到待实现的功能，不会以为产品只有两项', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await gotoHydrated(page, '/import');

    const mobileNav = page.getByTestId('mobile-nav');
    await expect(mobileNav.getByText('AI 分析')).toBeVisible();
    await expect(mobileNav.getByText('报告与导出')).toBeVisible();
    // 产品名也要在窄屏可见
    await expect(mobileNav.getByText('科研数据质量治理')).toBeVisible();
  });

  test('侧边栏可以用键盘到达并激活', async ({ page }) => {
    await gotoHydrated(page, '/import');

    const checkLink = sidebar(page).getByRole('link', { name: '质量检查' });
    await checkLink.focus();
    await expect(checkLink).toBeFocused();

    // 焦点样式必须可见：默认 outline 在各浏览器粗细不一，项目统一用 ring
    const hasRing = await checkLink.evaluate((el) => {
      const style = getComputedStyle(el);
      return style.outlineStyle !== 'none' || style.boxShadow !== 'none';
    });
    expect(hasRing).toBe(true);

    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/check$/);
  });

  test('「去导入数据」只有一个 Tab 停靠点', async ({ page }) => {
    await page.goto('/check');

    // 把 Button 嵌进 Link 会产生 link > button 两层可聚焦元素，读屏念成「链接…按钮」
    const goImport = page.getByRole('link', { name: '去导入数据' });
    await expect(goImport).toBeVisible();
    await expect(page.getByRole('button', { name: '去导入数据' })).toHaveCount(0);
  });
});

test.describe('示例数据与字段定位', () => {
  test('首屏「体验示例数据」走完整流程，并全程标记为示例', async ({ page }) => {
    await gotoHydrated(page, '/import');
    await page.getByRole('button', { name: '体验示例数据' }).click();

    await expect(page.getByText('数据预览')).toBeVisible();
    await expect(page.getByText('共 7 行 × 5 列')).toBeVisible();
    await expect(page.getByText('当前是示例数据')).toBeVisible();
    await expect(page.getByText(/示例-科研问卷\.csv/).first()).toBeVisible();

    // 示例标记要跟到工作页：不能只在导入页说一次
    await sidebar(page).getByRole('link', { name: '质量检查' }).click();
    await expect(page.getByTestId('data-context')).toContainText('示例数据');
  });

  test('字段概况可搜索、点击定位表格列，键盘可调列宽', async ({ page }) => {
    const header = ['字段1', '字段2', '字段3', '字段4', '字段5', '字段6', '字段7', '字段8'];
    const rows = ['a,b,c,d,e,f,g,h', 'b,c,d,e,f,g,h,i', 'c,d,e,f,g,h,i,j'];
    await gotoHydrated(page, '/import');
    await page.setInputFiles('input[type=file]', {
      name: 'many-columns.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from([header.join(','), ...rows].join('\n')),
    });
    await expect(page.getByText('数据预览')).toBeVisible();

    const profile = page.getByTestId('column-profile');
    // 字段多时才有搜索框
    const search = page.getByPlaceholder('搜索字段名或列序号');
    await expect(search).toBeVisible();
    await search.fill('字段3');
    await expect(profile.getByText(/匹配 1 \/ 8 列/)).toBeVisible();
    await expect(profile.getByRole('button', { name: /字段3/ })).toHaveCount(1);
    await search.fill('');

    // 点击字段行：对应列要被标出来（并滚到视野里）
    await profile.getByRole('button', { name: /字段3/ }).click();
    await expect(page.locator('[data-column-index="3"][data-focused="true"]')).toBeVisible();

    // 列宽可调：键盘聚焦分隔条后按方向键，比鼠标拖拽稳定
    const columnHeader = page.locator('[data-column-index="3"]');
    const before = (await columnHeader.boundingBox())!.width;
    await columnHeader.getByRole('separator', { name: /字段3/ }).focus();
    await page.keyboard.press('ArrowRight');
    await expect
      .poll(async () => (await columnHeader.boundingBox())!.width)
      .toBeGreaterThan(before);
  });
});
