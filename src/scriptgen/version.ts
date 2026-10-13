/**
 * 应用版本。
 *
 * 与 `package.json` 的 `version` 手工保持一致 —— 客户端 bundle 里读不到
 * package.json 的字段（Next 只内联 `NEXT_PUBLIC_*` 环境变量）。
 * 这是这份留痕里唯一一处手工同步的地方，所以在留痕里它只作参考值，
 * 真正用来核对数据的是 `datasetFingerprint`。
 */
export const APP_VERSION = '0.1.0';
