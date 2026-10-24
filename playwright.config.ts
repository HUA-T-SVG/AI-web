import { defineConfig, devices } from '@playwright/test';

/**
 * 端到端测试。
 *
 * 浏览器缓存位置由环境变量 PLAYWRIGHT_BROWSERS_PATH 决定，本机固定为
 * D:\ms-playwright（开发机 C 盘空间紧张）。运行前需要设置：
 *
 *   $env:PLAYWRIGHT_BROWSERS_PATH='D:\ms-playwright'
 *
 * 其他机器上用默认位置即可，不需要设这个变量。
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  /**
   * 串行执行。
   *
   * 原先用默认多 worker：多个页面同时首访新路由时，Next dev 要并行编译，
   * 再叠加每个页面各建一个检查 Worker —— 冷启动实测会把「计算列画像」
   * 拖到十几秒，表现为 4–16 条随机超时（重跑又全绿）。串行慢一些（约 2 分钟），
   * 但门禁的结论是稳定的。
   */
  workers: 1,
  retries: 0,
  reporter: [['list']],
  /**
   * 首次访问新路由时 Next dev 要现场编译，冷启动的第一次全量跑会把
   * 「5 秒内没看到预览」误判成产品失败（实测首批 15–16 条假红，重跑全绿）。
   * 15 秒只影响等待时长；产品断言本身没有放宽。
   */
  expect: { timeout: 15_000 },
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
