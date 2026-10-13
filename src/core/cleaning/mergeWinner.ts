import { isMissingValue, type Dataset } from '../types';

/**
 * 归并类别时「统一成哪一个写法」的**唯一**判据。
 *
 * 为什么把它单独抽出来：这条规则有两个消费方 ——
 *
 *   1. 界面里的执行器 `cleaning/apply.ts`（真的改数据）
 *   2. 脚本生成器 `scriptgen/pandas.ts`（生成等价的 pandas 代码）
 *
 * 两边各写一遍就一定会分叉，而分叉的后果是最难发现的一类不一致：
 * **用户下载的脚本跑出来的结果与界面显示的不一样**。而这正是设计文档 §4.7
 * 「脚本生成」那一块存在的意义 —— 它必须与被复现的东西同源。
 *
 * 这不是假设：第一版实现里执行器按「出现次数最多」选、脚本按「组内第一个」选，
 * 组为 `['研究生','硕士']` 且「硕士」更常见时两者会给出**相反**的归并方向。
 * 测试没抓到它，因为测试数据里两种写法出现次数相等（并列时两者恰好都取第一个）。
 */
export function countValues(values: Dataset['columns'][number]['values']): Map<string, number> {
  const counts = new Map<string, number>();
  for (const raw of values) {
    if (isMissingValue(raw)) continue;
    const text = String(raw);
    counts.set(text, (counts.get(text) ?? 0) + 1);
  }
  return counts;
}

/**
 * 选出组内统一的写法：**出现次数最多**的那个；并列时取组内第一个。
 *
 * 并列取第一个而不是字典序：组内顺序来自模型建议或用户在界面上的排列，
 * 是可解释的；取字典序则说不出为什么选了那一个。
 *
 * 组内不足两个、或组内没有任何取值出现时返回 null —— 调用方据此**跳过这个组**，
 * 而不是随便挑一个去改。
 */
export function chooseMergeWinner(group: string[], counts: Map<string, number>): string | null {
  if (group.length < 2) return null;

  let winner: string | null = null;
  let winnerCount = -1;
  for (const variant of group) {
    const count = counts.get(variant) ?? 0;
    if (count > winnerCount) {
      winner = variant;
      winnerCount = count;
    }
  }
  return winner;
}
