import { parseNumeric, previewCleaningResult, type CellValue, type CleaningAction, type Dataset } from '@/core';
import { confirmedValueMeaning, type BatchPolicy } from './batchPolicy';

/** 范围内不等于实测。只有明确允许的类别或已确认的单个码才可以拦截「当作缺失」。 */
export function missingCodePolicyError(policy: BatchPolicy, column: string, code: string): string | null {
  const meaning = confirmedValueMeaning(policy.rules, policy.codes, column, code);
  if (meaning === 'valid') return '本批已确认该值有效，不能按缺失处理。';
  if (meaning !== 'missing' && policy.codes[column]?.some((entry) => entry.kind !== 'valid')) {
    return '该编码与本批已确认的缺失占位码不同。如需变更，请先核对并更新本批口径。';
  }
  return null;
}

function invalidOutput(policy: BatchPolicy, column: string, value: CellValue): boolean {
  if (confirmedValueMeaning(policy.rules, policy.codes, column, value) === 'missing') return true;
  const rule = Object.hasOwn(policy.rules, column) ? policy.rules[column] : undefined;
  if (!rule) return false;
  const values = rule.allowedValues?.filter((item) => item.trim());
  if (values?.length && !values.some((item) => item.trim() === String(value).trim())) return true;
  if (rule.min === undefined && rule.max === undefined) return false;
  const numeric = parseNumeric(value);
  return numeric === null || (rule.min !== undefined && numeric < rule.min) ||
    (rule.max !== undefined && numeric > rule.max);
}

/** 在建议提交、人工修改以及执行入口共用。纯试算不会写工作表。 */
export function validateBatchAction(action: CleaningAction, policy: BatchPolicy, dataset: Dataset): string | null {
  const targetColumns = action.params.columns;
  if (action.action === 'trim_whitespace' && Array.isArray(targetColumns)) {
    const protectedColumns = dataset.columns.filter(({ name }) => targetColumns.includes(name) && policy.codes[name]?.length);
    if (protectedColumns.some(({ name, values }) => values.some((value) =>
      typeof value === 'string' && value.trim() !== value &&
      (confirmedValueMeaning(policy.rules, policy.codes, name, value) !== undefined ||
        confirmedValueMeaning(policy.rules, policy.codes, name, value.trim()) === 'missing')))) {
      return '去空白会改变本批已有定义的编码，或将文本变成已确认的缺失占位码。';
    }
  }
  const column = action.params.column;
  if (typeof column !== 'string') return null;
  if (action.action === 'set_code_missing' && typeof action.params.code === 'string') {
    return missingCodePolicyError(policy, column, action.params.code);
  }

  if (action.action === 'fill_missing') {
    const value = action.params.value;
    if ((typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') &&
        invalidOutput(policy, column, value)) return '填充值与本批已确认的取值或缺失口径冲突。';
  }

  if (action.action === 'merge_categories' && Array.isArray(action.params.groups) &&
      (Object.hasOwn(policy.rules, column) || policy.codes[column]?.length)) {
    // 先看实际归并的目标和值。组内可能没有任何匹配行，不能把未出现的变体当成改动。
    const before = dataset.columns.find(({ name }) => name === column)?.values;
    const after = previewCleaningResult(dataset, [action]).dataset.columns.find(({ name }) => name === column)?.values;
    if (before?.some((value, index) => after && value !== after[index] &&
        (confirmedValueMeaning(policy.rules, policy.codes, column, value) !== undefined ||
          invalidOutput(policy, column, after[index] ?? null)))) {
      return '类别归并会改动本批已有定义的取值，或产生与已确认口径冲突的取值。';
    }
  }
  return null;
}

/** 批量动作按实际执行顺序试跑，避免前一动作改变后一项归并的胜出值。 */
export function validateBatchActions(actions: readonly CleaningAction[], policy: BatchPolicy, dataset: Dataset): string | null {
  if (!Object.keys(policy.rules).length && !Object.keys(policy.codes).length) return null;
  let current = dataset;
  for (const action of actions) {
    const error = validateBatchAction(action, policy, current);
    if (error) return error;
    current = previewCleaningResult(current, [action]).dataset;
  }
  return null;
}
