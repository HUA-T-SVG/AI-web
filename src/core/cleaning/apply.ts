import { encodeRowKey } from '../encoding';
import { isMissingValue, type CellValue, type Dataset } from '../types';
import { actionDisplayName } from './actionLabels';
import { chooseMergeWinner, countValues } from './mergeWinner';
import type {
  ActionSnapshot,
  AppliedAction,
  CleaningAction,
  CleaningResult,
  MergeGroupResolution,
  MergeResolution,
  SkippedAction,
} from './types';

/**
 * 清洗执行引擎。
 *
 * 三条不变式，测试逐条钉着：
 *
 * 1. **绝不就地修改入参。** 撤销、留痕、脚本导出三件事都建立在「原数据还在」之上。
 * 2. **失败进 `skipped` 并带理由。** 静默跳过会让用户以为已经洗过了 ——
 *    而「以为洗过了」在科研场景里比「没洗」更危险。
 * 3. **每个动作执行后，所有列的长度必须等于 rowCount。** 这是清洗最容易出错的地方，
 *    而长度不齐会在下游的每一次画像与统计里表现为莫名其妙的数字。
 */

function snapshotOf(dataset: Dataset): ActionSnapshot {
  const uniqueCounts: Record<string, number> = {};
  for (const column of dataset.columns) {
    uniqueCounts[column.name] = new Set(column.values.map((value) => String(value ?? ''))).size;
  }
  return { rowCount: dataset.rowCount, uniqueCounts };
}

/** 浅拷贝一层：`columns` 数组与每个 column 都换新对象，`values` 留给动作自己复制。 */
function cloneShallow(dataset: Dataset): Dataset {
  return {
    rowCount: dataset.rowCount,
    columns: dataset.columns.map((column) => ({ name: column.name, values: [...column.values] })),
  };
}

/**
 * 按列名取列。
 *
 * 返回判别式联合（而不是「有 error 字段就算失败」）—— 后者在 TS 里
 * 会因为 union 成员缺少该字段而把 `error` 推成 `string | undefined`，
 * 于是每个调用点都要多写一次空判断，而那正是不该散落在各处的逻辑。
 */
function findColumn(
  dataset: Dataset,
  name: unknown,
): { ok: true; column: Dataset['columns'][number] } | { ok: false; error: string } {
  if (typeof name !== 'string' || name === '') return { ok: false, error: '动作没有指定列名' };
  const column = dataset.columns.find((item) => item.name === name);
  if (!column) {
    const known = dataset.columns.map((item) => item.name).join('、');
    return { ok: false, error: `数据里没有名为「${name}」的列。现有列：${known}` };
  }
  return { ok: true, column };
}

function readStringGroups(params: Record<string, unknown>): string[][] | null {
  const groups = params.groups;
  if (!Array.isArray(groups)) return null;
  const parsed = groups.filter(
    (group): group is string[] => Array.isArray(group) && group.every((v) => typeof v === 'string'),
  );
  return parsed.length === groups.length ? parsed : null;
}

/**
 * 归并类别：把每组里的写法统一成**出现次数最多**的那个。
 *
 * 并列时取组内第一个 —— 顺序来自模型建议或用户界面上的排列，是可解释的；
 * 取字典序则是任意的，用户看不出为什么选了那一个。
 */
function mergeCategories(
  dataset: Dataset,
  params: Record<string, unknown>,
): { dataset: Dataset; mergeResolution: MergeResolution } | { reason: string } {
  const found = findColumn(dataset, params.column);
  if (!found.ok) return { reason: found.error };

  const groups = readStringGroups(params);
  if (groups === null) return { reason: '动作参数里缺少 groups（应为二维字符串数组）' };

  const next = cloneShallow(dataset);
  const target = next.columns.find((item) => item.name === found.column.name);
  if (!target) return { reason: `数据里没有名为「${String(params.column)}」的列` };

  // 归一化用与脚本生成同一份函数：两边各写一遍必然分叉，
  // 而分叉的后果是「脚本跑出来与界面显示不一致」（见 mergeWinner.ts 的说明）
  const counts = countValues(target.values);
  const resolvedGroups: MergeGroupResolution[] = [];

  for (const group of groups) {
    const winner = chooseMergeWinner(group, counts);
    if (winner === null) continue;
    const membership = new Set(group.filter((variant) => variant !== winner));
    target.values = target.values.map((raw) =>
      !isMissingValue(raw) && membership.has(String(raw)) ? (winner as CellValue) : raw,
    );
    // 记录**这一步实际用的方向**。后续动作会改变计数，所以脚本不能拿最终数据重算；
    // 组按执行顺序保留，重叠组也不会被压平成一张 dict（例如 {a:b,b:c} 同时替换
    // 和「先 a→b 再 b→c」的结果不同）。
    resolvedGroups.push({
      winner,
      mapping: Object.fromEntries([...membership].map((variant) => [variant, winner])),
    });
  }

  return {
    dataset: next,
    mergeResolution: { column: found.column.name, groups: resolvedGroups },
  };
}

function trimWhitespace(
  dataset: Dataset,
  params: Record<string, unknown>,
): { dataset: Dataset } | { reason: string } {
  const names = Array.isArray(params.columns)
    ? params.columns.filter((value): value is string => typeof value === 'string')
    : [];
  if (names.length === 0) return { reason: '动作参数里缺少 columns（要处理的列名数组）' };

  const missing = names.filter((name) => !dataset.columns.some((column) => column.name === name));
  if (missing.length > 0) {
    const known = dataset.columns.map((item) => item.name).join('、');
    return { reason: `数据里没有名为「${missing.join('、')}」的列。现有列：${known}` };
  }

  const next = cloneShallow(dataset);
  const targets = new Set(names);
  for (const column of next.columns) {
    if (!targets.has(column.name)) continue;
    column.values = column.values.map((raw) => (typeof raw === 'string' ? raw.trim() : raw));
  }
  return { dataset: next };
}

function fillMissing(
  dataset: Dataset,
  params: Record<string, unknown>,
): { dataset: Dataset } | { reason: string } {
  const found = findColumn(dataset, params.column);
  if (!found.ok) return { reason: found.error };
  if (!('value' in params)) return { reason: '动作参数里缺少 value（要填入的值）' };

  const fill = params.value as CellValue;
  if (typeof fill !== 'string' && typeof fill !== 'number' && typeof fill !== 'boolean') {
    return { reason: 'value 只能是字符串、数字或布尔值' };
  }

  const next = cloneShallow(dataset);
  const target = next.columns.find((item) => item.name === found.column.name);
  if (!target) return { reason: `找不到列「${String(params.column)}」` };
  target.values = target.values.map((raw) => (isMissingValue(raw) ? fill : raw));
  return { dataset: next };
}

/** 整行比较用：把一行拼成稳定的键（保留取值类型与字段边界）。 */
function rowKey(dataset: Dataset, rowIndex: number): string {
  return encodeRowKey(dataset.columns.map((column) => column.values[rowIndex] ?? null));
}

function removeDuplicates(
  dataset: Dataset,
  params: Record<string, unknown>,
): { dataset: Dataset } | { reason: string } {
  const named = Array.isArray(params.columns)
    ? params.columns.filter((value): value is string => typeof value === 'string')
    : [];
  const keys = named.length > 0 ? named : dataset.columns.map((column) => column.name);

  const missing = keys.filter((name) => !dataset.columns.some((column) => column.name === name));
  if (missing.length > 0) return { reason: `数据里没有名为「${missing.join('、')}」的列` };

  const keep: number[] = [];
  const seen = new Set<string>();
  for (let row = 0; row < dataset.rowCount; row += 1) {
    // 不能 String() 后拼接：数字 1 与文本 "1"、null 与 "null" 会被误判成重复
    const key = encodeRowKey(
      keys.map((name) => {
        const column = dataset.columns.find((item) => item.name === name);
        return column?.values[row] ?? null;
      }),
    );
    if (seen.has(key)) continue;
    seen.add(key);
    keep.push(row);
  }
  if (keep.length === dataset.rowCount) return { dataset: cloneShallow(dataset) };

  return {
    dataset: {
      rowCount: keep.length,
      columns: dataset.columns.map((column) => ({
        name: column.name,
        values: keep.map((row) => column.values[row] ?? null),
      })),
    },
  };
}

/**
 * 「已确认、但不自动改动数据」的动作。
 *
 * 为什么需要这一族：有些问题的处置**本来就不能自动做** —— 「哪两条是重复」
 * 「越界值该改成多少」都要人对着业务口径判断。这类建议的动作标识以 `review_`
 * 开头（`review_duplicates`、`review_range_violations`），语义是「用户已确认，
 * 记下这件事，但不要动数据」。
 *
 * 把它与「不认识的动作」分开很重要：两者在界面上是两种不同的信息 ——
 * 前者是「处理完了、无需改动」，后者是「这条没能执行」。混成一条，用户会以为
 * 自己的确认丢了，或者以为数据被改了。
 */
const NON_MUTATING_PREFIX = 'review_';

/**
 * 除了前缀之外，还有几个动作名是「要人拍板、程序不该自动改」的。
 *
 * 为什么要有这份名单：检查项产出的 `suggestion.action` 与执行器的动作台账
 * 是**两张表**，而对上它们之前没有任何测试守过。于是 `missing` 检查建议
 * `fill_or_drop`、单位检查建议 `unify_unit`，而执行器两个都不认识 ——
 * 用户在审阅列表点了「接受」再点「执行清洗」，得到的是「不认识的动作」。
 * 他确认了产品自己建议他做的事，产品却说做不到。
 *
 * 这几个动作的语义本来就是「请人工判断」：
 *   - `fill_or_drop`：缺失值该填还是该删，取决于这一列的业务含义
 *   - `unify_unit` / `unify_unit_notation`：统一到哪个单位、纯数字那些算不算缺失，
 *     都要对着原始记录确认，自动换算会直接把数据改错
 * 所以它们归进「已确认但不改数据」，而不是补一套自动换算逻辑。
 *
 * `__tests__` 里有一条覆盖性测试盯着这张名单：把 `runAllChecks` 产出的所有
 * 动作名喂进执行器，断言没有一条落进 `skipped`。新增检查项时它会先报错。
 */
const NON_MUTATING_ACTIONS = new Set([
  'fill_or_drop',
  'unify_unit',
  'unify_units',
  'unify_unit_notation',
  'normalize_type',
  'flag_missing_not_impute',
  'merge_categories_after_review',
  'rename_columns',
  'review_unit_family',
  'review_unit_mix',
]);

/** 动作台账。未登记的动作会被拒绝并说明是哪一条 —— 不静默忽略。 */
type HandlerOutcome = { dataset: Dataset; mergeResolution?: MergeResolution } | { reason: string };
const HANDLERS: Record<
  string,
  (dataset: Dataset, params: Record<string, unknown>) => HandlerOutcome
> = {
  merge_categories: mergeCategories,
  trim_whitespace: trimWhitespace,
  fill_missing: fillMissing,
  remove_duplicates: removeDuplicates,
};

/** 不改数据的动作只做确认，回一个原样的浅拷贝。 */
function markReviewed(dataset: Dataset): { dataset: Dataset } {
  return { dataset: cloneShallow(dataset) };
}

function countChangedCells(before: Dataset, after: Dataset): number {
  if (before.rowCount !== after.rowCount) return before.rowCount - after.rowCount;
  let changed = 0;
  for (const column of before.columns) {
    const next = after.columns.find((item) => item.name === column.name);
    if (!next) continue;
    for (let row = 0; row < column.values.length; row += 1) {
      if (column.values[row] !== next.values[row]) changed += 1;
    }
  }
  return changed;
}

export function applyCleaningActions(dataset: Dataset, actions: CleaningAction[]): CleaningResult {
  let current = cloneShallow(dataset);
  const applied: AppliedAction[] = [];
  const skipped: SkippedAction[] = [];

  for (const action of actions) {
    // 「人工确认类」动作不是未知动作：它们被明确登记为「不改数据」，
    // 所以走的是 applied 而不是 skipped（见 NON_MUTATING_ACTIONS 的说明）
    const handler =
      action.action.startsWith(NON_MUTATING_PREFIX) || NON_MUTATING_ACTIONS.has(action.action)
        ? () => markReviewed(current)
        : HANDLERS[action.action];
    if (!handler) {
      skipped.push({
        action,
        // 给用户看的理由全用中文动作名：`frobnicate` 这种标识符对读者没有意义，
        // 但也不能把它藏起来 —— 句末用「标识：xxx」保留可追溯性。
        reason:
          `「${actionDisplayName(action.action)}」没有登记自动执行规则，未改动数据` +
          `（标识：${action.action}）。可自动执行的动作：` +
          `${Object.keys(HANDLERS).map((name) => actionDisplayName(name)).join('、')}；` +
          `需要人工拍板的动作会被记成「已确认、不改数据」。`,
      });
      continue;
    }

    const before = snapshotOf(current);
    let outcome: HandlerOutcome;
    try {
      outcome = handler(current, action.params ?? {});
    } catch (error) {
      // 单个动作出错不该让整批清洗失败 —— 与 runAllChecks 的失败隔离同一个道理
      outcome = {
        reason: `执行「${actionDisplayName(action.action)}」时出错：${error instanceof Error ? error.message : String(error)}`,
      };
    }

    if ('reason' in outcome) {
      skipped.push({ action, reason: outcome.reason });
      continue;
    }

    // 不变式：任何动作之后，每列长度都必须等于 rowCount
    const broken = outcome.dataset.columns.find(
      (column) => column.values.length !== outcome.dataset.rowCount,
    );
    if (broken) {
      skipped.push({
        action,
        reason: `执行「${actionDisplayName(action.action)}」后列「${broken.name}」的长度与行数不一致，该动作已丢弃。`,
      });
      continue;
    }

    const changedCells = countChangedCells(current, outcome.dataset);
    current = outcome.dataset;
    applied.push({
      action,
      appliedAt: new Date().toISOString(),
      before,
      after: snapshotOf(current),
      changedCells,
      ...(outcome.mergeResolution !== undefined
        ? { mergeResolution: outcome.mergeResolution }
        : {}),
    });
  }

  return { dataset: current, applied, skipped };
}

export { rowKey };
