import type {
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
import { meanOf, medianOf, quantile, stdDevOf } from '../stats';

/** 唯一值占比与绝对数量需同时满足，避免小样本下把自由文本判成分类 */
const CATEGORY_UNIQUE_RATIO = 0.5;
const MAX_CATEGORY_UNIQUE = 20;

export function inferColumnType(column: ColumnData): ColumnType {
  const present = column.values.filter((v) => !isMissingValue(v));
  if (present.length === 0) return 'empty';

  const numericCount = present.filter((v) => parseNumeric(v) !== null).length;
  const booleanCount = present.filter((v) => typeof v === 'boolean').length;

  if (booleanCount === present.length) return 'boolean';
  if (numericCount === present.length) return 'number';
  if (numericCount > 0 || booleanCount > 0) return 'mixed';

  const uniqueKeys = new Set(present.map((v) => normalizeKey(v)));
  const ratio = uniqueKeys.size / present.length;
  const looksCategorical =
    uniqueKeys.size <= MAX_CATEGORY_UNIQUE && ratio <= CATEGORY_UNIQUE_RATIO;

  return looksCategorical ? 'category' : 'text';
}

function numericStatsOf(values: readonly number[]): NumericStats {
  return {
    min: values.length ? Math.min(...values) : 0,
    max: values.length ? Math.max(...values) : 0,
    mean: meanOf(values),
    q1: quantile(values, 0.25),
    median: medianOf(values),
    q3: quantile(values, 0.75),
    stdDev: stdDevOf(values),
  };
}

export function profileColumn(column: ColumnData): ColumnProfile {
  const total = column.values.length;
  const present = column.values.filter((v) => !isMissingValue(v));
  const missingCount = total - present.length;
  const type = inferColumnType(column);

  const keys = present.map((v) => normalizeKey(v));

  const profile: ColumnProfile = {
    name: column.name,
    type,
    missingCount,
    missingRate: total === 0 ? 0 : missingCount / total,
    uniqueCount: new Set(keys).size,
    samples: present.slice(0, 5).map((v) => String(v)),
  };

  if (type === 'number') {
    profile.numeric = numericStatsOf(
      present.map((v) => parseNumeric(v)).filter((n): n is number => n !== null),
    );
  } else if (type === 'category' || type === 'boolean') {
    const distribution: Record<string, number> = {};
    for (const key of keys) {
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
