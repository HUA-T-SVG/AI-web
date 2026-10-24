import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    // core 是纯函数包，node 环境足够；需要 DOM 的测试在 Plan 1b 单独配置
    environment: 'node',
    include: ['src/**/*.test.ts'],
    /**
     * 串行跑测试文件。
     *
     * `perf.test.ts` 按真实耗时断言剖析 < 3 秒；与其他文件并行时会被 CPU 竞争拖慢，
     * 历史上有过「609 个用例全过、只有 worker RPC 心跳超时」的偶发失败。
     * 全量 7 秒 → 约 20 秒，换一个不会随负载随机变红的门禁。
     */
    fileParallelism: false,
  },
  resolve: {
    alias: { '@': resolve(import.meta.dirname, 'src') },
  },
});
