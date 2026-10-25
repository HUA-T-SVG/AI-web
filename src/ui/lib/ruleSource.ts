/**
 * 从知识库「来源」文本里取出可核对的元信息。
 *
 * 2026-10-25 团队交付的多学科扩展版把「来源」写成三段：
 *
 *   依据名称（如 pandas 官方文档：read_csv）
 *   https://…（公开可点开的文档）
 *   核对日期：2026-10-25
 *
 * 这行 URL 与核对日期就是设计文档 P55 要的「来源链接、核验日期可直接核对」。
 * 把它们从正文里解析出来单独展示，比让人在长文本里找链接更接近「可核对」；
 * 解析不到时界面照旧显示「未提供」，**不猜、不补**。
 */

export interface SourceMeta {
  /** 第一个 http(s) 链接；没有就是 null */
  url: string | null;
  /** 「核对日期：YYYY-MM-DD」里的日期；没有就是 null */
  verifiedAt: string | null;
}

/**
 * 取第一个 URL。
 *
 * 需要剥掉紧跟其后、属于中文句读的字符：知识库里有「…/api.html）」这类写法，
 * 把右括号带进 href 会让链接 404。截断只针对句末标点与包裹符号，不影响路径本身。
 */
function firstUrl(source: string): string | null {
  const match = source.match(/https?:\/\/[^\s<>"'）)】」』]+/);
  if (!match) return null;
  return match[0].replace(/[，。；、]+$/, '');
}

/** 「核对日期：2026-10-25」——全角/半角冒号都接受
 *
 * 178 条扩展版里日期行有三种写法：核对日期（56 条）、资料查阅日期（64 条）、
 * 复核日期（1 条）。它们都表示「团队什么时候看过这条来源」，界面统一显示成
 * 核验日期 —— 只认其中一种会让 65 条明明写了日期的条目显示「未提供」。
 */
const VERIFIED_AT_PATTERN = /(?:核对|资料查阅|复核)日期[：:]\s*(\d{4}-\d{2}-\d{2})/;

function verifiedAtOf(source: string): string | null {
  const match = source.match(VERIFIED_AT_PATTERN);
  return match ? (match[1] ?? null) : null;
}

export function extractSourceMeta(source: string | null | undefined): SourceMeta {
  if (!source) return { url: null, verifiedAt: null };
  return { url: firstUrl(source), verifiedAt: verifiedAtOf(source) };
}
