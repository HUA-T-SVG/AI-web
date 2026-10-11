/**
 * 把 File 读成 ArrayBuffer。
 *
 * 单独抽出来而不是直接在 store 里调 file.arrayBuffer()，是为了让 store 的
 * 测试能替换掉这一步。注意它属于生产代码，不要放进 src/test-utils ——
 * 那样会被打进生产包。
 */
export function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return file.arrayBuffer();
}
