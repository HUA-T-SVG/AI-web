const UTF8_BOM = [0xef, 0xbb, 0xbf];
const UTF16LE_BOM = [0xff, 0xfe];
const UTF16BE_BOM = [0xfe, 0xff];

/** 替换字符占比超过此值就认为该候选不可用 */
const GARBLED_RATIO = 0.1;

export interface DecodedText {
  text: string;
  encoding: string;
  /** 两个候选解码结果都不干净，内容可能不可靠，调用方应提示用户 */
  suspicious: boolean;
}

function replacementRatio(text: string): number {
  const sample = text.slice(0, 2000);
  if (sample.length === 0) return 0;
  let replacements = 0;
  for (const ch of sample) {
    if (ch === '\uFFFD') replacements += 1;
  }
  return replacements / sample.length;
}

/**
 * 判断文本是否像乱码。
 *
 * 判据只有一条：替换字符 U+FFFD 的占比。**刻意不去猜字符区段** ——
 * UTF-8 中文被按 GBK 解读产生的字（如「濮」「悕」）都落在常规 CJK 区，
 * 按区段判断命中不了；而拉丁扩展字符密集的正常文本（café、Über）又会
 * 被区段判断误伤。
 */
export function looksLikeGarbled(text: string): boolean {
  return replacementRatio(text) > GARBLED_RATIO;
}

function startsWith(bytes: readonly number[], prefix: readonly number[]): boolean {
  return prefix.every((byte, index) => bytes[index] === byte);
}

/**
 * 按 BOM 解码。
 *
 * 记事本「Unicode」与 Excel「Unicode 文本」导出的 CSV 是 UTF-16 且带 BOM，
 * 而 BOM 直接确定了编码，不属于「猜测」。不处理它的话，UTF-16 文件会被
 * 当成单字节编码解出一屏乱码，且没有任何提示。
 */
function decodeByBom(raw: readonly number[]): DecodedText | null {
  const rest = raw.slice(2);

  if (startsWith(raw, UTF16LE_BOM)) {
    const text = new TextDecoder('utf-16le').decode(new Uint8Array(rest));
    return { text, encoding: 'utf-16le', suspicious: looksLikeGarbled(text) };
  }
  if (startsWith(raw, UTF16BE_BOM)) {
    const text = new TextDecoder('utf-16be').decode(new Uint8Array(rest));
    return { text, encoding: 'utf-16be', suspicious: looksLikeGarbled(text) };
  }
  return null;
}

/** 严格 UTF-8 解码；字节序列不合法时返回 null */
function decodeStrictUtf8(bytes: readonly number[]): string | null {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes));
  } catch {
    return null;
  }
}

/** 按 GBK 解码。Node 需要 full ICU，浏览器原生支持；环境不支持时返回 null */
function decodeGbk(bytes: readonly number[]): string | null {
  try {
    return new TextDecoder('gbk').decode(new Uint8Array(bytes));
  } catch {
    return null;
  }
}

/**
 * 把文件字节解码为文本。
 *
 * 判定顺序：
 *   1. BOM —— 编码由字节头唯一确定，直接采信
 *   2. 严格 UTF-8 解码成功 —— 直接采信，不再用可疑占比推翻它
 *   3. 严格解码失败 —— 算出 UTF-8 宽松解码与 GBK 两个候选，按替换字符
 *      占比取更干净的那个；都脏就标记可疑，交由上层提示用户
 *
 * 第 3 步必须比较两个候选而不是一票否决成 GBK：一次严格解码失败只说明
 * 文件里有非法字节，不代表整份文件是 GBK。单个坏字节不该让整篇内容
 * 变成「濮撳悕」式的乱码 —— 而 GBK 解码器对任意字节都能「成功」。
 */
export function decodeBuffer(buffer: ArrayBuffer): DecodedText {
  if (buffer.byteLength === 0) return { text: '', encoding: 'utf-8', suspicious: false };

  const raw = Array.from(new Uint8Array(buffer));

  const byBom = decodeByBom(raw);
  if (byBom !== null) return byBom;

  const bytes = startsWith(raw, UTF8_BOM) ? raw.slice(UTF8_BOM.length) : raw;

  const strict = decodeStrictUtf8(bytes);
  if (strict !== null) return { text: strict, encoding: 'utf-8', suspicious: false };

  const candidates: { text: string; encoding: string }[] = [
    { text: new TextDecoder('utf-8').decode(new Uint8Array(bytes)), encoding: 'utf-8' },
  ];
  const gbkText = decodeGbk(bytes);
  if (gbkText !== null) candidates.push({ text: gbkText, encoding: 'gbk' });

  const clean = candidates.filter((candidate) => !looksLikeGarbled(candidate.text));
  if (clean.length > 0) {
    // 都干净时优先 UTF-8：它的候选来自「同一份字节按 UTF-8 宽松解码」，
    // 而 GBK 对任意字节都能解出东西，可信度反而更低
    const chosen = clean.find((candidate) => candidate.encoding === 'utf-8') ?? clean[0];
    if (chosen !== undefined) {
      return { text: chosen.text, encoding: chosen.encoding, suspicious: false };
    }
  }

  const best = candidates.reduce((a, b) =>
    replacementRatio(a.text) <= replacementRatio(b.text) ? a : b,
  );
  return { text: best.text, encoding: `${best.encoding}（疑似乱码）`, suspicious: true };
}
