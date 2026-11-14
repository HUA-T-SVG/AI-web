import { dictionaryCandidateSchema, type DictionaryCandidate } from '@/agent/shared/dataDictionary';
import { parseNumeric, type RangeRule } from '@/core';

export type DictionaryMissingCode = { column: string; code: string; quote: string };

export interface PreparedDictionaryCandidate {
  id: string;
  candidate: DictionaryCandidate;
  /** 只预填精确且唯一的列；别名由用户手动选择。 */
  column: string | null;
  error: string | null;
}

export type DictionarySelectionResult =
  | { ok: true; rules: RangeRule[]; missingCodes: DictionaryMissingCode[] }
  | { ok: false; error: string };

const SENTENCE_END = /[\n\r。；;！？!?]/u;
const STATEMENT_END = /[\n\r。！？!?]/u;
const BULLET = /^(?:[-*•]\s*|\d+[.)、]\s*)?$/u;
const CONDITIONAL = /(?:若|如果|当.{0,12}时|除非|仅在|仅适用|只适用|适用于|只针对|仅针对|除外|例外|情况下|举例|例如|比如|示例|旧版|旧口径|仅供参考|暂定|待确认)/u;
const NEGATED = /(?:不(?:是|算|视为|作为|表示|代表|计为|允许|应|一定|建议|采用|使用|确定)|并非|无需|不得)/u;
const NUMBER = '[+-]?(?:\\d+(?:\\.\\d+)?|\\.\\d+)';
const CLOSED_INTERVAL = new RegExp(
  '\\[ *(' + NUMBER + ') *(?:,|、) *(' + NUMBER + ') *\\]|(' + NUMBER +
  ') *(?:至|到|~|～|–|—|−|-) *(' + NUMBER + ')(?![0-9.])', 'gu',
);
const BOUND_BEFORE = new RegExp(
  '(下限|最低(?:值|分)?|至少|不少于|不低于|大于等于|>=|≥|上限|最高(?:值|分)?|满分|至多|不超过|不高于|小于等于|<=|≤)' +
  ' *(?:为|是|[:=])? *(' + NUMBER + ')(?![0-9.])', 'gu',
);
const BOUND_AFTER = new RegExp('(' + NUMBER + ') *(?:个|分|岁|元)? *(及以上|及以下|以上含本数|以下含本数)', 'gu');
const LOWER_BOUND = /^(?:下限|最低|至少|不少于|不低于|大于等于|>=|≥)/u;

function quoteHasSource(text: string, quote: string): boolean {
  for (let start = text.indexOf(quote); start >= 0; start = text.indexOf(quote, start + 1)) {
    const end = start + quote.length;
    const before = text.slice(0, start).split(STATEMENT_END).at(-1)?.trim() ?? '';
    const after = text.slice(end).replace(/^[ \t]+/u, '');
    // 不能只抄「999 表示缺考」而跳过同一条定义的前半句或否定词。
    if (BULLET.test(before) && (STATEMENT_END.test(quote.at(-1) ?? '') ||
        after === '' || STATEMENT_END.test(after[0]!) || after === '.')) return true;
  }
  return false;
}

function containsExactLabel(text: string, field: string): boolean {
  return new RegExp('(?<![a-zA-Z0-9_])' + escapeRegExp(field) + '(?![a-zA-Z0-9_])', 'u').test(text);
}

function startsWithField(text: string, field: string): boolean {
  const prefix = '^(?:[-*•]\\s*|\\d+[.)、]\\s*)?(?:字段\\s*)?[「『【“"]?';
  const terminator = '(?=$|\\s|[」』】”"：:]|范围|取值|只允许|仅允许|允许|缺失|缺考|最低|最高|下限|上限|满分|(?::|[0-9]+)\\s*(?:表示|代表))';
  return new RegExp(prefix + escapeRegExp(field) + terminator, 'u').test(text.trim());
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^$(){}|[\]\\]/g, '\\$&');
}

/** 分号后无主词的约束可承接同一行；换行、句号或新字段会结束承接。 */
function evidenceClauses(quote: string, field: string, columns: readonly string[]): string[] {
  const clauses: string[] = [];
  let previousField = false;
  for (const part of quote.split(/([\n\r。；;！？!?])/u)) {
    if (SENTENCE_END.test(part)) {
      if (part !== '；' && part !== ';') previousField = false;
      continue;
    }
    const named = startsWithField(part, field);
    const hasAnotherField = columns.some((column) => column !== field && !field.includes(column) &&
      containsExactLabel(part, column));
    const canContinue: boolean = previousField && !hasAnotherField && !/^\s*[^ ：:]{1,24}[:：]/u.test(part);
    previousField = (named || canContinue) && !hasAnotherField;
    if (previousField) clauses.push(part.trim());
  }
  return clauses;
}

function rangeMatches(clause: string, candidate: Extract<DictionaryCandidate, { kind: 'range' }>): boolean {
  const cleaned = clause.normalize('NFKC').replace(/\.$/u, '');
  const withoutBracketed = cleaned.replace(/\[[^\]]+\]/gu, '');
  if (/(?:不含|不包括|不计入|开区间|大约|约为|左右|(?<![<>=])[<>](?!=)|(?:大于|小于)(?!等于)|\d\s*[%‰万亿千]|\d[eE][+-]?\d|\d-\d{1,2}-\d)/u.test(cleaned) ||
      /\d,\d{3}\b/u.test(withoutBracketed)) return false;
  const lowers: number[] = [];
  const uppers: number[] = [];
  const push = (raw: string, target: number[]) => {
    const value = parseNumeric(raw);
    if (value !== null) target.push(value);
  };
  const intervals = [...cleaned.matchAll(CLOSED_INTERVAL)];
  for (const match of intervals) {
    if (match[1] === undefined && !/(?:范围|区间|介于|取值|[:：] *[+-]?\d)/u.test(cleaned)) continue;
    push(match[1] ?? match[3]!, lowers);
    push(match[2] ?? match[4]!, uppers);
  }
  for (const match of cleaned.matchAll(BOUND_BEFORE)) push(match[2]!, LOWER_BOUND.test(match[1]!) ? lowers : uppers);
  for (const match of cleaned.matchAll(BOUND_AFTER)) push(match[1]!, match[2]!.includes('以上') ? lowers : uppers);
  const matches = (values: number[], selected: number | undefined) =>
    selected === undefined ? values.length === 0 : values.length > 0 && values.every((value) => value === selected);
  return matches(lowers, candidate.min) && matches(uppers, candidate.max);
}

function extractAllowedValues(clause: string): string[] | null {
  const match = /(?:仅允许|只允许|允许取值|允许值|合法取值|有效取值|可选值|仅限|只能是|只能取|只能为|取值只能|取值为|可取|允许)\s*(?:为|是|[:：=])?\s*(.+)$/u.exec(clause);
  if (!match) return null;
  const list = match[1]!.replace(/[。．.]$/u, '').replace(/(?:等|等等)$/u, '、…');
  const parts = list.replace(/^[\[(（【]\s*|\s*[\])）】]$/gu, '')
    .split(/\s*(?:、|，|,|\/|或)\s*/u)
    .map((value) => value.trim().replace(/^[「『“"']|[」』”"']$/gu, ''));
  return parts;
}

function missingCodeMatches(clause: string, code: string): boolean {
  if (/(?:禁止|保留原值|有效数据|正常取值)/u.test(clause)) return false;
  const token = '[「『“"\']?' + escapeRegExp(code) + '[」』”"\']?';
  const label = '(?:缺失(?:值)?|缺考|未填写|未作答|未答|未测量|未测|不适用|拒答)';
  const definition = label + '(?:占位)?(?:码|编码|标记|标志)?\\s*(?:取值为|记为|编码为|用|为|是|[:：=])\\s*' +
    token + '(?![A-Za-z0-9_.-])(?=\\s|$|[，,。；;（(])';
  const meaning = '(?<![A-Za-z0-9_.+-])' + token + '\\s*(?:表示|代表|指|记为|为|=|[:：])\\s*' +
    label + '(?=\\s*(?:$|[，,。；;（(]))';
  return new RegExp(definition + '|' + meaning, 'u').test(clause.replace(/\.$/u, ''));
}

function evidenceError(text: string, candidate: DictionaryCandidate, columns: readonly string[]): string | null {
  if (!quoteHasSource(text, candidate.quote)) return '没有找到这段完整原文，不能采用该候选。';
  // 先按完整句看限制语；不能借分号只采用规则部分、忽略后续限定。
  const statements = candidate.quote.split(STATEMENT_END)
    .filter((sentence) => !CONDITIONAL.test(sentence))
    .map((sentence) => evidenceClauses(sentence, candidate.field, columns))
    .filter((clauses) => clauses.length > 0);
  if (statements.length === 0) return '原文未能明确对应这条候选的字段。';
  const usable = statements.filter((clauses) => clauses.every((clause) => !NEGATED.test(clause)));
  if (candidate.kind === 'range') {
    if ((candidate.min === undefined && candidate.max === undefined) ||
        (candidate.min !== undefined && candidate.max !== undefined && candidate.min > candidate.max)) {
      return '数值区间不完整或上下界顺序不正确。';
    }
    return usable.some((clauses) => rangeMatches(clauses.join('；'), candidate)) ? null
      : '原文不能支持这组数值界限。当前只支持明确的闭区间或含边界的上下限。';
  }
  if (candidate.kind === 'allowed') {
    return usable.some((clauses) => {
      const lists = clauses.flatMap((clause) => {
        const values = extractAllowedValues(clause);
        return values ? [{ values, adds: /^(?:也|还|另)允许/u.test(clause) }] : [];
      });
      const base = lists.find((list) => !list.adds);
      if (!base || lists.some((list) => !list.adds && !sameStringSet(base.values, list.values))) return false;
      const values = lists.flatMap((list) => list.values);
      return values.length > 0 && !values.includes('…') && !values.includes('') && sameStringSet(values, candidate.values);
    }) ? null
      : '原文不能支持这份完整的允许取值清单。';
  }
  return usable.some((clauses) => clauses.some((clause) => missingCodeMatches(clause, candidate.code))) ? null
    : '原文没有明确将该编码定义为缺失或缺考等占位码。';
}

function sameStringSet(a: readonly string[], b: readonly string[]): boolean {
  const expected = new Set(a);
  return expected.size === new Set(b).size && b.every((value) => expected.has(value));
}

function uniqueColumn(columns: readonly string[], name: string): boolean {
  return columns.filter((column) => column === name).length === 1;
}

export function prepareDictionaryCandidates(
  text: string, columns: readonly string[], candidates: readonly DictionaryCandidate[],
): PreparedDictionaryCandidate[] {
  return candidates.map((candidate, index) => {
    const parsed = dictionaryCandidateSchema.safeParse(candidate);
    const value = parsed.success ? parsed.data : candidate;
    return {
      id: 'dictionary-' + (index + 1),
      candidate: value,
      column: uniqueColumn(columns, value.field) ? value.field : null,
      error: parsed.success ? evidenceError(text, parsed.data, columns) : '候选的字段、原文或取值格式不符合要求。',
    };
  });
}

function compatibleRules(a: RangeRule, b: RangeRule): boolean {
  // 可以合并同列互补的上下界，但不能静默取严格值或合并两份不同码表。
  if (a.allowedValues || b.allowedValues) {
    return !!(a.allowedValues && b.allowedValues && sameStringSet(a.allowedValues, b.allowedValues));
  }
  const min = a.min ?? b.min;
  const max = a.max ?? b.max;
  return (a.min === undefined || b.min === undefined || a.min === b.min) &&
    (a.max === undefined || b.max === undefined || a.max === b.max) &&
    (min === undefined || max === undefined || min <= max);
}

export function dictionaryCodeConflictsWithRule(code: string, rule: RangeRule): boolean {
  if (rule.allowedValues?.length) return rule.allowedValues.some((value) => value.trim() === code);
  const value = parseNumeric(code);
  return (rule.min !== undefined || rule.max !== undefined) && value !== null &&
    (rule.min === undefined || value >= rule.min) && (rule.max === undefined || value <= rule.max);
}

export function resolveDictionarySelection(
  prepared: readonly PreparedDictionaryCandidate[],
  selections: readonly { id: string; column: string }[],
  columns: readonly string[],
): DictionarySelectionResult {
  const fail = (error: string) => ({ ok: false as const, error });
  if (selections.length === 0) return fail('请选择至少一条候选。');
  const rules = new Map<string, { rule: RangeRule; sources: Set<string> }>();
  const codes = new Map<string, DictionaryMissingCode>();
  const selected = new Set<string>();
  for (const { id, column } of selections) {
    const item = prepared.find((candidate) => candidate.id === id);
    if (!item || selected.has(id)) return fail('候选已过期或重复，请重新选择。');
    if (item.error) return fail(item.error);
    if (!uniqueColumn(columns, column)) return fail('请选择唯一的目标列：「' + (column || '未选择') + '」。');
    selected.add(id);
    const candidate = item.candidate;
    if (candidate.kind === 'missing-code') {
      const prior = codes.get(column);
      if (prior && prior.code !== candidate.code) return fail('「' + column + '」选中了不同的缺失码；此版本一次只支持确认一个。');
      if (!prior) codes.set(column, { column, code: candidate.code, quote: candidate.quote });
      continue;
    }
    const idForRule = 'user-range:' + column;
    const rule: RangeRule = candidate.kind === 'range'
      ? { id: idForRule, column, min: candidate.min, max: candidate.max }
      : { id: idForRule, column, allowedValues: [...new Set(candidate.values)] };
    const prior = rules.get(column);
    if (prior) {
      if (!compatibleRules(prior.rule, rule)) return fail('「' + column + '」选中的范围或允许值规则冲突，请只保留适用的候选。');
      prior.rule.min ??= rule.min;
      prior.rule.max ??= rule.max;
      prior.sources.add(candidate.quote);
    } else {
      rules.set(column, { rule, sources: new Set([candidate.quote]) });
    }
  }
  for (const { column, code } of codes.values()) {
    const rule = rules.get(column)?.rule;
    if (rule && dictionaryCodeConflictsWithRule(code, rule)) {
      return fail('「' + column + '」的「' + code + '」同时被选作允许值和缺失码，请核对原文后重新选择。');
    }
  }
  return {
    ok: true,
    rules: [...rules.values()].map(({ rule, sources }) => ({
      ...rule, rationale: '数据字典（已确认）：' + [...sources].join('；'),
    })),
    missingCodes: [...codes.values()],
  };
}
