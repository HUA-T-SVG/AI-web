import { expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/** E2E 参照数据所在目录。`import.meta.url` 是唯一可靠的定位方式（工作目录会变）。 */
export const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

/**
 * 掐断端侧语义模型的下载（huggingface.co / hf-mirror.com）。
 *
 * **为什么 E2E 默认要掐断它**：不掐断的话，每个「导入数据 → 打开质量检查」
 * 的用例都会真的去下载 25 MB 模型，测试于是**依赖第三方站点的连通性**。
 * 实测后果：`net::ERR_CONNECTION_RESET` 记进浏览器控制台，让
 * 「无控制台错误」这条断言随机变红 —— 单次跑绿、连跑必红，且与本轮代码改动无关
 * （对照过：基线与改动后的失败是同一条 URL、同样的次数）。
 * 一个会随网络随机变红的门禁等于没有门禁。
 *
 * 掐断之后走的正是**产品自己的降级路径**，而且它是被设计出来、有单测与
 * E2E 同时守着的一条路：界面必须明示「语义归并不可用……没有被检查」。
 * 所以这不是「绕开功能」，而是把「网络不可用」这个真实场景变成确定性输入。
 *
 * **什么情况下要放开**：要验证真实模型加载与语义归并时（例如演示前的联网冒烟）。
 * 做法是不调用本函数 —— 那时请接受这条断言依赖网络。
 *
 * 用「200 + 空体」而不是 404 或 `abort()`：后两者都会让**浏览器自己**在控制台
 * 记一条「Failed to load resource」，而「无控制台错误」是各 spec 都在守的断言 ——
 * 那条消息是测试自己制造的噪音，混进来就分不清真实问题与它。
 * 空体让失败发生在**应用层**（拿到的东西解析不出模型），与
 * 「模型文件损坏 / 下载不完整」是同一种失败，同样走到降级分支，且控制台干净。
 */
export async function blockSemanticModelDownload(page: Page): Promise<void> {
  const remoteModel = /^https?:\/\/[^/]*(huggingface\.co|hf-mirror\.com)/;
  await page.route(remoteModel, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '' }),
  );
}

/** 上传一份参照数据并等到预览出现。 */
export async function importFixture(page: Page, name = 'messy-survey.csv'): Promise<void> {
  await page.goto('/import');
  await page.setInputFiles('input[type=file]', join(fixturesDir, name));
  await expect(page.getByText('数据预览')).toBeVisible();
}

/**
 * 上传数据后**用客户端导航**进入目标页。
 *
 * **必须用客户端导航，不能用 `page.goto()`**：数据存在 Zustand 内存 store 里，
 * 而 `goto()` 是整页重新加载 —— 一刷 store 就空了。踩过一次：用 `goto('/export')`
 * 时看板显示「还没有载入数据」，看起来像看板读不到当前分析，其实是导航方式把
 * 数据清掉了；改成点链接就正常。
 *
 * **这不是产品的缺陷**：整页刷新丢掉未持久化的分析结果，是当前有意的取舍
 * （数据不出浏览器、也不落盘），而产品从未承诺「刷新后还在」。
 * 所以测试要按产品实际的工作方式走 —— 否则会去修一个不存在的问题。
 */
export async function importAndOpen(page: Page, menuName: string, fixture = 'messy-survey.csv'): Promise<void> {
  await importFixture(page, fixture);
  await page.getByRole('link', { name: menuName }).first().click();
  await expect(page.getByTestId('quality-report-panel')).toBeVisible();
}
