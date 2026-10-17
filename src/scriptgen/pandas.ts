import type { CleaningAction } from '@/core';
import { chooseMergeWinner, countValues } from '@/core/cleaning/mergeWinner';
import type { ScriptInput } from './types';

/**
 * 把清洗动作序列转成可执行的 pandas 脚本。
 *
 * **为什么它是纯字符串处理**（设计文档 §4.7）：脚本要能在用户自己的环境里跑，
 * 而任何运行时依赖都会把「可复现」变成「能在我们这儿复现」。
 *
 * **为什么每段代码都要与 `core/cleaning/apply.ts` 逐条对齐**：
 * 这是这块功能存在的全部意义 —— 用户下载的脚本跑出来的结果必须与界面显示的一致。
 * 第一版有三处不一致，都是自审时逐条比对才发现的：
 *
 *   1. `merge_categories` 选了 `group[0]`，而执行器选的是**出现次数最多**的那个
 *      —— 组为 `['研究生','硕士']` 且「硕士」更常见时，两者给出**相反**的归并方向。
 *      现在两边共用 `chooseMergeWinner`（见 `core/cleaning/mergeWinner.ts`）。
 *   2. `trim_whitespace` 用 `.str.strip()`，会把数值列里的数字变成 NaN；
 *      而执行器只对字符串去空白、其余原样保留。
 *   3. `fill_missing` 用 `.fillna()`，只填 NaN，**不填空白字符串**；
 *      而执行器的缺失判据是 `isMissingValue`（null 或纯空白串）。
 *      另外布尔值被渲染成 `true`/`false` —— 那不是合法的 Python 字面量。
 */

/**
 * 把 Python 单引号字符串字面量里的引号与反斜杠转义。
 *
 * 中文列名很常见，含空格的列名也不少见，而**含单引号的列名同样可能出现**
 * （从 Excel 或问卷平台导出时常有）。不转义就是一份语法错误的脚本 ——
 * 而用户拿到它时不会知道问题出在哪。
 */
function pyString(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function pyList(values: string[]): string {
  return `[${values.map(pyString).join(', ')}]`;
}

/** 单元格取值 → Python 字面量。布尔值必须是 True/False，写成 true/false 是语法错误。 */
function pyLiteral(value: unknown): string {
  if (typeof value === 'string') return pyString(value);
  if (typeof value === 'boolean') return value ? 'True' : 'False';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'None';
  return 'None';
}

function paramsOf(action: CleaningAction): Record<string, unknown> {
  return (action.params ?? {}) as Record<string, unknown>;
}

function stringParam(params: Record<string, unknown>, key: string): string | null {
  const value = params[key];
  return typeof value === 'string' && value !== '' ? value : null;
}

function stringListParam(params: Record<string, unknown>, key: string): string[] {
  const value = params[key];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function groupsParam(params: Record<string, unknown>): string[][] {
  const value = params.groups;
  if (!Array.isArray(value)) return [];
  return value.filter(
    (group): group is string[] => Array.isArray(group) && group.every((v) => typeof v === 'string'),
  );
}

/** 动作 → 一段 pandas 代码。返回 null 表示这个动作不认识。 */
function renderAction(action: CleaningAction, dataset: ScriptInput['dataset']): string | null {
  const params = paramsOf(action);

  switch (action.action) {
    case 'merge_categories': {
      const column = stringParam(params, 'column');
      if (column === null) return null;
      const groups = groupsParam(params);
      if (groups.length === 0) return null;

      const columnValues = dataset.columns.find((item) => item.name === column)?.values ?? [];
      const counts = countValues(columnValues);

      return groups
        .map((group) => {
          // 与执行器同一个函数选统一到哪个写法 —— 这是本节最要紧的一处对齐
          const winner = chooseMergeWinner(group, counts);
          if (winner === null) return '';
          const mapping = group
            .filter((variant) => variant !== winner)
            .map((other) => `${pyString(other)}: ${pyString(winner)}`);
          if (mapping.length === 0) return '';
          return `df[${pyString(column)}] = df[${pyString(column)}].replace({${mapping.join(', ')}})`;
        })
        .filter((line) => line !== '')
        .join('\n');
    }

    case 'trim_whitespace': {
      const columns = stringListParam(params, 'columns');
      if (columns.length === 0) return null;
      // 用 apply + isinstance 而不是 .str.strip()：后者会把数值列里的数字变成 NaN，
      // 而执行器只对字符串去空白、其余原样保留
      return columns
        .map(
          (column) =>
            `df[${pyString(column)}] = df[${pyString(column)}].apply(` +
            'lambda v: v.strip() if isinstance(v, str) else v)',
        )
        .join('\n');
    }

    case 'fill_missing': {
      const column = stringParam(params, 'column');
      if (column === null || !('value' in params)) return null;
      // 用执行器同一套缺失判据（null / NaN / 纯空白串）而不是 .fillna()：
      // 后者只填 NaN，空白字符串会被漏掉，于是脚本与界面的结果不同
      return (
        `df[${pyString(column)}] = df[${pyString(column)}].apply(` +
        `lambda v: ${pyLiteral(params.value)} if _is_missing_cell(v) else v)`
      );
    }

    case 'remove_duplicates': {
      const columns = stringListParam(params, 'columns');
      // drop_duplicates 默认保留首次出现的一行，与执行器一致
      return columns.length > 0
        ? `df = df.drop_duplicates(subset=${pyList(columns)})`
        : 'df = df.drop_duplicates()';
    }

    default:
      return null;
  }
}

/** `fill_missing` 需要的缺失判据，与执行器用的 `isMissingValue` 逐条对应。 */
const MISSING_HELPER = [
  'def _is_missing_cell(v):',
  '    """与界面执行器的缺失判据一致：None、NaN、纯空白字符串。"""',
  '    if v is None:',
  '        return True',
  '    if isinstance(v, float) and pd.isna(v):',
  '        return True',
  '    if isinstance(v, str) and v.strip() == "":',
  '        return True',
  '    return False',
];

/**
 * 这个文本会被数值化改写吗？
 *
 * 判据是「改写之后文本变了」而不是「看起来像数字」：
 *   - `'5'`   → 5   → 写回还是 `'5'`，不必干预（硬加 dtype 反而会改变比较与空值行为）
 *   - `'001'` → 1   → 写回是 `'1'`，**前导零没了**
 *   - `'5.50'` → 5.5 → 小数位被抹平
 *   - `'1e3'` → 1000 → 科学计数法被展开
 *
 * **两点要说清，否则注释会比实现承诺得多**：
 *   1. 实现用的是「JS `Number` 能否原样往返」，不是「pandas 的解析器会不会改写」。
 *      两者在边角上不同：`'0x10'`（JS 认 16、pandas 当字符串）、超过 2^53 的整数
 *      （pandas 能原样写回）会被误加 dtype。今天没有实质后果 —— 同一列本来就都是
 *      字符串，加 dtype 只是让它保持字符串 —— 但这是判据的近似，不是精确等价。
 *   2. 解析层已经 `trim()` 过、空串转 null（`src/parser/csv.ts`），所以 Dataset 里
 *      **不该出现首尾空白**。下面的空白分支只是防御解析口径变化，不是真实输入。
 */
function isRewrittenByNumber(value: string): boolean {
  // 纯空白按缺失处理（与 `isMissingValue` 同一判据），不涉及数值化
  if (value.trim() === '') return false;
  const number = Number(value);
  if (!Number.isFinite(number)) return false;
  return String(number) !== value;
}

/**
 * 哪些列必须以文本读回。
 *
 * pandas 的默认类型推断会把 `'001'` 读成 `1`。而界面里的单元格是**原文**，
 * 于是「脚本跑出来的结果」与「界面上看到的结果」在学号、编号、行政区划码这类字段上
 * 不一致 —— 这直接违背「脚本是真跑过的」那条硬承诺（见文件头）。
 *
 * 只对**确实会被改写**的列加 dtype，不一刀切 `dtype=str`：把所有列都读成字符串会
 * 改变数值列的空值、比较与舍入行为，那是用一个不一致换另一个不一致。
 *
 * 成本：最坏情况要扫一遍文本单元格（`some` 命中即停）。它是用户点「导出」时跑一次，
 * 与整份脚本生成的其它开销同量级。
 */
function columnsNeedingText(dataset: ScriptInput['dataset']): string[] {
  return dataset.columns
    .filter((column) =>
      column.values.some((value) => typeof value === 'string' && isRewrittenByNumber(value)),
    )
    .map((column) => column.name);
}

/** pandas 的 dtype 映射字面量：`{'学号': str, '编号': str}` */
function pyDtypeMapping(columns: string[]): string {
  return `{${columns.map((column) => `${pyString(column)}: str`).join(', ')}}`;
}

export function buildPandasScript(input: ScriptInput): string {
  const { dataset, sourceFileName, actions } = input;

  // 哪些列必须按文本读回，见 `columnsNeedingText` 的说明
  const textColumns = columnsNeedingText(dataset);
  const dtypeArgument = textColumns.length > 0 ? `, dtype=${pyDtypeMapping(textColumns)}` : '';

  const header = [
    '#!/usr/bin/env python3',
    '# -*- coding: utf-8 -*-',
    '"""',
    '本脚本由「科研数据质量治理 Agent」生成 —— 它是界面中那次清洗的等价复现。',
    '',
    `源文件：${sourceFileName}`,
    `列：${dataset.columns.map((column) => column.name).join('、')}`,
    `行数：${dataset.rowCount}`,
    '',
    '用法：把 SOURCE 改成你的原始文件路径，然后 python 运行本脚本。',
    '"""',
    '',
    'import pandas as pd',
    '',
    `SOURCE = ${pyString(sourceFileName)}`,
    'OUTPUT = SOURCE.rsplit(".", 1)[0] + "_cleaned.csv"',
    '',
    // 说清 dtype 为什么在这：用户看到 `dtype={'学号': str}` 会问「为什么不自动识别」
    ...(textColumns.length > 0
      ? [
          '# 下面这几列必须以文本读回：pandas 默认会把 "001" 读成 1，前导零就丢了，',
          '# 那样脚本跑出来的结果与界面显示的不一致。其余列仍按 pandas 的推断处理。',
          '# 注意：dtype 只解决数值化改写，不解决 "NA"/"N/A"/"NULL" 这类值——',
          '# 它们仍会被 pandas 当成缺失值读走（这是已知局限，见交接说明的欠账清单）。',
          '',
        ]
      : []),
    // 按扩展名分派：Excel 要 read_excel。
    // CSV 一律用 utf-8-sig —— 我们自己导出的清洗后 CSV 带 BOM，而 pandas 默认不认它，
    // 首列名会带上一个不可见字符，于是后面每一处 df['列名'] 都 KeyError。
    // 不用 BOM 的文件也能正常读，所以这个选择没有代价。
    'if SOURCE.lower().endswith((".xlsx", ".xls")):',
    `    df = pd.read_excel(SOURCE${dtypeArgument})`,
    'else:',
    `    df = pd.read_csv(SOURCE, encoding="utf-8-sig"${dtypeArgument})`,
    '',
  ];

  const body: string[] = [];
  for (const action of actions) {
    const rendered = renderAction(action, dataset);
    if (rendered === null) {
      // 不认识的动作留一条注释而不是静默丢掉：脚本要能逐条对上界面上发生过什么，
      // 而「脚本比界面少做了一步」是最难发现的一类不一致
      body.push(`# 未识别的动作，未生成代码：${action.action}`);
      continue;
    }
    body.push(`# ${action.rationale}`);
    body.push(rendered);
    body.push('');
  }

  if (body.length === 0) {
    body.push('# 本次没有确认任何清洗动作，脚本只做读入与原样写出。', '');
  }

  // 只有真的用到时才输出缺失判据 —— 否则每份脚本都带一段用不上的函数
  const needsHelper = actions.some((action) => action.action === 'fill_missing');

  const footer = ['df.to_csv(OUTPUT, index=False)', 'print(f"已写出 {OUTPUT}，共 {len(df)} 行")', ''];

  return [
    ...header,
    ...(needsHelper ? [...MISSING_HELPER, ''] : []),
    ...body,
    ...footer,
  ].join('\n');
}
