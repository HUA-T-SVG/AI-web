const UTF8_BOM = [0xef, 0xbb, 0xbf];

/** 可疑字符占比超过这个比例就认为整体像乱码 */
const GARBLED_RATIO = 0.3;

/**
 * 判断文本是否像乱码。
 *
 * 两个信号：
 *   1. 替换字符 U+FFFD —— 解码失败的直接证据
 *   2. 拉丁扩展区（U+0080–U+024F）密集出现 —— GBK 中文的字节若恰好构成
 *      合法 UTF-8，就会解成这类字符。正常的科研数据表头里不该密集出现它们。
 *
 * 刻意不去猜测「扩展 A 区汉字」之类的中文区段：UTF-8 中文被按 GBK 解读
 * 产生的字（如「濮」「悕」）都落在常规 CJK 区，按区段判断命中不了。
 */
export function looksLikeGarbled(text: string): boolean {
  const sample = text.slice(0, 2000);
  if (sample.length === 0) return false;

  let suspicious = 0;
  for (const ch of sample) {
    const code = ch.codePointAt(0) ?? 0;
    if (code === 0xfffd || (code >= 0x80 && code <= 0x24f)) suspicious += 1;
  }

  return suspicious / sample.length > GARBLED_RATIO;
}

function stripBom(bytes: number[]): number[] {
  const hasBom = UTF8_BOM.every((byte, index) => bytes[index] === byte);
  return hasBom ? bytes.slice(UTF8_BOM.length) : bytes;
}

/** 严格 UTF-8 解码；字节序列不合法时返回 null */
function decodeStrictUtf8(bytes: number[]): string | null {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes));
  } catch {
    return null;
  }
}

/**
 * 按 GBK 解码。Node 需要 full ICU，浏览器原生支持；环境不支持时返回 null。
 */
function decodeGbk(bytes: number[]): string | null {
  try {
    return new TextDecoder('gbk').decode(new Uint8Array(bytes));
  } catch {
    return null;
  }
}

/**
 * 把文件字节解码为文本。
 *
 * 主判据是「字节序列是否为合法 UTF-8」：GBK 编码的中文几乎一定含有非法的
 * UTF-8 续字节（例如「名」的 GBK 字节 C3 FB 里 FB 不是合法续字节），而合法
 * 的 UTF-8 中文必然能严格解码成功。这比统计式推断更可靠，也更便宜。
 */
export function decodeBuffer(buffer: ArrayBuffer): { text: string; encoding: string } {
  if (buffer.byteLength === 0) return { text: '', encoding: 'utf-8' };

  const bytes = stripBom(Array.from(new Uint8Array(buffer)));

  const utf8Text = decodeStrictUtf8(bytes);
  if (utf8Text !== null && !looksLikeGarbled(utf8Text)) {
    return { text: utf8Text, encoding: 'utf-8' };
  }

  const gbkText = decodeGbk(bytes);
  if (gbkText !== null && !looksLikeGarbled(gbkText)) {
    return { text: gbkText, encoding: 'gbk' };
  }

  // 两种都不像正常文本，说明文件本身可能已经损坏。返回宽松解码的结果，
  // 让用户至少能看到内容，而不是拿到一句「无法识别编码」。
  return {
    text: utf8Text ?? new TextDecoder('utf-8').decode(new Uint8Array(bytes)),
    encoding: 'utf-8（疑似乱码）',
  };
}
