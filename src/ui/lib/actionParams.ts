import { actionDisplayName, type CellValue, type Dataset } from '@/core';
import type { CleaningAction } from '@/agent/shared/schemas';

/**
 * 「修改后执行」的参数编辑与校验。
 *
 * 这里只给**会改数据**的动作提供编辑：merge_categories / trim_whitespace /
 * fill_missing / remove_duplicates。`fill_or_drop`、`review_*`、`unify_unit*`
 * 这类建议本来就是「请人工判断」，执行器也只记成「已确认、不改数据」——
 * 给它们编辑参数只会制造「改了却没生效」的错觉，所以界面改成只记录备注。
 *
 * 校验放在界面与执行器之间：执行器仍会再校验一次（那是最后一道防线），
 * 这里负责在点「确认修改」之前给出可读的错误，而不是等到执行时才发现。
 */
const EDITABLE_ACTION_SET = new Set([
  'merge_categories',
  'trim_whitespace',
  'fill_missing',
  'remove_duplicates',
]);

const SPLIT = /[,，、;；\s]+/;

export interface ActionParamDraft {
  /** 类别归并：一行一组，组内用逗号/顿号/空格分隔 */
  groups: string;
  /** 目标列：逗号/顿号分隔 */
  columns: string;
  /** 填入值：数字、true/false 或任意文本 */
  value: string;
}

export function isEditableAction(action: string): boolean {
  return EDITABLE_ACTION_SET.has(action);
}

/** 自动动作的范围只从执行器实际读取的参数推导；按键去重与整行去重必须明确区分。 */
export function validateReviewAction(action: CleaningAction, issueColumns: readonly string[], dataset: Dataset):
  { ok: true; scope: string | null } | { ok: false; error: string } {
  const fail = (error: string) => ({ ok: false as const, error });
  const comparison = action.action === 'set_code_missing' || action.action === 'review_keep_missing_code';
  if (!isEditableAction(action.action) && !comparison) return { ok: true, scope: null };
  const params = action.params;
  const names = dataset.columns.map(({ name }) => name);
  const allowed = issueColumns.length ? issueColumns : names;
  let targets: string[];
  if (action.action === 'trim_whitespace' || action.action === 'remove_duplicates') {
    const columns = params.columns;
    if (Object.keys(params).some((key) => key !== 'columns') || !Array.isArray(columns) ||
      !columns.every((name): name is string => typeof name === 'string' && name.length > 0) ||
      (action.action === 'trim_whitespace' && columns.length === 0)) {
      return fail('请在参数 columns 中明确列名；只有整行去重可以明确填写空数组 []。');
    }
    targets = columns;
  } else {
    const field = comparison ? 'code' : action.action === 'fill_missing' ? 'value' : 'groups';
    if (typeof params.column !== 'string' || !params.column ||
      Object.keys(params).some((key) => key !== 'column' && key !== field)) return fail('请提供正确的列名与动作参数。');
    if (field === 'groups' && (!Array.isArray(params.groups) || params.groups.length === 0 ||
      !params.groups.every((group) => Array.isArray(group) && group.length >= 2 &&
        group.every((value) => typeof value === 'string' && value.trim())))) return fail('归并分组每组至少应有两种写法。');
    if (field === 'value' && !(typeof params.value === 'boolean' ||
      (typeof params.value === 'string' && params.value.trim()) || Number.isFinite(params.value))) {
      return fail('填入的值必须为非空文本、有限数字或布尔值。');
    }
    if (comparison && (!action.comparison || params.code !== action.comparison.code ||
      params.column !== action.comparison.column || action.comparison.choice !==
        (action.action === 'set_code_missing' ? 'as-missing' : 'keep') || typeof params.code !== 'string' ||
      !params.code.trim() || params.code.length > 80)) return fail('清洗口径必须与用户确认的试算一致。');
    targets = [params.column];
  }
  if (new Set(targets).size !== targets.length || new Set(action.columns).size !== action.columns.length ||
    targets.length !== action.columns.length || !targets.every((name) => action.columns.includes(name))) {
    return fail('实际动作参数里的列与建议展示的列不一致。');
  }
  const actual = targets.length ? targets : names;
  if (actual.some((name) => names.filter((column) => column === name).length !== 1 || !allowed.includes(name))) {
    return fail('实际目标列不唯一、不存在，或超出了本条问题的字段范围。');
  }
  const scope = action.action === 'remove_duplicates'
    ? (targets.length ? `以「${targets.join('、')}」判重，删除后出现的整条记录` : '比较全部字段，删除后出现的整条重复记录')
    : `字段「${targets.join('、')}」`;
  return { ok: true, scope };
}

function splitNames(text: string): string[] {
  return text
    .split(SPLIT)
    .map((item) => item.trim())
    .filter(Boolean);
}

/** 用建议里的原始参数初始化编辑器；没有的参数留空 */
export function draftOf(suggestion: CleaningAction): ActionParamDraft {
  const params = suggestion.params ?? {};
  const groups = Array.isArray(params.groups)
    ? params.groups
        .filter((group): group is string[] => Array.isArray(group))
        .map((group) => group.join('、'))
        .join('\n')
    : '';
  const columns = Array.isArray(params.columns)
    ? params.columns.filter((value): value is string => typeof value === 'string').join('、')
    : suggestion.columns.join('、');
  const value =
    typeof params.value === 'string' ||
    typeof params.value === 'number' ||
    typeof params.value === 'boolean'
      ? String(params.value)
      : '';

  return { groups, columns, value };
}

function missingColumn(dataset: Dataset, name: string): boolean {
  return !dataset.columns.some((column) => column.name === name);
}

function withParams(suggestion: CleaningAction, params: Record<string, unknown>, columns: string[]): CleaningAction {
  return { ...suggestion, params, columns };
}

/** 填值：数字与布尔按字面类型解析，其余保持字符串 */
function parseCellValue(text: string): CellValue | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  return text;
}

export type ParsedAction =
  | { ok: true; action: CleaningAction }
  | { ok: false; error: string };

export function parseDraft(
  suggestion: CleaningAction,
  draft: ActionParamDraft,
  dataset: Dataset,
): ParsedAction {
  switch (suggestion.action) {
    case 'merge_categories': {
      const column = typeof suggestion.params.column === 'string' ? suggestion.params.column : '';
      if (column === '') return { ok: false, error: '这条建议没有指定要归并哪一列' };
      if (missingColumn(dataset, column)) {
        return { ok: false, error: `数据里没有名为「${column}」的列` };
      }

      const groups = draft.groups
        .split('\n')
        .map((line) => splitNames(line))
        .filter((group) => group.length > 0);
      if (groups.length === 0) return { ok: false, error: '至少填一组要归并的写法，例如「硕士、研究生」' };
      const tooShort = groups.find((group) => group.length < 2);
      if (tooShort) {
        return { ok: false, error: `每组至少要有两个写法才能归并：「${tooShort.join('、')}」只有一个` };
      }

      return { ok: true, action: withParams(suggestion, { column, groups }, [column]) };
    }

    case 'trim_whitespace': {
      const columns = splitNames(draft.columns);
      if (columns.length === 0) return { ok: false, error: '至少填一个要去空白的列名' };
      const unknown = columns.filter((name) => missingColumn(dataset, name));
      if (unknown.length > 0) return { ok: false, error: `数据里没有这些列：${unknown.join('、')}` };
      return { ok: true, action: withParams(suggestion, { columns }, columns) };
    }

    case 'fill_missing': {
      const column = typeof suggestion.params.column === 'string' ? suggestion.params.column : '';
      if (column === '') return { ok: false, error: '这条建议没有指定要填补哪一列' };
      if (missingColumn(dataset, column)) {
        return { ok: false, error: `数据里没有名为「${column}」的列` };
      }
      const value = parseCellValue(draft.value);
      if (value === null) return { ok: false, error: '填入的值不能为空' };
      return { ok: true, action: withParams(suggestion, { column, value }, [column]) };
    }

    case 'remove_duplicates': {
      // 留空表示按整行判重，与执行器的口径一致
      const columns = splitNames(draft.columns);
      const unknown = columns.filter((name) => missingColumn(dataset, name));
      if (unknown.length > 0) return { ok: false, error: `数据里没有这些列：${unknown.join('、')}` };
      return { ok: true, action: withParams(suggestion, { columns }, columns) };
    }

    default:
      return { ok: false, error: `「${actionDisplayName(suggestion.action)}」不支持编辑参数` };
  }
}
