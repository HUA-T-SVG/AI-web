import type { CellValue, RangeRule } from '@/core';
import type { RuleRecord } from '@/knowledge/types';

export interface BatchCode {
  column: string;
  code: string;
  quote: string;
  /** 旧记录没有 kind，含义是缺失占位码。 */
  kind?: 'valid';
}

export interface BatchPolicy {
  rules: Readonly<Record<string, RangeRule>>;
  codes: Readonly<Record<string, readonly BatchCode[]>>;
}

export type ConfirmedValueMeaning = 'valid' | 'missing';
export type RuleRelationship = 'reference' | 'conflict' | 'out-of-scope';

function localRule(rules: BatchPolicy['rules'], column: string): RangeRule | undefined {
  return Object.hasOwn(rules, column) && rules[column]?.column === column ? rules[column] : undefined;
}

function localCodes(codes: BatchPolicy['codes'], column: string): readonly BatchCode[] {
  return Object.hasOwn(codes, column) ? (codes[column] ?? []).filter((entry) => entry.column === column) : [];
}

/**
 * 显式码与实际清洗一样逐字比较，保留前导零；允许值清单沿用值域检查首尾空白规则。
 * 上下界只说明值是否越界，不能推导一个处在区间内的数值是实义码或缺失码。
 */
export function confirmedValueMeaning(
  rules: BatchPolicy['rules'],
  codes: BatchPolicy['codes'],
  column: string,
  value: CellValue,
): ConfirmedValueMeaning | undefined {
  if (value === null || (typeof value === 'number' && !Number.isFinite(value))) return undefined;
  const text = String(value);
  const matches = typeof value === 'boolean' ? [] : localCodes(codes, column).filter(({ code }) => code === text);
  const missing = matches.some(({ kind }) => kind === undefined);
  const valid = matches.some(({ kind }) => kind === 'valid') ||
    (localRule(rules, column)?.allowedValues?.some((item) => item.trim() !== '' && item.trim() === text.trim()) ?? false);
  // 老配置如果包含矛盾口径，宁可待核对，不能任意决定数据含义。
  if (valid === missing) return undefined;
  return valid ? 'valid' : 'missing';
}

export interface BatchPolicySummary {
  column: string;
  range: boolean;
  allowed: boolean;
  valid: boolean;
  missing: boolean;
}

/** 唯一允许出站的本批口径摘要：列名和存在标记，原文、码值和上下限只留本机。 */
export function summarizeBatchPolicy(policy: BatchPolicy, columns: readonly string[]): BatchPolicySummary[] {
  return [...new Set(columns)].flatMap((column) => {
    const rule = localRule(policy.rules, column);
    const codes = localCodes(policy.codes, column);
    const min = rule?.min;
    const max = rule?.max;
    const range = (min !== undefined || max !== undefined) && (min === undefined || Number.isFinite(min)) &&
      (max === undefined || Number.isFinite(max)) && (min === undefined || max === undefined || min <= max);
    const allowed = rule?.allowedValues?.some((item) => item.trim() !== '') ?? false;
    const valid = codes.some(({ kind }) => kind === 'valid');
    const missing = codes.some(({ kind }) => kind === undefined);
    return range || allowed || valid || missing ? [{ column, range, allowed, valid, missing }] : [];
  });
}

/**
 * 已人工核对的触发示例。原文都是有条件提示，这里只判断「不能拿该条当作这一码
 * 的缺失依据」，并不声称知识库的文字断言了该码是缺失。未知规则从不自动读正文判冲突。
 */
const genericMissingExamples: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ['general-missing-sentinel', new Set(['99', '999', '-99'])],
  ['general-missing-negative-code', new Set(['-1', '-2', '-3', '-9'])],
  ['general-missing-literal', new Set(['NA', 'N/A', 'null', 'NULL', '无', '未填', '不详', '/', '--'])],
]);

const fieldKey = (field: string) => field.replace(/\s+/g, '').toLowerCase();

/**
 * 按列判断适用性。对多列请求，先判断规则适用哪一列；仅当该条无法用于任一
 * 目标列时才整条排除。上层可以用单列调用限定证据，不会把冲突传到另一列。
 */
export function ruleRelationship(
  rule: RuleRecord,
  columns: readonly string[],
  policy: BatchPolicy,
  /** 若调用方掌握具体码，只比较这个码，避免用一个已确认的码阻断其它码的核对。 */
  targetValue?: CellValue,
): RuleRelationship {
  const fields = rule.适用字段;
  if (!columns.length) return fields.length ? 'out-of-scope' : 'reference';
  const keys = new Set(fields.map(fieldKey));
  const matching = columns.filter((column) => !fields.length || keys.has(fieldKey(column)));
  if (matching.length === 0) return 'out-of-scope';

  const examples = genericMissingExamples.get(rule.id);
  if (targetValue === undefined || targetValue === null || !examples?.has(String(targetValue))) return 'reference';
  return matching.every((column) =>
    confirmedValueMeaning(policy.rules, policy.codes, column, targetValue) === 'valid') ? 'conflict' : 'reference';
}
