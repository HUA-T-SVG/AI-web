import type { RuleIndex } from './types';

/** `scripts/sync-rules.mjs` 把构建产物拷到这里供浏览器 fetch */
const INDEX_URL = '/knowledge/rules.json';

/**
 * 加载失败时抛这个 —— 界面要能显示一句可读的原因（spec 的可用性要求），
 * 而不是白屏或者一直转圈。
 */
export class RuleIndexUnavailableError extends Error {}

let cached: Promise<RuleIndex> | null = null;

/**
 * 校验索引的形状。
 *
 * 为什么值得做：`rules.json` 是 Python 脚本生成的产物，字段名以它为准。
 * 生成脚本改了字段而这里没跟上时，`retrieveRules` 会在一个 undefined 上算出
 * 空结果 —— 看起来像「没有匹配的规则」，而不是「索引格式变了」。
 */
function assertShape(value: unknown): asserts value is RuleIndex {
  const index = value as Partial<RuleIndex>;
  const problems: string[] = [];
  if (typeof index?.dim !== 'number') problems.push('缺少 dim');
  if (typeof index?.rrfK !== 'number') problems.push('缺少 rrfK');
  if (typeof index?.topK !== 'number') problems.push('缺少 topK');
  if (!Array.isArray(index?.entries)) problems.push('缺少 entries');
  else {
    const first = index.entries[0] as Record<string, unknown> | undefined;
    if (first) {
      for (const key of ['id', '学科', '适用字段', 'entry', 'embedding', 'sparse']) {
        if (!(key in first)) problems.push(`条目缺少字段 ${key}`);
      }
    }
  }
  if (problems.length > 0) {
    throw new RuleIndexUnavailableError(
      `规则库索引格式不符（${problems.join('、')}）。它由 knowledge/tools/build-index.py 生成，` +
        '跑 `node scripts/sync-rules.mjs` 重新同步。',
    );
  }
}

async function fetchIndex(): Promise<RuleIndex> {
  let response: Response;
  try {
    response = await fetch(INDEX_URL);
  } catch (error) {
    throw new RuleIndexUnavailableError(
      `规则库加载失败（${error instanceof Error ? error.message : String(error)}）。` +
        '它需要先跑 `node scripts/sync-rules.mjs` 把索引同步到 public/。',
    );
  }
  if (!response.ok) {
    throw new RuleIndexUnavailableError(
      `规则库加载失败（HTTP ${response.status}）。它需要先跑 \`node scripts/sync-rules.mjs\`。`,
    );
  }
  const data: unknown = await response.json();
  assertShape(data);
  return data;
}

/**
 * 取索引。**结果缓存**：920 KB 的 JSON 每次检索都重下既慢又浪费，
 * 而它在一次会话内不会变。
 */
export function loadRuleIndex(): Promise<RuleIndex> {
  cached ??= fetchIndex().catch((error: unknown) => {
    // 失败不缓存：网络恢复后重试应当能成功，而不是永久卡在失败上
    cached = null;
    throw error;
  });
  return cached;
}

/** 仅供测试与「重新加载」按钮使用 */
export function resetRuleIndex(): void {
  cached = null;
}
