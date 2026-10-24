import { expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/** E2E 参照数据所在目录。`import.meta.url` 是唯一可靠的定位方式（工作目录会变）。 */
export const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

/**
 * 让端侧语义模型**确定性地加载不出来**，从而走降级路径。
 *
 * **两处都要拦**：
 *   - 远端 `huggingface.co` / `hf-mirror.com` —— 历史上模型是从这里拉的
 *   - **同源 `/models/`** —— 现在模型由 `scripts/fetch-model.mjs` 在 prebuild 时下到
 *     `public/models/`，运行时同源读取。开发机上只要跑过一次 `pnpm build`，那个目录
 *     就存在；不拦的话这些用例会真的把 23 MB 模型加载起来（慢几秒，且无法断言降级文案）
 *
 * **为什么默认要拦**：不拦的话每个「导入 → 检查」用例都要加载模型 + 跑推理，
 * 测试又慢又依赖第三方站点。曾经因为依赖 huggingface.co 的连通性，
 * `net::ERR_CONNECTION_RESET` 让「无控制台错误」随机变红 —— 单次绿、连跑红，
 * 一个会随网络随机变红的门禁等于没有门禁。
 *
 * 拦掉之后走的正是**产品自己的降级路径**，而且它有单测与 E2E 同时守着：
 * 界面必须明示「语义归并不可用……没有被检查」。所以这不是绕开功能，
 * 而是把「模型不可用」变成确定性输入。
 *
 * **什么情况下要放开**：要验证真实模型加载与语义归并时（例如演示前的冒烟）。
 * 做法是不调用本函数 —— 那时请接受它依赖构建产物。
 *
 * 用「200 + 空体」而不是 404 或 `abort()`：后两者会让**浏览器自己**在控制台
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
  // 只拦模型目录，别把页面自身的请求一起拦了
  await page.route('**/models/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '' }),
  );
}

/**
 * 等到 React 真正挂载（事件监听器已生效）。
 *
 * 只等 DOM 会出现一个很隐蔽的假红：上传按钮在 SSR HTML 里已经存在，
 * `setInputFiles` 在 hydration 之前触发 change，监听器还没挂上，文件被静默丢掉。
 * 冷启动的 Next dev 编译能把这段窗口拉长到十几秒，于是表现为「随机看不到数据预览」；
 * 应用在 `EmbeddingPrefetch` 的 effect 里写了 `data-app-hydrated` 作为信号。
 */
export async function waitForAppHydrated(page: Page): Promise<void> {
  await page.waitForFunction(
    () => document.documentElement.dataset.appHydrated === 'true',
    undefined,
    { timeout: 30_000 },
  );
}

/** 进入页面并等 hydration 完成，再继续操作。 */
export async function gotoHydrated(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await waitForAppHydrated(page);
}

/** 上传一份参照数据并等到预览出现。 */
export async function importFixture(page: Page, name = 'messy-survey.csv'): Promise<void> {
  await gotoHydrated(page, '/import');
  await page.setInputFiles('input[type=file]', join(fixturesDir, name));
  await expect(page.getByText('数据预览')).toBeVisible();
}

/**
 * 上传数据后**用客户端导航**进入目标页。
 *
 * **为什么不用 `page.goto()`**：它是整页重新加载。从 Plan 4 Task 7 起，整页加载会
 * 从 IndexedDB 恢复上次的数据（见 `src/ui/lib/datasetCache.ts`），所以数据未必丢 ——
 * 但那条路会额外经过一次「恢复」，界面上多出「已恢复上次导入的数据」提示条，
 * 而且时序不同：`save` 是异步落盘的，`goto()` 紧跟上传时可能还没写完。
 *
 * 所以：要验证「同一次会话里切页不丢数据」的用例，就照产品的实际用法走客户端导航；
 * 「刷新后还在」这件事由 `persistence.spec.ts` 专门测。一个用例只该验一件事。
 *
 * 这里原先写着「数据存在 Zustand 内存 store 里，`goto()` 一刷 store 就空了」——
 * 那句话在 Task 7 之后不再成立。做法仍然对，但理由换了，注释跟着改，
 * 否则下一个人会照着一句不成立的话去推结论。
 */
export async function importAndOpen(
  page: Page,
  menuName: string,
  fixture = 'messy-survey.csv',
): Promise<void> {
  await importFixture(page, fixture);
  await page.getByRole('link', { name: menuName }).first().click();
  await expect(page.getByTestId('quality-report-panel')).toBeVisible();
}
