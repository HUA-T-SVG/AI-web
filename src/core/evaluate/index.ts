/**
 * 评测原语。
 *
 * `scoreL1` 是纯函数、平台无关（受 `src/core/platform.test.ts` 守）——
 * **它不读文件**。读 `answers.json` 是调用方（测试与报告）的事，不是 core 的事：
 * core 要能被浏览器与将来的 MCP Server 复用，在里面做文件 IO 会直接破坏那条约束。
 */
export { scoreL1 } from './scoreL1';
export type { CheckScore, DefectAnswer, L1Score } from './scoreL1';
