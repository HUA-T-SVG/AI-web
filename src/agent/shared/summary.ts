import type { ColumnProfile, Dataset, DatasetProfile } from '@/core';

/** 单条样例的字符上限。低频取值也可能是一整段备注，不截断等于把原文送出去。 */
const MAX_SAMPLE_LENGTH = 40;
/** 每列最多给出的样例数。样例是摘要里唯一受脱敏控制的原始内容，宁少勿多。 */
const MAX_SAMPLES = 5;
/** 取值分布最多保留的高频取值个数。宽表有几百个唯一值时，全发会把摘要撑爆。 */
const MAX_DISTRIBUTION_ENTRIES = 20;

export interface SummaryColumn {
  name: string;
  type: ColumnProfile['type'];
  missingRate: number;
  uniqueCount: number;
  /** 仅数值列 */
  numeric?: { min: number; max: number; mean: number; median: number };
  /**
   * 取值分布，仅分类与布尔列。
   *
   * 注意这里**保留原始写法**，不脱敏 —— 类别归并必须看得见
   * 「硕士 / 研究生 / 硕士研究生」的具体差异，抹掉这个功能就不成立。
   * 脱敏保护的是下面的 samples，不是这里。
   */
  distribution?: Record<string, number>;
  /** 低频样例，默认脱敏成字符形状 */
  samples: string[];
}

export interface DataSummary {
  fileName: string;
  rowCount: number;
  columnCount: number;
  duplicateColumnNames: string[];
  columns: SummaryColumn[];
}

/**
 * 把取值脱敏成「形状」而不是内容。
 *
 * 默认开启的原因：备注、姓名这类自由文本列里最可能藏着可识别的个人信息，
 * 而这类列恰恰是靠 samples 被送出去的。脱敏后仍能看出「这里有一类 4 个
 * 中文字符的低频取值」，足够支撑「疑似写法不统一」的判断，但拿不到原文。
 */
export function maskSample(value: string): string {
  const trimmed = value.trim();
  if (trimmed === '') return '空白';
  if (/^[\u4e00-\u9fa5]+$/.test(trimmed)) return `${trimmed.length} 个中文字符`;
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return '日期型取值';
  return `字符数 ${trimmed.length}`;
}

/**
 * 按出现次数升序取样例。
 *
 * 低频才是「脏写法」的信号：一个只出现 1 次的「本科在读」值得看，
 * 出现 400 次的上千个「本科」没有任何诊断价值，白白扩大外传面。
 */
function pickSamples(column: ColumnProfile, dataset: Dataset, mask: boolean): string[] {
  const index = dataset.columns.findIndex((item) => item.name === column.name);
  if (index < 0) return [];

  const counts = new Map<string, number>();
  for (const raw of dataset.columns[index]?.values ?? []) {
    if (raw === null || raw === undefined) continue;
    const text = String(raw).trim();
    if (text === '') continue;
    counts.set(text, (counts.get(text) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => a[1] - b[1])
    .slice(0, MAX_SAMPLES)
    .map(([text]) => {
      if (mask) return maskSample(text);
      // 截断时留出省略号的位置，让样例长度硬上限成立（40 就是 40，不是 41）
      return text.length > MAX_SAMPLE_LENGTH
        ? `${text.slice(0, MAX_SAMPLE_LENGTH - 1)}…`
        : text;
    });
}

export function buildDataSummary(input: {
  dataset: Dataset;
  profile: DatasetProfile;
  fileName: string;
  /** 默认 true。只有本地调试才建议关掉。 */
  maskSamples?: boolean;
}): DataSummary {
  const mask = input.maskSamples ?? true;

  return {
    fileName: input.fileName,
    rowCount: input.profile.rowCount,
    columnCount: input.profile.columnCount,
    duplicateColumnNames: input.profile.duplicateColumnNames,
    columns: input.profile.columns.map((column) => ({
      name: column.name,
      type: column.type,
      missingRate: Number(column.missingRate.toFixed(4)),
      uniqueCount: column.uniqueCount,
      numeric: column.numeric
        ? {
            min: column.numeric.min,
            max: column.numeric.max,
            mean: Number(column.numeric.mean.toFixed(2)),
            median: column.numeric.median,
          }
        : undefined,
      distribution: column.valueDistribution
        ? Object.fromEntries(
            Object.entries(column.valueDistribution)
              .sort((a, b) => b[1] - a[1])
              .slice(0, MAX_DISTRIBUTION_ENTRIES),
          )
        : undefined,
      // 刻意不用 column.samples：那个字段取的是行序前 5 个值（见 core/types.ts
      // 的注释），既没有诊断价值又可能带出原文。这里自己按频次重新挑。
      samples: pickSamples(column, input.dataset, mask),
    })),
  };
}
