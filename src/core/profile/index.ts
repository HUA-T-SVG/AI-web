import type {
  CellValue,
  ColumnData,
  ColumnProfile,
  ColumnType,
  Dataset,
  DatasetProfile,
  NumericStats,
} from '../types';
import { isMissingValue } from '../types';
import { normalizeKey } from '../normalize';
import { parseNumeric } from '../numeric';
import { quantileFromSorted } from '../stats';

/** 唯一值占比与绝对数量需同时满足，避免小样本下把自由文本判成分类 */
const CATEGORY_UNIQUE_RATIO = 0.5;
const MAX_CATEGORY_UNIQUE = 20;

/**
 * 只做形态判断，不触碰文本归一化。
 *
 * 异常值检查只关心 number 列、类型一致性检查只关心 mixed 列，
 * 它们若调用 inferColumnType，会为判定 category/text 而把整列文本
 * 归一化一遍 —— 那部分结果对它们毫无用处。这个函数让它们提前退出。
 */
export function detectShape(
  column: ColumnData,
): 'empty' | 'boolean' | 'number' | 'mixed' | 'other' {
  const present = column.values.filter((v) => !isMissingValue(v));
  if (present.length === 0) return 'empty';

  const numericCount = present.filter((v) => parseNumeric(v) !== null).length;
  const booleanCount = present.filter((v) => typeof v === 'boolean').length;

  if (booleanCount === present.length) return 'boolean';
  if (numericCount === present.length) return 'number';
  if (numericCount > 0 || booleanCount > 0) return 'mixed';
  return 'other';
}

interface Classification {
  type: ColumnType;
  /** 每个非缺失取值的归一化键；数值列与空列不产出 */
  keys: string[];
  uniqueCount: number;
}

function classify(column: ColumnData): Classification {
  const present = column.values.filter((v) => !isMissingValue(v));
  const shape = detectShape(column);

  if (shape === 'empty') return { type: 'empty', keys: [], uniqueCount: 0 };
  if (shape === 'boolean') {
    return { type: 'boolean', keys: [], uniqueCount: countUniqueKeys(present) };
  }
  if (shape === 'number') {
    return { type: 'number', keys: [], uniqueCount: countUniqueNumbers(present) };
  }
  if (shape === 'mixed') return { type: 'mixed', keys: [], uniqueCount: countUniqueKeys(present) };

  // 只有走到这里才需要文本归一化，且只做一次
  const keys = present.map((value) => normalizeKey(value));
  const uniqueCount = new Set(keys).size;
  const ratio = uniqueCount / present.length;
  const looksCategorical = uniqueCount <= MAX_CATEGORY_UNIQUE && ratio <= CATEGORY_UNIQUE_RATIO;

  return { type: looksCategorical ? 'category' : 'text', keys, uniqueCount };
}

function countUniqueKeys(present: readonly CellValue[]): number {
  const seen = new Set<string>();
  for (const value of present) seen.add(normalizeKey(value));
  return seen.size;
}

function countUniqueNumbers(present: readonly CellValue[]): number {
  const seen = new Set<number>();
  for (const value of present) {
    const parsed = parseNumeric(value);
    if (parsed !== null) seen.add(parsed);
  }
  return seen.size;
}

export function inferColumnType(column: ColumnData): ColumnType {
  return classify(column).type;
}

function numericStatsOf(values: readonly number[]): NumericStats {
  if (values.length === 0) {
    return { min: 0, max: 0, mean: 0, q1: 0, median: 0, q3: 0, stdDev: 0 };
  }

  // 一次排序供三个分位点复用；均值与标准差也各自只扫一遍
  const sorted = [...values].sort((a, b) => a - b);

  let sum = 0;
  for (const value of values) sum += value;
  const mean = sum / values.length;

  let squared = 0;
  for (const value of values) {
    const delta = value - mean;
    squared += delta * delta;
  }

  return {
    min: sorted[0] ?? 0,
    max: sorted[sorted.length - 1] ?? 0,
    mean,
    q1: quantileFromSorted(sorted, 0.25),
    median: quantileFromSorted(sorted, 0.5),
    q3: quantileFromSorted(sorted, 0.75),
    stdDev: Math.sqrt(squared / values.length),
  };
}

export function profileColumn(column: ColumnData): ColumnProfile {
  const total = column.values.length;
  const present = column.values.filter((v) => !isMissingValue(v));
  const missingCount = total - present.length;
  const classification = classify(column);

  const profile: ColumnProfile = {
    name: column.name,
    type: classification.type,
    missingCount,
    missingRate: total === 0 ? 0 : missingCount / total,
    uniqueCount: classification.uniqueCount,
    samples: present.slice(0, 5).map((v) => String(v)),
  };

  if (classification.type === 'number') {
    const numbers = present
      .map((value) => parseNumeric(value))
      .filter((value): value is number => value !== null);
    profile.numeric = numericStatsOf(numbers);
    return profile;
  }

  if (classification.type === 'boolean') {
    const distribution: Record<string, number> = {};
    for (const value of present) {
      const key = normalizeKey(value);
      distribution[key] = (distribution[key] ?? 0) + 1;
    }
    profile.valueDistribution = distribution;
    return profile;
  }

  if (classification.type === 'category') {
    const distribution: Record<string, number> = {};
    for (const key of classification.keys) {
      distribution[key] = (distribution[key] ?? 0) + 1;
    }
    profile.valueDistribution = distribution;
  }

  return profile;
}

export function profileDataset(dataset: Dataset): DatasetProfile {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const column of dataset.columns) {
    if (seen.has(column.name)) duplicates.add(column.name);
    seen.add(column.name);
  }

  return {
    rowCount: dataset.rowCount,
    columnCount: dataset.columns.length,
    columns: dataset.columns.map(profileColumn),
    duplicateColumnNames: [...duplicates],
  };
}
