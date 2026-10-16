/**
 * 端侧 embedding 验证实验（设计文档 §5.5.6）。
 *
 * 独立于产品：只回答一个问题 —— bge-small-zh 能不能支撑「类别同义归并」。
 * 结论与阈值写进 knowledge/reports/embedding-validation.md。
 *
 * 为什么是 Node 而不是 Python（计划里原本写的是 sentence-transformers）：
 *   1. sentence-transformers 要拉 torch，几 GB；本机 PyPI 直连被重置，只能走镜像
 *   2. **更重要的**：Transformers.js 正是产品要用的后端。用别的后端扫出来的阈值
 *      按 spec §5.5.4 第五步必须重扫 —— 那等于这一步的结论作废
 *   3. 它本来就是 Task 4 要加的依赖，一次投入两处受益
 *   代价：与 knowledge/tools/ 下其它 Python 脚本惯例不一致。补偿是自测入口
 *   保持一致（--self-test），且这一处偏离已记进 ledger。
 *
 * 用法（本机必须带 --use-system-ca，原因见 TLS_TIP）：
 *     node --use-system-ca knowledge/tools/validate-embedding.mjs --self-test
 *     node --use-system-ca knowledge/tools/validate-embedding.mjs --run
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { renderLabels } from './build-labels.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const KNOWLEDGE = resolve(HERE, '..');
const LABELS_PATH = resolve(KNOWLEDGE, 'labels/synonym-labels.json');
const REPORT_PATH = resolve(KNOWLEDGE, 'reports/embedding-validation.md');

/** 单位说明：负例必须显著多于正例（spec §5.5.4），否则 Precision 会被高估。 */
const MIN_NEGATIVE_RATIO = 2;

/** 阈值扫描范围与步长，照 spec §5.5.4 第三步。 */
const SCAN_FROM = 0.5;
const SCAN_TO = 0.99;
const SCAN_STEP = 0.01;

/** 主指标门槛（spec §5.5.4 第二步：Precision 优先，因为误报比漏报贵得多）。 */
const TARGET_PRECISION = 0.95;
/** 「待确认」区间的下界要求，比直接归并严得多。 */
const REVIEW_PRECISION = 0.99;

const TLS_TIP =
  '本机 Node 自带的 CA 包不认证书链（与交接说明里 git 改用 schannel 同一个根因）。' +
  '加 --use-system-ca 走系统证书库即可：node --use-system-ca knowledge/tools/validate-embedding.mjs';

// ---------------------------------------------------------------------------
// 标注集
// ---------------------------------------------------------------------------

export function loadLabels(path = LABELS_PATH) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/**
 * 校验标注集，返回问题清单（空数组表示通过）。
 *
 * 比计划里的版本多一条检查：**一对取值必须落在同一个字段里**。
 * 理由不是洁癖 —— 真实扫描是在一列内部两两比较的，跨字段的取值对
 * （如「硕士／男性」）根本不会成为候选。它们混进来只会用大量平凡负例
 * 把 Precision 抬高，让阈值看起来比实际安全。
 */
export function validateLabels(labels) {
  const problems = [];
  const fieldOf = new Map();
  for (const field of labels.fields) {
    for (const value of field.values) {
      if (!fieldOf.has(value)) fieldOf.set(value, []);
      fieldOf.get(value).push(field.name);
    }
  }

  const key = (pair) => [...pair].sort().join('\u0000');

  for (const name of ['positivePairs', 'negativePairs']) {
    for (const pair of labels[name]) {
      if (pair.length !== 2) {
        problems.push(`${name} 里有一对不是两个取值：${JSON.stringify(pair)}`);
        continue;
      }
      const [left, right] = pair;
      if (!fieldOf.has(left)) problems.push(`${name} 里的「${left}」不在任何字段的取值里`);
      if (!fieldOf.has(right)) problems.push(`${name} 里的「${right}」不在任何字段的取值里`);
      if (fieldOf.has(left) && fieldOf.has(right)) {
        const shared = fieldOf.get(left).filter((field) => fieldOf.get(right).includes(field));
        if (shared.length === 0) {
          problems.push(`${name} 里的「${left}／${right}」不在同一个字段里，真实扫描不会产生这一对`);
        }
      }
      if (left === right) problems.push(`${name} 里有一对是同一个取值：${left}`);
    }
  }

  const positives = new Set(labels.positivePairs.map(key));
  const negatives = new Set(labels.negativePairs.map(key));
  if (positives.size !== labels.positivePairs.length) problems.push('positivePairs 里有重复的对');
  if (negatives.size !== labels.negativePairs.length) problems.push('negativePairs 里有重复的对');
  for (const pairKey of positives) {
    if (negatives.has(pairKey)) {
      const [left, right] = pairKey.split('\u0000');
      problems.push(`「${left}／${right}」同时出现在正例与负例里`);
    }
  }

  if (negatives.size < MIN_NEGATIVE_RATIO * positives.size) {
    problems.push(
      `负例只有正例的 ${(negatives.size / positives.size).toFixed(2)} 倍；` +
        `spec §5.5.4 要求负例显著多于正例（≥${MIN_NEGATIVE_RATIO} 倍），否则 Precision 会被高估`,
    );
  }
  return problems;
}

// ---------------------------------------------------------------------------
// 阈值扫描（纯函数，可单测）
// ---------------------------------------------------------------------------

/**
 * 在已标注的对上扫阈值。
 *
 * @param pairs 形如 { left, right, cosine, sameCategory }，sameCategory 为真表示应归并
 */
export function scanThresholds(pairs) {
  const positives = pairs.filter((pair) => pair.sameCategory);
  const negatives = pairs.filter((pair) => !pair.sameCategory);
  const rows = [];

  for (let t = SCAN_FROM; t <= SCAN_TO + 1e-9; t += SCAN_STEP) {
    const threshold = Number(t.toFixed(2));
    const truePositive = positives.filter((pair) => pair.cosine >= threshold).length;
    const falsePositive = negatives.filter((pair) => pair.cosine >= threshold).length;
    const falseNegative = positives.length - truePositive;
    const predicted = truePositive + falsePositive;

    rows.push({
      threshold,
      // 一个都不预测时 Precision 在数学上是「空真」的 1 —— 那会让
      // 「阈值高到什么都不报」看起来完全达标，然后被选成 T_high（Recall 为 0）。
      // 这正是本脚本自测抓到的一个真 bug：必须把它记成 0，否则门槛形同虚设。
      precision: predicted === 0 ? 0 : truePositive / predicted,
      recall: positives.length === 0 ? 0 : truePositive / positives.length,
      truePositive,
      falsePositive,
      falseNegative,
    });
  }

  // 取 Precision ≥ 0.95 条件下 Recall 最大的点。并列时取更高的阈值 ——
  // 更高的阈值意味着更少的自动归并建议，在 Precision 优先的策略下更稳。
  const eligible = rows.filter((row) => row.precision >= TARGET_PRECISION);
  const high =
    eligible.length === 0
      ? null
      : eligible.reduce((best, row) =>
          row.recall > best.recall || (row.recall === best.recall && row.threshold > best.threshold)
            ? row
            : best,
        );

  // 「待确认」下界：Precision 仍 ≥ 0.99 的最低阈值
  const strict = rows.filter((row) => row.precision >= REVIEW_PRECISION);
  const low = strict.length === 0 ? null : strict[0];

  // 最好能达到的操作点。达标时它等于 high；**不达标时它才是报告的主角** ——
  // 结论说「做不到 0.95」之后，读者立刻要问「那最好能做到多少、坏在哪几对」，
  // 而这两个答案都在这个点上。
  const best = rows.reduce((winner, row) =>
    row.precision > winner.precision ||
    (row.precision === winner.precision && row.recall > winner.recall)
      ? row
      : winner,
  );

  return { rows, high, low, best };
}

/** 找出把负例判成归并的对 —— 报告里最有用的部分。 */
export function worstFalsePositives(pairs, threshold, limit = 15) {
  return pairs
    .filter((pair) => !pair.sameCategory && pair.cosine >= threshold)
    .sort((left, right) => right.cosine - left.cosine)
    .slice(0, limit);
}

/** 找出被漏掉的正例，同样重要：它决定「还有多少能帮上忙的没帮上」。 */
export function worstFalseNegatives(pairs, threshold, limit = 15) {
  return pairs
    .filter((pair) => pair.sameCategory && pair.cosine < threshold)
    .sort((left, right) => right.cosine - left.cosine)
    .slice(0, limit);
}

// ---------------------------------------------------------------------------
// 探索性护栏扫描
// ---------------------------------------------------------------------------

const BOOLEANISH = new Set([
  '是', '否', 'y', 'n', 'yes', 'no', 'true', 'false', 't', 'f', '有', '无', '同意', '不同意',
]);

/**
 * spec §5.5.3 的「非反义模式」，以及一条 spec 没写但同一病因的补充规则。
 *
 * **这是探索性实现，权威版本是 Task 3 的 `src/core/synonyms/guard.ts`。**
 * 放在这里是因为 Task 1 必须回答「加了护栏之后 L3 还能不能用」——
 * 而实测发现余弦 1.0000 的那些对全是 `A型／B型`、`M／F`、`mL／L` 这种两三个字符的
 * 退化向量，spec 恰恰点明了这类不该进语义归并。不测这一层，
 * 就会把「护栏没做」误读成「模型不行」。
 */
export function specNegationGuard(left, right) {
  const a = left.trim();
  const b = right.trim();
  const lowerA = a.toLowerCase();
  const lowerB = b.toLowerCase();

  // 数值型取值
  if (/^\d+(\.\d+)?$/.test(a) && /^\d+(\.\d+)?$/.test(b)) return true;
  // 布尔型取值
  if (BOOLEANISH.has(lowerA) || BOOLEANISH.has(lowerB)) return true;
  // 单字对
  if (a.length <= 1 && b.length <= 1) return true;
  // 长度极短且字符集不同 —— spec 举的是单字对，这里按字面把「极短」取到 3 个字符
  if (a.length <= 3 && b.length <= 3 && ![...a].some((ch) => b.includes(ch))) return true;
  return false;
}

/**
 * 探索性补充：只要任一侧是 2–3 个字符，就退出语义归并。
 *
 * 动机是实测发现 `A型／B型`、`mL／L`、`A卷／B卷` 这些**字符集相交**的短串
 * 余弦也是 1.0000，spec 那条「字符集不同」拦不住它们。
 *
 * **实测结论是这条规则不该采用**：它能把 Precision 抬到 1.0000，
 * 但同时把 Recall 压到 0.115 —— 因为它顺手挡掉了 `硕士／研究生`
 * 这类中文短同义词，而那正是 L3 存在的唯一理由。留着这个函数是为了让报告
 * 能把这个取舍摊开给人看，不是为了用它。
 */
export function shortStringGuard(left, right) {
  return left.trim().length <= 3 || right.trim().length <= 3;
}

/** 同一形状、只有数字不同（`批次1／批次2`）。spec 没写这一条，单独统计。 */
export function digitTemplateGuard(left, right) {
  if (left === right) return false;
  return left.replace(/\d+/g, '#') === right.replace(/\d+/g, '#');
}

// ---------------------------------------------------------------------------
// 自测
// ---------------------------------------------------------------------------

/**
 * 自测不碰模型、不碰网络 —— 它验的是标注集与扫描数学。
 * 模型那一步的验证是真跑（--run），没有别的办法。
 */
export function runSelfTest() {
  const failures = [];
  const check = (condition, message) => {
    if (!condition) failures.push(message);
  };

  const labels = loadLabels();
  const problems = validateLabels(labels);
  check(problems.length === 0, `标注集校验有问题：\n${problems.map((p) => `    ${p}`).join('\n')}`);
  check(labels.fields.length >= 30, `字段数 ${labels.fields.length} 少于实验目标 30`);
  check(labels.positivePairs.length >= 80, `正例 ${labels.positivePairs.length} 少于实验目标 80`);
  check(labels.negativePairs.length >= 160, `负例 ${labels.negativePairs.length} 少于实验目标 160`);

  // 漂移检查：JSON 是产物，分组才是真源。有人手改了 JSON 却忘了改分组，
  // 或者改了分组没重新生成，两者就会分叉 —— 而分叉之后跑出来的阈值
  // 对应的是哪个标注集，没人说得清。
  const expected = renderLabels();
  const actual = readFileSync(LABELS_PATH, 'utf8');
  check(
    expected === actual,
    'synonym-labels.json 与 build-labels.mjs 的分组不一致；跑 `node knowledge/tools/build-labels.mjs` 重新生成',
  );

  // 扫描数学：构造一个完全可分与一个完全不可分的例子，两个方向都要验，
  // 只验「能跑通」等于没验 —— 一个恒返回 precision=1 的实现也能跑通。
  const separable = [
    { left: 'a', right: 'b', cosine: 0.95, sameCategory: true },
    { left: 'c', right: 'd', cosine: 0.95, sameCategory: true },
    { left: 'e', right: 'f', cosine: 0.1, sameCategory: false },
    { left: 'g', right: 'h', cosine: 0.1, sameCategory: false },
  ];
  const separableScan = scanThresholds(separable);
  check(separableScan.high !== null, '完全可分的例子应当能扫出 T_high');
  check(
    separableScan.high && separableScan.high.precision === 1 && separableScan.high.recall === 1,
    `完全可分的例子应当 precision=1 recall=1，实际 ${JSON.stringify(separableScan.high)}`,
  );

  const entangled = [
    { left: 'a', right: 'b', cosine: 0.7, sameCategory: true },
    { left: 'c', right: 'd', cosine: 0.7, sameCategory: false },
  ];
  const entangledScan = scanThresholds(entangled);
  check(
    entangledScan.high === null,
    '正负例余弦完全重合时不该扫出 T_high（Precision 无法达到 0.95），否则门槛形同虚设',
  );

  // 误报/漏报清单的方向不能写反 —— 这是报告里最容易被看错的两张表
  const pairs = [
    { left: 'p1', right: 'p2', cosine: 0.9, sameCategory: true },
    { left: 'n1', right: 'n2', cosine: 0.8, sameCategory: false },
  ];
  const falsePositives = worstFalsePositives(pairs, 0.75);
  check(
    falsePositives.length === 1 && falsePositives[0].left === 'n1',
    'worstFalsePositives 应当只列出负例',
  );
  const falseNegatives = worstFalseNegatives(pairs, 0.95);
  check(
    falseNegatives.length === 1 && falseNegatives[0].left === 'p1',
    'worstFalseNegatives 应当只列出未达阈值的正例',
  );

  if (failures.length > 0) {
    console.error('自测未通过：');
    for (const failure of failures) console.error(`  ✗ ${failure}`);
    return 1;
  }
  console.log(
    `自测通过：标注集 ${labels.fields.length} 字段 / ` +
      `正例 ${labels.positivePairs.length} 对 / 负例 ${labels.negativePairs.length} 对；` +
      `扫描数学与报告清单方向均已验`,
  );
  return 0;
}

// ---------------------------------------------------------------------------
// 真跑
// ---------------------------------------------------------------------------

async function runExperiment() {
  const labels = loadLabels();
  const problems = validateLabels(labels);
  if (problems.length > 0) {
    console.error('标注集未通过校验，实验中止：');
    for (const problem of problems) console.error(`  ✗ ${problem}`);
    return 1;
  }

  const { env, pipeline } = await import('@huggingface/transformers');
  // 默认缓存放 node_modules/.cache：模型 25 MB，放仓库根目录会变成一堆需要
  // 手动 gitignore 的未跟踪文件，而 node_modules/ 本来就不进版本控制。
  env.cacheDir = process.env.HF_CACHE_DIR ?? resolve(KNOWLEDGE, '../node_modules/.cache/hf');

  const modelId = 'Xenova/bge-small-zh-v1.5';
  /**
   * 量化精度必须与生产一致。
   *
   * 实测：`q8` 下「硕士／研究生」余弦 0.7195，`fp32` 下 0.7567 —— 差 0.037，
   * 比 Task 1 扫出来的可用窗口还宽。所以 spec §5.5.4 那句「阈值与后端强绑定」
   * 要延伸到 dtype：用 fp32 扫出来的阈值搬到 q8 上就不成立。
   * 生产用 `q8`（模型约 25 MB，spec §4.3），这里默认也走 `q8`。
   */
  const dtype = process.env.HF_DTYPE ?? 'q8';
  const startedAt = new Date();
  let extractor;
  try {
    extractor = await pipeline('feature-extraction', modelId, { dtype });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`模型加载失败：${message}`);
    if (/certificate|UNABLE_TO_VERIFY|fetch failed/i.test(message)) console.error(TLS_TIP);
    return 1;
  }

  const values = [...new Set(labels.fields.flatMap((field) => field.values))];
  const output = await extractor(values, { pooling: 'mean', normalize: true });
  const vectors = output.tolist();
  const vectorOf = new Map(values.map((value, index) => [value, vectors[index]]));

  const cosine = (left, right) => {
    const a = vectorOf.get(left);
    const b = vectorOf.get(right);
    if (!a || !b) throw new Error(`向量缺失：${left} / ${right}`);
    let dot = 0;
    for (let i = 0; i < a.length; i += 1) dot += a[i] * b[i];
    return dot;
  };

  const toPairs = (list, sameCategory) =>
    list.map(([left, right]) => ({ left, right, cosine: cosine(left, right), sameCategory }));
  const pairs = [
    ...toPairs(labels.positivePairs, true),
    ...toPairs(labels.negativePairs, false),
  ];

  const scan = scanThresholds(pairs);
  // 三档操作点，用来把「spec 已有的护栏够不够」与「再收紧要付什么代价」摊开：
  //   guarded  —— 只上 spec §5.5.3 写明的非反义模式
  //   short    —— 再叠一条探索性的「短串一律退出语义」
  const guardedPairs = pairs.filter((pair) => !specNegationGuard(pair.left, pair.right));
  const guardedScan = scanThresholds(guardedPairs);
  const shortPairs = guardedPairs.filter((pair) => !shortStringGuard(pair.left, pair.right));
  const shortScan = scanThresholds(shortPairs);

  const report = renderReport({
    labels,
    modelId,
    dimension: vectors[0].length,
    pairs,
    scan,
    guarded: { pairs: guardedPairs, scan: guardedScan, dropped: pairs.length - guardedPairs.length },
    short: { pairs: shortPairs, scan: shortScan, dropped: guardedPairs.length - shortPairs.length },
    startedAt,
    finishedAt: new Date(),
    embedder: process.env.HF_EMBEDDER_NOTE ?? `onnxruntime-node（CPU，dtype=${dtype}）`,
  });

  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, report, 'utf8');
  console.log(`报告已写入 ${REPORT_PATH}`);
  console.log(
    scan.high
      ? `T_high = ${scan.high.threshold}（Precision ${scan.high.precision.toFixed(4)} / Recall ${scan.high.recall.toFixed(4)}）`
      : 'T_high：Precision 达不到 0.95，没有任何阈值可用',
  );
  console.log(scan.low ? `T_low  = ${scan.low.threshold}` : 'T_low：Precision 达不到 0.99');
  return 0;
}

// ---------------------------------------------------------------------------
// 报告
// ---------------------------------------------------------------------------

export function renderReport(context) {
  const { labels, modelId, dimension, pairs, scan, guarded, short, startedAt, finishedAt, embedder } = context;
  const positives = pairs.filter((pair) => pair.sameCategory);
  const negatives = pairs.filter((pair) => !pair.sameCategory);
  const lines = [];

  // 三个操作点先算出来，结论与表格都用同一份数 —— 结论里写死的数字与
  // 表格里的实际值一旦分叉，报告就自相矛盾了（这一版第一稿就犯过）。
  const countBy = (guardFn) => ({
    negatives: negatives.filter((pair) => guardFn(pair.left, pair.right)).length,
    positives: positives.filter((pair) => guardFn(pair.left, pair.right)).length,
  });
  const specScale = countBy(specNegationGuard);
  const bothScale = countBy((left, right) => specNegationGuard(left, right) || shortStringGuard(left, right));
  const operatingPoints = [
    ['无护栏（现状）', pairs.length, 0, { negatives: 0, positives: 0 }, scan.best],
    ['+ spec §5.5.3 非反义模式', guarded.pairs.length, guarded.dropped, specScale, guarded.scan.best],
    [
      '+ 「短串一律退出语义」（探索性）',
      short.pairs.length,
      guarded.dropped + short.dropped,
      bothScale,
      short.scan.best,
    ],
  ];
  const [, , , , specPoint] = operatingPoints[1];
  const [, , , , shortPoint] = operatingPoints[2];
  const specReaches = specPoint.precision >= TARGET_PRECISION;
  const shortReaches = shortPoint.precision >= TARGET_PRECISION;

  lines.push('# 端侧 embedding 验证报告');
  lines.push('');
  lines.push('> 由 `knowledge/tools/validate-embedding.mjs` 生成。真源是 `knowledge/labels/synonym-labels.json`。');
  lines.push('> 这份报告回答的是设计文档 §5.5.6 那一个问题：bge-small-zh 能不能支撑类别同义归并。');
  lines.push('');

  lines.push('## 一、结论');
  lines.push('');
  if (scan.high) {
    lines.push(
      `**L3 语义单独可用，但窗口很窄。** 在 Precision ≥ ${TARGET_PRECISION} 的约束下，` +
        `可用的最高阈值是 **T_high = ${scan.high.threshold}**（Precision ${scan.high.precision.toFixed(4)}、` +
        `Recall ${scan.high.recall.toFixed(4)}、命中 ${scan.high.truePositive} 对、误报 ${scan.high.falsePositive} 对）。`,
    );
  } else {
    lines.push(
      `**L3 不能单独决定归并。** 在 [${SCAN_FROM}, ${SCAN_TO}] 整个区间内 Precision 都达不到 ` +
        `${TARGET_PRECISION}，实测最好也只有 **${scan.best.precision.toFixed(4)}**` +
        `（阈值 ${scan.best.threshold}，此时 Recall ${scan.best.recall.toFixed(4)}）—— 差得不是一点。`,
    );
    lines.push('');
    lines.push(
      '**病因已定位，而且与「模型语义能力差」不是一回事。** 余弦高达 1.0000 的负例全是' +
        '两三个字符的退化向量：`A型／B型`、`M／F`、`mL／L`、`A卷／B卷`、`A／B`。' +
        '这些串上池化向量塌到同一点，模型没有在「判断语义相近」，而是在**输出同一个向量**。',
    );
    lines.push('');
    lines.push(
      `**spec §5.5.3 已有的护栏也不够。** 上护栏后 Precision 只到 **${specPoint.precision.toFixed(4)}**` +
        `（Recall ${specPoint.recall.toFixed(4)}），仍然达不到 ${TARGET_PRECISION} —— ` +
        `它只挡掉了 ${specScale.negatives} 对负例，还剩 ${guarded.pairs.length} 对候选在互相干扰。`,
    );
    lines.push('');
    lines.push(
      `**再收一步「短串一律退出语义」，Precision 能到 ${shortPoint.precision.toFixed(4)}（达标），` +
        `但 Recall 只剩 ${shortPoint.recall.toFixed(4)}** —— 因为它顺手挡掉了 ${bothScale.positives} 对正例，` +
        '其中就包括「硕士／研究生」这类中文短同义词，而那正是 L3 存在的唯一理由。',
    );
    lines.push('');
    lines.push(
      `> **结论：L3 在这个模型上没有一个可用的「自动归并」阈值。** ` +
        `${specReaches ? '' : '连 spec 自带的护栏都不够；'}收得更紧虽然能达标，代价是把召回砍到几乎为零。` +
        '所以真正可用的形态只有一个 —— 下面这四条：',
    );
    lines.push('');
    lines.push(
      '- **`T_high` 置为不可达**（spec §5.5.6 的降级方案）：L3 永不单独触发「建议归并」。',
    );
    lines.push(
      '- **L3 只做确认，不做发现**：仅保留决策式里「L3 ∈ [T_low, T_high) ∧ L2 有正信号」那一条。' +
        '这一条要求候选**已经**有字面或规范化上的正信号，L3 只负责提高置信度 —— ' +
        '退化向量在这种情况下无害，因为它不再单独决定任何事。',
    );
    lines.push(
      '- **`T_low` 同样不可达**（Precision ≥0.99 从未达到），所以「待确认」区间也必须与 L2 结合，' +
        '不能只凭余弦。',
    );
    lines.push(
      '- **护栏仍然是前置条件**（spec §5.5.6 四种情形里的第四种）：它救不了精度，但少了它连 ' +
        `${scan.best.precision.toFixed(2)} 都保不住。`,
    );
    lines.push('');
    lines.push('**对 Plan 3 后续任务的具体指令：**');
    lines.push('');
    lines.push('| 任务 | 指令 |');
    lines.push('| --- | --- |');
    lines.push(
      '| Task 3 `guard.ts` | 按 spec §5.5.3 实现（数值型／布尔型／单字对／极短且字符集不同）。' +
        '**不要**加「短串一律退出语义」—— 它会把 `硕士／研究生` 一起挡掉，实测 Recall 掉到 ' +
        `${short.scan.best.recall.toFixed(4)}。新增一条测试：护栏必须挡掉 \`A型／B型\`、\`M／F\`、\`mL／L\`，` +
        '同时**必须放行** `硕士／研究生` |',
    );
    lines.push('| Task 4 | 照原计划做。模型可用：512 维、加载正常、Node 与浏览器同后端 |');
    lines.push(
      '| Task 5 | `DEFAULT_THRESHOLDS.semanticHigh` 设为 `Number.POSITIVE_INFINITY`（即不可达），' +
        '`semanticLow` 用实测的待确认下界；保留决策式的第四条分支作为 L3 的唯一作用 |',
    );
    lines.push(
      '| Task 5 的界面 | 因为 L3 不再单独建议归并，**自动归并只来自 L1／L2**，' +
        '语义只影响「待确认」的排序。界面上要据此说明依据，不要写成「AI 判断它们同义」 |',
    );
    lines.push('');
    lines.push(
      '> 这一页是本次验证最实在的产出：**它把「这个功能能不能做」变成了「这个功能怎么做才对」**，' +
        '而且是在写产品代码之前。',
    );
  }
  lines.push('');
  lines.push('| 项 | 值 |');
  lines.push('| --- | --- |');
  lines.push(`| 模型 | \`${modelId}\` |`);
  lines.push(`| 向量维度 | ${dimension} |`);
  lines.push(`| 推理后端 | ${embedder} |`);
  lines.push(`| 标注集 | ${labels.fields.length} 字段 · 正例 ${positives.length} 对 · 负例 ${negatives.length} 对 |`);
  lines.push(`| 扫描区间 | [${SCAN_FROM}, ${SCAN_TO}] 步长 ${SCAN_STEP} |`);
  lines.push('| T_high（建议归并的下界） | ' + (scan.high ? scan.high.threshold : '不可达') + ' |');
  lines.push('| T_low（待确认的下界） | ' + (scan.low ? scan.low.threshold : '不可达') + ' |');
  lines.push(
    `| 实测最好能达到的 Precision | **${scan.best.precision.toFixed(4)}**（阈值 ${scan.best.threshold}，` +
      `对应 Recall ${scan.best.recall.toFixed(4)}） |`,
  );
  lines.push(`| 跑完时间 | ${finishedAt.toISOString()}（开始于 ${startedAt.toISOString()}） |`);
  lines.push('');

  lines.push('### 护栏之后还剩下什么');
  lines.push('');
  lines.push(
    'cosine 高达 1.0000 的那几对全是两三个字符的退化向量（`A型／B型`、`M／F`、`mL／L`、`A卷／B卷`），' +
      '而 spec §5.5.3 的「非反义模式」本来就要求这类不进入语义归并流程。',
  );
  lines.push(
    '所以「L3 不达标」这个结论必须再问一句：**把护栏做上之后，L3 还能不能用？** ' +
      '不测这一层，会误把「护栏没做」读成「模型不行」。',
  );
  lines.push('');
  lines.push('| 候选集 | 对数 | 去掉 | 挡掉负例 | 挡掉正例 | 最好 Precision | 对应阈值 | 对应 Recall | 达到 0.95 |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const [name, count, dropped, scale, point] of operatingPoints) {
    lines.push(
      `| ${name} | ${count} | ${dropped} | ${scale.negatives} | ${scale.positives} | ` +
        `**${point.precision.toFixed(4)}** | ${point.threshold} | ${point.recall.toFixed(4)} | ` +
        `${point.precision >= TARGET_PRECISION ? '**是**' : '否'} |`,
    );
  }
  lines.push('');
  lines.push('**这张表说的是一个取舍，而不是一个分数：**');
  lines.push('');
  lines.push(
    `- **spec 已有的护栏救不了精度**：Precision 只从 ${scan.best.precision.toFixed(4)} 升到 ` +
      `${specPoint.precision.toFixed(4)}。它挡掉 ${specScale.negatives} 对负例（该挡）与 ` +
      `${specScale.positives} 对正例（不该挡），但剩下 ${guarded.pairs.length} 对候选仍然互相干扰。`,
  );
  lines.push(
    `- **「短串一律退出语义」能把 Precision 抬到 ${shortPoint.precision.toFixed(4)}（达标）**，` +
      `代价是 Recall 掉到 ${shortPoint.recall.toFixed(4)} —— 它挡掉的 ${bothScale.positives} 对正例里` +
      '就包括「硕士／研究生」这类中文短同义词，而那正是 L3 存在的唯一理由。',
  );
  lines.push('');
  lines.push(
    '> 所以**短串一律退出**这条规则**不该采用**：用一个把召回砍到几乎为零的护栏去换精度，' +
      '相当于把这个功能关掉还挂着「已实现」的招牌。',
  );
  lines.push('');

  lines.push('## 二、阈值扫描');
  lines.push('');
  lines.push('| 阈值 | Precision | Recall | 命中 | 误报 | 漏报 |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  for (const row of scan.rows) {
    const marks = [];
    if (scan.high && row.threshold === scan.high.threshold) marks.push('T_high');
    if (row.threshold === scan.best.threshold) marks.push('最高 Precision');
    const mark = marks.length > 0 ? ` ← ${marks.join(' / ')}` : '';
    lines.push(
      `| ${row.threshold}${mark} | ${row.precision.toFixed(4)} | ${row.recall.toFixed(4)} | ` +
        `${row.truePositive} | ${row.falsePositive} | ${row.falseNegative} |`,
    );
  }
  lines.push('');

  // 这三节无论达标与否都要出。不达标时它们才是最有用的部分：
  // 结论说「精度上不去」之后，读者立刻要问「坏在哪几对」。
  {
    const operating = scan.high ?? scan.best;
    const falsePositives = worstFalsePositives(pairs, operating.threshold);
    lines.push(`## 三、最危险的误报（阈值取 ${operating.threshold}）`);
    lines.push('');
    lines.push('**这张表是这份报告里最该看的部分。** spec §5.5.1 的核心风险不是漏检而是误合并。');
    lines.push('');
    if (falsePositives.length === 0) {
      lines.push('（无 —— 该阈值上没有负例被误判）');
    } else {
      lines.push('| 余弦 | 取值 A | 取值 B |');
      lines.push('| --- | --- | --- |');
      for (const pair of falsePositives) {
        lines.push(`| ${pair.cosine.toFixed(4)} | ${pair.left} | ${pair.right} |`);
      }
    }
    lines.push('');

    // 高阈值下仍然越线的负例：它们是「精度上不去」的直接原因，
    // 与阈值无关，所以单独列一遍。
    const absurd = negatives
      .filter((pair) => pair.cosine >= 0.9)
      .sort((left, right) => right.cosine - left.cosine);
    lines.push('## 四、余弦 ≥ 0.90 的负例（与阈值无关的硬伤）');
    lines.push('');
    lines.push(
      `共 ${absurd.length} 对。这些对不同类别的取值，模型给出的余弦高到任何合理阈值都拦不住 —— ` +
        '它们是「L3 不能单独决定归并」的直接原因。',
    );
    lines.push('');
    if (absurd.length === 0) {
      lines.push('（无）');
    } else {
      lines.push('| 余弦 | 取值 A | 取值 B |');
      lines.push('| --- | --- | --- |');
      for (const pair of absurd.slice(0, 25)) {
        lines.push(`| ${pair.cosine.toFixed(4)} | ${pair.left} | ${pair.right} |`);
      }
    }
    lines.push('');

    const falseNegatives = worstFalseNegatives(pairs, operating.threshold);
    lines.push(`## 五、被漏掉的正例（阈值取 ${operating.threshold}）`);
    lines.push('');
    lines.push('漏检的代价是「没帮上忙」，比误合并轻 —— 但它决定这个功能实际有多少用。');
    lines.push('');
    if (falseNegatives.length === 0) {
      lines.push('（无）');
    } else {
      lines.push('| 余弦 | 取值 A | 取值 B |');
      lines.push('| --- | --- | --- |');
      for (const pair of falseNegatives) {
        lines.push(`| ${pair.cosine.toFixed(4)} | ${pair.left} | ${pair.right} |`);
      }
    }
    lines.push('');

    const guarded = negatives
      .filter((pair) => pair.cosine >= (scan.high?.threshold ?? 0.9))
      .sort((left, right) => right.cosine - left.cosine);
    lines.push('## 六、spec §5.5.1 点名的「绝不能归并」清单');
    lines.push('');
    lines.push(
      '这些对即使余弦很高也必须被护栏拦住。**栏里有一对撞线，护栏就从优化项升为前置条件。**' +
        `（判据用的阈值是 ${scan.high?.threshold ?? 0.9}）`,
    );
    lines.push('');
    lines.push('| 取值 A | 取值 B | 余弦 | 结论 |');
    lines.push('| --- | --- | --- | --- |');
    if (guarded.length === 0) {
      lines.push('| （无） | | | |');
    } else {
      for (const pair of guarded) {
        lines.push(`| ${pair.left} | ${pair.right} | ${pair.cosine.toFixed(4)} | **必须靠护栏拦** |`);
      }
    }
    lines.push('');
  }

  lines.push('## 七、跑法');
  lines.push('');
  lines.push('```bash');
  lines.push('node --use-system-ca knowledge/tools/validate-embedding.mjs --self-test');
  lines.push('node --use-system-ca knowledge/tools/validate-embedding.mjs --run');
  lines.push('```');
  lines.push('');
  lines.push('`--use-system-ca` 不是可选项：本机 Node 自带的 CA 包不认证书链（与 git 改用 schannel 同因），');
  lines.push('不加就会在下载模型时报 `UNABLE_TO_VERIFY_LEAF_SIGNATURE`。');
  lines.push('');
  lines.push('## 八、这份报告的边界');
  lines.push('');
  lines.push('- **它只是冒烟结论，不是评测。** 标注集是人工构造的，覆盖的是已知脏法模式，不代表真实数据的分布。');
  lines.push(`- 标注集规模 ${labels.fields.length} 字段，**未达 spec §5.5.4 的最终目标（50+ 字段）**；`);
  lines.push('  正例与负例的数量已达标。补足字段是 Plan 4 建评测集时的事。');
  lines.push('- **阈值与后端强绑定**（spec §5.5.4 第五步），而且**与量化精度也强绑定**。');
  lines.push('  实测 `q8` 下「硕士／研究生」余弦 0.7195、`fp32` 下 0.7567 —— 差 0.037，');
  lines.push('  比本报告扫出的可用窗口还宽。所以换 dtype 与换模型一样必须重扫。');
  lines.push('  本报告用的是**生产同款** `q8`（模型约 25 MB，spec §4.3）。');
  lines.push('- 本报告扫的是 **L3（语义余弦）**。**L2（字面层）的阈值单独扫**，见附录 A；');
  lines.push('  附录**不是本脚本生成的** —— 它由 `src/core/synonyms/literal-scan.test.ts`');
  lines.push('  跑生产实现产出，所以重跑本脚本会把它冲掉，需要照那份测试的输出补回来。');
  lines.push('');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// 入口
// ---------------------------------------------------------------------------

// 入口判定必须用 pathToFileURL：路径里有中文时 import.meta.url 是百分号编码的，
// 直接拼 `file:///${argv[1]}` 永远匹配不上，脚本会静默什么都不做。
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const args = process.argv.slice(2);
  if (args.includes('--self-test')) {
    process.exit(runSelfTest());
  }
  if (args.includes('--run')) {
    process.exit(await runExperiment());
  }
  console.log('用法：\n  --self-test  校验标注集与扫描数学（不碰模型、不碰网络）\n  --run        真跑，需要下载模型');
  process.exit(existsSync(LABELS_PATH) ? 0 : 1);
}
