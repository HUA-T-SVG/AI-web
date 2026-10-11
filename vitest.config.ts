import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    // core 是纯函数包，node 环境足够；需要 DOM 的测试在 Plan 1b 单独配置
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: { '@': resolve(import.meta.dirname, 'src') },
  },
});
