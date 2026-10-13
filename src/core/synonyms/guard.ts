import { normalizeText } from '../normalize';

/**
 * 反义与互斥护栏 —— spec §5.5.3 的「非反义模式」。
 *
 * **这一层不是优化，是让结果可用的前提。** spec §5.5.1 写明「核心风险不是漏检，
 * 而是误合并」；Task 1 的验证实验（`knowledge/reports/embedding-validation.md`）
 * 进一步给出了实测依据：不加护栏时 L3 的 Precision 最高只有 0.5400。
 *
 * 判定一律从宽：宁可把可疑对推给「待确认」，也不自动建议归并。
 * 代价是漏检 —— 而漏检只是「没帮上忙」，误合并会破坏数据。
 */

const BOOLEANISH = new Set([
  '是', '否', 'y', 'n', 'yes', 'no', 'true', 'false', 't', 'f', '有', '无', '同意', '不同意',
]);

/** 量级前缀：同一个单位带不带它，差的是 10 的整数次幂。 */
const MAGNITUDE_MARKERS = ['万', '千', '百', '亿', '兆', 'k', 'm', 'g'];

/** 去掉量级前缀，返回剩余部分；没有前缀则返回 null。 */
function withoutMagnitude(value: string): string | null {
  for (const marker of MAGNITUDE_MARKERS) {
    if (value.length > marker.length && value.startsWith(marker)) {
      return value.slice(marker.length);
    }
  }
  return null;
}

/** 去掉拉丁字母与数字后剩下的部分。 */
function templateShape(value: string): string {
  return value.replace(/[A-Za-z0-9]+/g, '');
}

/** 是否整串都是中日韩汉字。 */
function isAllCjk(value: string): boolean {
  return /^[\u4e00-\u9fff]+$/.test(value);
}

/**
 * 同一模板、只差字母或数字的取值（`A型／B型`、`mL／L`、`批次1／批次2`）。
 *
 * 这一类在 Task 1 的实测里余弦高达 **1.0000** —— 模型没有在判断语义相近，
 * 而是在给这些短串输出同一个向量。它们靠语义永远分不开，只能靠词法拦下来。
 *
 * 两边都被剥空时额外要求「都极短」：否则 `male／female` 这类纯拉丁同义词
 * 会被误挡，而那是有测试钉着的正常同义对。
 */
function isSameTemplate(a: string, b: string): boolean {
  if (a === b) return false;
  const shapeA = templateShape(a);
  const shapeB = templateShape(b);
  if (shapeA !== shapeB) return false;
  if (shapeA.length > 0) return true;
  return a.length <= 3 && b.length <= 3;
}

export function isGuardedPair(a: string, b: string): boolean {
  const left = normalizeText(a).toLowerCase();
  const right = normalizeText(b).toLowerCase();
  if (left === right) return false;

  // 1. 双方都是纯数字 —— 「1／2」不该进语义归并
  if (/^\d+(\.\d+)?$/.test(left) && /^\d+(\.\d+)?$/.test(right)) return true;

  // 2. 布尔型取值
  if (BOOLEANISH.has(left) || BOOLEANISH.has(right)) return true;

  // 3. 单字对
  if (left.length <= 1 && right.length <= 1) return true;

  // 4. 极短、同为中文、且字符集不同。
  //
  // 两个收窄都不是洁癖，各有实测依据：
  //   - `极短` 取「双方都 ≤2 字」。取到 3 字会把 `硕士／研究生`（2/3 字、无共同字符）
  //     一起挡掉，而那是 L3 存在的唯一理由 —— Task 1 实测 Recall 会从 0.30 掉到 0.12。
  //   - 只对**双方都是纯中文**的生效。`mg／毫克` 也是「两字、字符集不相交」，
  //     但它是**该归并**的单位同义对（中文名与拉丁符号），不是拼写变体。
  //     按字面套规则会把这类正常模式整片封死 —— 而它恰好是本功能要服务的场景。
  //
  // 已知边界：`已毕业／在读` 这类三字反义对不被词法护栏覆盖。它靠的是
  // 「L3 不单独触发归并」—— 那一对字面零重叠，组合决策里需要 L2 正信号的分支
  // 不会命中它。有测试记录这条边界。
  if (
    isAllCjk(left) &&
    isAllCjk(right) &&
    left.length <= 2 &&
    right.length <= 2 &&
    ![...left].some((ch) => right.includes(ch))
  ) {
    return true;
  }

  // 5. 同一单位带量级前缀（g／kg、元／万元）
  const strippedLeft = withoutMagnitude(left);
  const strippedRight = withoutMagnitude(right);
  if (strippedLeft !== null && (strippedLeft === right || strippedLeft === withoutMagnitude(right))) {
    return true;
  }
  if (strippedRight !== null && strippedRight === left) return true;

  // 6. 同一模板只差字母或数字
  if (isSameTemplate(left, right)) return true;

  return false;
}
