/**
 * 评测集的构造脚本：干净底表 + 缺陷注入 → 脏数据 + 标准答案。
 *
 *   node knowledge/eval/dataset/injector.mjs --make-base   # 生成底表（只在需要改底表时跑）
 *   node knowledge/eval/dataset/injector.mjs --write       # 注入 → messy-eval.csv + answers.json
 *   node knowledge/eval/dataset/injector.mjs --verify      # 核对答案与数据一致
 *   node knowledge/eval/dataset/injector.mjs --self-test   # 形状、确定性、篡改检测
 *
 * 设计文档 §5.9.2 规定的方法是「注入已知缺陷」：从干净数据出发，按清单注入
 * 已知质量问题并记录标准答案，再评系统能否全部检出且不误报。
 *
 * **这份脚本刻意不 import 项目的 TS。** Node 跑不了 `src/`（`src/core/normalize`
 * 是无扩展名的目录导入），而任何「为了跑起来把 core 抄一遍」的做法都会让
 * 标准答案与实现同源 —— 那正是评测最该避免的自欺（计划里的 Review Focus 第 1 条）。
 * 所以脚本只负责**造数据与记答案**，「底表是否真的干净」由 `pnpm test` 里的
 * `src/core/evaluate/dataset.test.ts` 断言。
 *
 * **答案由实际写入动作推导，不由缺陷清单照抄** —— 清单写了但注入失败时，
 * 照抄会把「注入没成功」记成「实现漏报」。
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE_PATH = join(HERE, 'base-clean.csv');
const DEFECTS_PATH = join(HERE, 'defects.json');
const MESSY_PATH = join(HERE, 'messy-eval.csv');
const ANSWERS_PATH = join(HERE, 'answers.json');

/** 与 core 的 checkId 一一对应。多一个少一个都会让 Task 2 得再写一层映射表，而映射表是漂移的入口。 */
const DEFECT_KINDS = [
  'missing',
  'duplicates',
  'type-consistency',
  'outliers',
  'range-rules',
  'unit-consistency',
  'category-synonyms',
  'duplicate-column-names',
];

/**
 * 哪些检查是**列级**的 —— 即 core 一条问题覆盖整列、证据里不给 `rowIndices`。
 *
 * 答案的粒度必须跟着它走（原因见 `inject()` 里的注释）：给列级检查按单元格记答案，
 * 会让「整列缺失 200 行」变成 200 条永远匹配不上的答案。
 */
const COLUMN_SCOPE_KINDS = new Set([
  'missing',
  'type-consistency',
  'unit-consistency',
  'category-synonyms',
]);

// ---------------------------------------------------------------------------
// 底表
// ---------------------------------------------------------------------------

/**
 * 固定种子的线性同余发生器。
 *
 * 用固定种子而不是 `Math.random`：评测集必须**可复现** —— 同一份脚本跑两次
 * 得到逐字节相同的文件，否则指标会随机浮动，而浮动之后没人能说清是哪次的结果。
 */
function makeRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

const COLUMNS = ['学号', '年龄', '性别', '学历', '组别', '身高', '剂量', '备注'];

/**
 * 生成干净底表。
 *
 * 每一列的取值域都是**刻意选的**，为的是让现有的 8 项检查一条都不报：
 *   - 无缺失：`missing` 只统计缺失，没有就跳过
 *   - 每行独一无二：`duplicates` 按全部列取值判重
 *   - 各列类型一致：学号与剂量用纯数字（带单位会触发类型与单位检查）
 *   - 学历的 4 个取值互不相似到触发归并阈值（用 `literalSimilarity` 量过：
 *     两两 ≤ 0.5，低于待确认下界 0.84）
 *   - 数值列分布正常：`outliers` 的 IQR 边界之外没有值
 */
function makeBase(rowCount = 1000, seed = 20261016) {
  const random = makeRandom(seed);
  const rows = [];
  const eduCycle = ['本科', '硕士', '专科', '博士'];
  const groupCycle = ['甲组', '乙组', '丙组'];
  const sexCycle = ['男', '女'];
  const noteCycle = ['已完成', '已完成', '已完成', '缺访'];

  for (let index = 0; index < rowCount; index += 1) {
    // 学号：6 位定长字符串，前导零保留（这一列也是「导出脚本会不会把 001 变成 1」的观察对象）
    const studentId = String(2021001 + index);
    // 年龄：20–30 的正态样，不产生 IQR 异常值
    const age = 20 + Math.floor(random() * 11);
    const sex = sexCycle[index % 2];
    const education = eduCycle[index % eduCycle.length];
    const group = groupCycle[index % groupCycle.length];
    // 身高：155–185 cm
    const height = 155 + Math.round(random() * 30);
    // 剂量：40–100 mg。**不带单位**（写在表头里），避免触发单位混用检查
    const dose = 40 + Math.floor(random() * 61);

    rows.push([studentId, String(age), sex, education, group, String(height), String(dose), noteCycle[index % 4]]);
  }

  return { columns: COLUMNS, rows };
}

function toCsv(columns, rows) {
  const escape = (value) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
  // 评测集不进 Excel，所以刻意**不写 BOM**：BOM 会变成第一列列名的一部分，
  // 让按列名定位的答案对不上（导出的 CSV 是给用户双击用的，才需要 BOM）
  return [columns.map(escape).join(','), ...rows.map((row) => row.map(escape).join(','))].join('\n') + '\n';
}

function parseCsv(text) {
  const lines = text.trimEnd().split('\n');
  const cells = (line) => {
    const out = [];
    let current = '';
    let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
      const ch = line[index];
      if (quoted) {
        if (ch === '"' && line[index + 1] === '"') {
          current += '"';
          index += 1;
        } else if (ch === '"') quoted = false;
        else current += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ',') {
        out.push(current);
        current = '';
      } else current += ch;
    }
    out.push(current);
    return out;
  };
  const columns = cells(lines[0] ?? '');
  const rows = lines.slice(1).map(cells);
  return { columns, rows };
}

// ---------------------------------------------------------------------------
// 注入
// ---------------------------------------------------------------------------

/**
 * 按清单注入缺陷，并把**每一条真的写进去了的动作**记成标准答案。
 *
 * 返回 `{ columns, rows, answers }`。调用方负责落盘。
 */
function inject(base, defects) {
  const columns = [...base.columns];
  const rows = base.rows.map((row) => [...row]);
  const answers = [];
  /**
   * 注入顺序有两处硬约束，都是踩出来的：
   *
   * 1. **`duplicates` 必须最后做。** 它复制的是「当时的行」。若先复制、后面再有
   *    别的注入落到被复制的那几行上，副本与原件就不再相同 —— 一处缺陷把另一处
   *    抹掉了。实测：备注的缺失区间 [200,300) 正好盖住被复制的第 201 行，
   *    于是 `duplicates` 一条都检出不来。
   *    代价是缺失率的分母回到 1000（不含重复行），这是**好事**：判据变明确，
   *    不再是「20% 还是 19.96% 取决于哪一步先做」。
   * 2. **`duplicate-column-names` 最后做**，它会改列数；放在前面会让后面所有
   *    按列名取下标的注入错位。
   */
  const ordered = [...defects.injections].sort(
    (left, right) => Number(right.kind === 'duplicates') - Number(left.kind === 'duplicates'),
  );
  const orderedFinal = [
    ...ordered.filter((item) => item.kind !== 'duplicate-column-names' && item.kind !== 'duplicates'),
    ...ordered.filter((item) => item.kind === 'duplicates'),
    ...ordered.filter((item) => item.kind === 'duplicate-column-names'),
  ];
  const columnIndex = (name) => {
    const index = columns.indexOf(name);
    if (index === -1) throw new Error(`缺陷清单引用了不存在的列「${name}」`);
    return index;
  };

  for (const injection of orderedFinal) {
    const { kind } = injection;
    if (!DEFECT_KINDS.includes(kind)) {
      throw new Error(`未知的缺陷类型「${kind}」，允许的取值见 DEFECT_KINDS`);
    }
    // 默认计入评分；`scored: false` 是**刻意低于阈值**的对照 —— 正确答案就是「不报」
    const scored = injection.scored !== false;
    if (kind === 'duplicate-column-names') {
      // 整表级：把第一列复制一份挂到表尾。它会改变列数，所以放在最后处理
      columns.push(columns[0]);
      for (const row of rows) row.push(row[0]);
      answers.push({ kind, scored, scope: 'table', note: `重复了列名「${columns[0]}」` });
      continue;
    }

    if (kind === 'duplicates') {
      /**
       * 行级：复制指定行挂到表尾（逐值相同才会被判成完全重复）。
       *
       * 答案记的是**一对行号**（原行 + 复制行），而不是单看复制行。理由：
       * 同一处重复在检出的问题里，`rowIndices` 到底列哪几行取决于分桶顺序，
       * 而且在有重名列的数据里（本评测集就有），那一列会出现在证据里、
       * 让「按行号精确匹配」变得脆弱。判据放宽成「这一对里有一行落在证据里」——
       * 那才是「这处重复被发现了」的准确表述。
       */
      for (const source of injection.rows ?? []) {
        const copy = [...rows[source]];
        const copyIndex = rows.length;
        rows.push(copy);
        answers.push({
          kind,
          scored,
          scope: 'row',
          relatesRows: [source, copyIndex],
          note: `复制第 ${source} 行到第 ${copyIndex} 行`,
        });
      }
      continue;
    }

    const index = columnIndex(injection.column);
    // 两种写法都支持：`rows` 逐点列举（用于精确指出第几行），`rowRange` 给区间
    // （用于「整段缺失」这种大量行的情况 —— 在 JSON 里列举 300 个行号没人能复核）
    const targets = injection.rowRange
      ? Array.from(
          { length: injection.rowRange[1] - injection.rowRange[0] },
          (_, offset) => injection.rowRange[0] + offset,
        )
      : (injection.rows ?? []);
    const values = injection.value !== undefined ? [injection.value] : (injection.values ?? []);

    for (let position = 0; position < targets.length; position += 1) {
      const row = targets[position];
      // 行号必须落在**当前**数据范围内。注意不能用「正式底表 1000 行」去判：
      // duplicates 已经加过行，所以 1000/1001 这样的行号是合法的
      if (row === undefined || row < 0 || row >= rows.length) {
        throw new Error(`缺陷清单想让第 ${row} 行注入，但数据只有 ${rows.length} 行`);
      }
      const injected = values[position] ?? values[values.length - 1];
      rows[row][index] = injected;

      // **回读确认**：只有真的写进去了才记答案。少了这一步，「清单写了但注入失败」
      // 会被算成「实现漏报」—— 那是最难查的一种错
      if (rows[row][index] !== injected) {
        throw new Error(`第 ${row} 行「${injection.column}」注入失败：期望 ${injected}，实际 ${rows[row][index]}`);
      }
    }

    /**
     * **答案的粒度跟着检查的粒度走**，不跟着注入点走。
     *
     * 这一点踩过一次：`missing` 是**列级**问题（core 一条问题覆盖整列，不给 `rowIndices`），
     * 而答案起初按单元格记了 200 条。按行号匹配时它们全都匹配不上，测出来
     * 「200 处漏报」—— 漏的其实是我的评分口径，不是实现。
     *
     * 所以：列级检查（missing / unit-consistency / category-synonyms / type-consistency）
     * 一条注入只记**一条**答案；行级检查（outliers / range-rules）逐个注入点记，
     * 因为 core 对它们确实在证据里给出行号。类型写在 `scope` 上，评分函数据此选口径。
     */
    const scope = COLUMN_SCOPE_KINDS.has(kind) ? 'column' : 'row';
    if (scope === 'column') {
      answers.push({
        kind,
        scored,
        scope,
        column: injection.column,
        injectedCount: targets.length,
        note: injection.说明,
      });
      continue;
    }

    for (let position = 0; position < targets.length; position += 1) {
      answers.push({
        kind,
        scored,
        scope,
        row: targets[position],
        column: injection.column,
        injected: values[position] ?? values[values.length - 1],
      });
    }
  }

  /**
   * 这里**不做** missing 比例的自校验 —— 那一步在 `writeInjected()` 里。
   *
   * 理由：自测用的是 50 行的小底表，任何缺失比例都低于 0.2 阈值，在这里校验
   * 会让自测永远失败。校验属于「正式落盘」这个动作。
   */
  return { columns, rows, answers };
}

/**
 * 核对答案与数据一致：每条记录都能在数据里找到对应的取值。
 *
 * 这是 `--verify`，也是自测里「篡改反例」的依赖 —— 没有它，答案与数据分叉了
 * 也无人发现。
 *
 * 只核对**行级**答案（那类答案带着 `injected` 期望值）。列级与整表级答案不记
 * 具体取值 —— 它们记的是「哪一列/整表被注入了什么」，取值本身会随注入点变化，
 * 而且列级检查的检出判据是列名而不是取值。
 */
function verify(columns, rows, answers) {
  const problems = [];
  for (const answer of answers) {
    if (!DEFECT_KINDS.includes(answer.kind)) {
      problems.push(`答案里有未知缺陷类型「${answer.kind}」`);
      continue;
    }
    if (answer.column === undefined || answer.row === undefined) continue; // 列级或整表级
    const index = columns.indexOf(answer.column);
    if (index === -1) {
      problems.push(`答案引用的列「${answer.column}」不在数据里`);
      continue;
    }
    const actual = rows[answer.row]?.[index];
    if (String(actual) !== String(answer.injected)) {
      problems.push(
        `第 ${answer.row} 行「${answer.column}」的答案写的是 ${answer.injected}，数据里是 ${actual}`,
      );
    }
  }
  return problems;
}

// ---------------------------------------------------------------------------
// 入口
// ---------------------------------------------------------------------------

function writeBase() {
  const base = makeBase();
  writeFileSync(BASE_PATH, toCsv(base.columns, base.rows), 'utf8');
  console.log(`底表已写入 ${BASE_PATH}（${base.rows.length} 行 × ${base.columns.length} 列）`);
}

/**
 * 注入效果的落盘与自校验。
 */
function writeInjected() {
  const base = existsSync(BASE_PATH) ? parseCsv(readFileSync(BASE_PATH, 'utf8')) : makeBase();
  const defects = JSON.parse(readFileSync(DEFECTS_PATH, 'utf8'));
  const { columns, rows, answers } = inject(base, defects);

  // 自校验：计分的 `missing` 注入，比例必须真的过阈值。
  //
  // 这条不是洁癖 —— 「200 行缺失 = 20%」这个算式会在加行之后失效：重复对把分母
  // 撑到 1002 后，200/1002 = 19.96%，恰好跌破 0.2。于是评测会把一处「实现其实
  // 没错」算成漏报。算式靠人靠不住，所以落盘前真的数一遍。
  //
  // **分母必须用实际数据行数**（含重复对加出来的行）：实现里的 `checkMissing`
  // 用的就是这个分母。用底表行数判会得到「20% 达标」，而实现按 19.96% 不报 ——
  // 然后答案声称这处被检出、实现只是没报，指标就假了。
  //
  // 阈值来自 `checkMissing`（medium ≥ 0.2）。这里**有意硬编码**：那边默认值一改，
  // 这条自校验就会立刻报错，逼人回来对齐。
  const MISSING_MEDIUM_THRESHOLD = 0.2;
  const denominator = rows.length;
  const violations = answers
    .filter((answer) => answer.kind === 'missing' && answer.scored && answer.column !== undefined)
    .map((answer) => {
      const index = columns.indexOf(answer.column);
      const missingCount = rows.filter((row) => (row[index] ?? '') === '').length;
      return { column: answer.column, rate: missingCount / denominator };
    })
    .filter((item) => item.rate < MISSING_MEDIUM_THRESHOLD);
  if (violations.length > 0) {
    throw new Error(
      violations
        .map(
          (item) =>
            `「${item.column}」的缺失率 ${(item.rate * 100).toFixed(2)}% 低于阈值 ` +
            `${MISSING_MEDIUM_THRESHOLD * 100}%（分母 ${denominator} 行），但清单把它标成 scored —— ` +
            '这处缺陷不会被报，评测会把它误算成漏报。请调整 rowRange（重复对会加行、改变分母）',
        )
        .join('\n'),
    );
  }

  writeFileSync(MESSY_PATH, toCsv(columns, rows), 'utf8');
  writeFileSync(
    ANSWERS_PATH,
    JSON.stringify(
      { dataset: 'messy-eval.csv', baseDataset: 'base-clean.csv', rowCount: rows.length, defects: answers },
      null,
      2,
    ) + '\n',
    'utf8',
  );
  console.log(`脏数据已写入 ${MESSY_PATH}（${rows.length} 行 × ${columns.length} 列）`);
  console.log(`标准答案已写入 ${ANSWERS_PATH}（${answers.length} 条缺陷）`);
}

function runVerify() {
  const { columns, rows } = parseCsv(readFileSync(MESSY_PATH, 'utf8'));
  const answers = JSON.parse(readFileSync(ANSWERS_PATH, 'utf8'));
  const problems = verify(columns, rows, answers.defects);
  if (problems.length > 0) {
    console.error(`答案与数据不一致（${problems.length} 处）：`);
    for (const problem of problems) console.error(`  ${problem}`);
    process.exitCode = 1;
    return;
  }
  console.log(`答案与数据一致（${answers.defects.length} 条）`);
}

function runSelfTest() {
  const failures = [];
  const check = (condition, message) => {
    if (!condition) failures.push(message);
  };

  // 1. 确定性：同一 seed 两次生成逐字节一致
  const firstBase = makeBase();
  const secondBase = makeBase();
  check(
    toCsv(firstBase.columns, firstBase.rows) === toCsv(secondBase.columns, secondBase.rows),
    '同一 seed 两次生成的结果不一致 —— 评测集必须可复现',
  );

  // 2. 形状
  const base = makeBase(50, 1);
  check(base.columns.length === 8, `底表应有 8 列，实际 ${base.columns.length}`);
  check(base.rows.length === 50, `底表应有 50 行，实际 ${base.rows.length}`);
  check(
    new Set(base.rows.map((row) => row.join('\u0001'))).size === 50,
    '底表有重复行 —— 它必须干净，duplicates 检查会报到它',
  );

  const defects = JSON.parse(readFileSync(DEFECTS_PATH, 'utf8'));
  check(
    defects.injections.every((item) => DEFECT_KINDS.includes(item.kind)),
    '缺陷清单里有未知类型',
  );
  /**
   * 自校验一：清单里的行号在**注入过程中**没越界（`inject` 已经逐点断言过，
   * 这里只对正式规模再确认一次「起点合理」—— 止点可以到加行之后的行数，
   * 那是 `duplicates` 加的，属于合法）。
   */
  const ROWS_IN_PRODUCTION = 1000;
  const outOfBounds = [];
  for (const injection of defects.injections) {
    if (injection.rowRange) {
      const [from, to] = injection.rowRange;
      if (from < 0 || from >= ROWS_IN_PRODUCTION) outOfBounds.push(`${injection.kind} 起点 ${from}`);
      // 止点最多到「底表行数 + duplicates 加的行数」，这里按 5 行余量判
      if (to > ROWS_IN_PRODUCTION + 5) outOfBounds.push(`${injection.kind} 止点 ${to} 明显越界`);
    }
    for (const row of injection.rows ?? []) {
      if (row < 0 || row >= ROWS_IN_PRODUCTION) outOfBounds.push(`${injection.kind} 第 ${row} 行`);
    }
  }
  check(outOfBounds.length === 0, `缺陷清单里有越界行号（正式底表 ${ROWS_IN_PRODUCTION} 行）：${outOfBounds.join('、')}`);

  // 3. 注入：用一份自测专用的小清单（行号落在 50 行之内），把四类注入都过一遍。
  //    缺失那条**必须标 scored:false**，否则会撞上 inject() 里的比例自校验 ——
  //    5/51 远低于 0.2，而这正是那道闸门该有的反应
  const probeDefects = {
    injections: [
      { kind: 'outliers', column: '身高', rows: [3], values: ['999'] },
      { kind: 'missing', column: '备注', rowRange: [10, 15], value: '', scored: false },
      { kind: 'duplicates', rows: [20] },
      { kind: 'duplicate-column-names' },
    ],
  };
  const injected = inject(makeBase(50, 1), probeDefects);
  check(
    verify(injected.columns, injected.rows, injected.answers).length === 0,
    '注入后答案与数据不一致',
  );
  // 1 条行级（离群点）+ 1 条列级（缺失区间）+ 1 条行级（重复）+ 1 条整表级 = 4
  check(injected.answers.length === 4, `答案条数应为 4，实际 ${injected.answers.length}`);
  check(
    injected.answers.filter((answer) => answer.scope === 'column').length === 1,
    '列级注入应产出 1 条列级答案',
  );
  check(
    injected.columns.length === 9,
    `duplicate-column-names 应让列数变成 9，实际 ${injected.columns.length}`,
  );
  check(injected.rows.length === 51, `duplicates 应加 1 行，实际 ${injected.rows.length}`);

  // 4. 篡改反例：把某条**行级**答案的期望值改掉，verify 必须能发现
  const tampered = injected.answers.map((answer) =>
    answer.scope === 'row' && answer.kind === 'outliers' ? { ...answer, injected: '被改坏了' } : answer,
  );
  check(
    verify(injected.columns, injected.rows, tampered).length > 0,
    '篡改答案后期望 verify 报错，实际它说没问题 —— 那样答案与数据分叉就无人发现',
  );

  // 5. 未知缺陷类型必须被拒绝（否则清单里写错了会静默少注入一处）
  let rejected = false;
  try {
    inject(makeBase(50, 1), { injections: [{ kind: '我编的缺陷', column: '年龄', rows: [0], values: ['x'] }] });
  } catch {
    rejected = true;
  }
  check(rejected, '未知缺陷类型没有被拒绝');

  // 6. 引用不存在的列必须被拒绝
  let columnRejected = false;
  try {
    inject(makeBase(50, 1), { injections: [{ kind: 'outliers', column: '没有这一列', rows: [0], values: ['x'] }] });
  } catch {
    columnRejected = true;
  }
  check(columnRejected, '引用不存在的列没有被拒绝');

  // 7. 行号越界必须被拒绝 —— 否则会静默造出空行，而答案还写着注入成功
  let rowRejected = false;
  try {
    inject(makeBase(50, 1), { injections: [{ kind: 'outliers', column: '年龄', rows: [999], values: ['x'] }] });
  } catch {
    rowRejected = true;
  }
  check(rowRejected, '行号越界没有被拒绝');

  if (failures.length > 0) {
    console.error(`自测未通过（${failures.length} 项）：`);
    for (const failure of failures) console.error(`  ${failure}`);
    process.exitCode = 1;
    return;
  }
  console.log('自测通过：确定性、形状、注入、篡改检测、两类拒绝都符合预期');
}

const mode = process.argv.includes('--make-base')
  ? 'make-base'
  : process.argv.includes('--write')
    ? 'write'
    : process.argv.includes('--verify')
      ? 'verify'
      : process.argv.includes('--self-test')
        ? 'self-test'
        : null;

if (mode === 'make-base') writeBase();
else if (mode === 'write') writeInjected();
else if (mode === 'verify') runVerify();
else if (mode === 'self-test') runSelfTest();
else {
  console.error('用法：node knowledge/eval/dataset/injector.mjs [--make-base|--write|--verify|--self-test]');
  process.exitCode = 1;
}
