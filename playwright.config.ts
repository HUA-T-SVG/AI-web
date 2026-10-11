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
  retries: 0,
  reporter: [['list']],
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
