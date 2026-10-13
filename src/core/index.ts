/**
 * core —— 平台无关的数据质量检查引擎。
 *
 * 本包不引用任何浏览器 API 与 Node API，因此同一份实现可以运行在：
 *   - 浏览器 Web Worker 中（产品默认的执行位置）
 *   - Node 进程中（MCP Server 复用）
 *
 * 这条约束来自设计文档 §3.4 的架构决策 —— 它保证「界面上看到的检查结果」
 * 与「导出脚本的执行结果」不会因为两套实现而产生分歧。修改前请先确认影响。
 */

export * from './types';
export * from './numeric';
export * from './normalize';
export * from './stats';
export * from './profile';
export * from './synonyms';
export * from './checks';
export * from './cleaning';
