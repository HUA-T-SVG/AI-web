import { MAX_FILE_BYTES, type ParseError } from './types';

/**
 * 体积超限的错误。
 *
 * 独立成模块（而不是放在 parser/index）是为了让入口页面只拿到这个纯函数：
 * index 会静态引入 papaparse / read-excel-file，入口组件若从 index 取它，
 * 整个解析库就会被打进首屏包。
 *
 * 抽成函数是为了让调用方能在**读取文件之前**就用 file.size 判定 ——
 * 等到读完再检查，800MB 的文件会先把内存吃掉，与「避免把浏览器拖死」
 * 的初衷相反。
 */
export function fileTooLargeError(fileSize: number): ParseError {
  const limitMb = Math.round(MAX_FILE_BYTES / 1024 / 1024);
  const actualMb = (fileSize / 1024 / 1024).toFixed(1);
  return {
    kind: 'file-too-large',
    message: `文件有 ${actualMb} MB，超过 ${limitMb} MB 的上限。建议先在 Excel 里拆分成多个文件。`,
  };
}
