/**
 * 脚本生成与处理留痕（设计文档 §4.7 / §6.5）。
 *
 * 与 `core` 一样是平台无关的纯逻辑：不碰 DOM、不碰文件系统，只拼字符串。
 * 它要能在用户自己的环境里跑起来，「可复现」才有意义。
 */
export { buildPandasScript } from './pandas';
export { toCsv } from './csv';
export { buildProvenance, datasetFingerprint } from './provenance';
export { APP_VERSION } from './version';
export type { ProvenanceInput } from './provenance';
export type { Provenance, ProvenanceEnvironment, ProvenanceStep, ScriptInput } from './types';
