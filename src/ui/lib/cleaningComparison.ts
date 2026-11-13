import {
  isMissingValue, isZeroPaddedNumber, parseNumeric, previewCleaningResult,
  type CellValue, type CleaningAction, type CleaningComparison, type CleaningComparisonDecision,
  type ComparisonMetrics, type Dataset,
} from '@/core';

export const COMPARISON_LABELS = {
  'as-missing': '转为缺失',
  keep: '保留并标记复核',
} as const;

function metricsOf(values: CellValue[]): ComparisonMetrics {
  let validNumeric = 0;
  let missing = 0;
  let mean = 0;
  for (const value of values) {
    if (isMissingValue(value)) {
      missing++;
      continue;
    }
    const number = isZeroPaddedNumber(value) ? null : parseNumeric(value);
    if (number === null) continue;
    validNumeric++;
    mean = mean * ((validNumeric - 1) / validNumeric) + number / validNumeric;
  }
  return { validNumeric, missing, missingRate: values.length === 0 ? 0 : missing / values.length,
    mean: validNumeric > 0 && Number.isFinite(mean) ? mean : null };
}

function actionFor(column: string, code: string, choice: CleaningComparisonDecision['choice'], rationale: string): CleaningAction {
  return {
    action: choice === 'as-missing' ? 'set_code_missing' : 'review_keep_missing_code',
    columns: [column],
    params: { column, code },
    rationale,
  };
}

export function compareMissingCode(dataset: Dataset, column: string, code: string): CleaningComparison | null {
  const index = dataset.columns.findIndex((entry) => entry.name === column);
  if (index < 0 || !code.trim() || code.length > 80) return null;
  const preview = previewCleaningResult(dataset, [actionFor(column, code, 'as-missing', '清洗口径试算')]);
  if (preview.skippedActions > 0) return null;
  return {
    column, code, matchingRows: preview.changedCells,
    asMissing: metricsOf(preview.dataset.columns[index]!.values),
    keep: metricsOf(dataset.columns[index]!.values),
  };
}

export function actionForComparison(decision: CleaningComparisonDecision): CleaningAction {
  const { column, code, choice, reason } = decision;
  return { ...actionFor(column, code, choice, reason), comparison: decision };
}

export function formatComparisonRate(rate: number) {
  return rate.toLocaleString('zh-CN', { style: 'percent', maximumFractionDigits: 2 });
}

export function formatComparisonMean(mean: number | null) {
  return mean === null ? '不可计算' : mean.toLocaleString('zh-CN', { maximumSignificantDigits: 7 });
}
