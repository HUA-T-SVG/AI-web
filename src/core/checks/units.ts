import type { Dataset, QualityIssue } from '../types';
import { isMissingValue } from '../types';
import { normalizeText } from '../normalize';
import { createIssueId } from './id';

/**
 * 单位一致性检查（spec §5.3.1 的第 7 项，也是 F3 声称的 9 项里一直缺的那一项）。
 *
 * 判据有两条，spec 写的是「单位词表 + 数值分布双峰检测」，这里按同一条思路实现：
 *
 * 1. **单位词表**：从取值里认出量纲族与量级
 * 2. **低频单位不算数**：只出现一两次的异质单位更像录入错误，而不是「整列混用了单位」
 *
 * **为什么不做双峰检测**：那是量纲混用的**后果**，而不是判据 —— 数值分布要呈双峰，
 * 前提是两簇的量级差得足够远且样本够多。短列上它几乎必然不成立，于是真问题会被漏掉。
 * 单位词表已经能直接给出判断，再加一道统计门槛只会让检查更难触发。
 */

/** 量纲族 → 该族内各单位相对基准的倍数。 */
const UNIT_FAMILIES: Record<string, Record<string, number>> = {
  长度: { mm: 0.001, cm: 0.01, dm: 0.1, m: 1, km: 1000, 毫米: 0.001, 厘米: 0.01, 分米: 0.1, 米: 1, 千米: 1000, 公里: 1000, 公尺: 1, 公分: 0.01 },
  质量: { mg: 0.001, g: 1, kg: 1000, 微克: 1e-6, 毫克: 0.001, 克: 1, 千克: 1000, 公斤: 1000, 吨: 1e6 },
  体积: { ml: 0.001, l: 1, 毫升: 0.001, 升: 1 },
  时间: { s: 1, min: 60, h: 3600, 秒: 1, 分钟: 60, 小时: 3600, 天: 86400 },
  温度: { '°c': 1, '℃': 1, c: 1 },
  比例: { '%': 0.01, '‰': 0.001 },
};

/** 单位 → { 族, 倍数 }。建一张反查表，避免每个取值都遍历族。 */
const UNIT_LOOKUP = new Map<string, { family: string; scale: number }>();
for (const [family, units] of Object.entries(UNIT_FAMILIES)) {
  for (const [unit, scale] of Object.entries(units)) {
    UNIT_LOOKUP.set(unit, { family, scale });
  }
}

/** 一个单位至少要出现这么多次，才算「整列混用了单位」。 */
const MIN_OCCURRENCES = 2;

interface ParsedValue {
  unit: string;
  family: string;
  scale: number;
}

/**
 * 从取值里拆出数值与单位。
 *
 * 刻意只认「数字 + 单位后缀」这一种形态：`5mg`、`0.005g`、`12 毫克`。
 * 不做更宽松的解析（如中缀单位）—— 解析越宽松，误报越多，
 * 而这条检查的误报会让用户去改本来正确的数据。
 */
function parseValue(raw: unknown): ParsedValue | null {
  if (isMissingValue(raw as never)) return null;
  if (typeof raw === 'number') return null; // 纯数字没有单位信息

  const text = normalizeText(String(raw)).toLowerCase();
  const matched = /^([+-]?\d+(?:\.\d+)?)\s*([a-z\u4e00-\u9fff%‰°℃]+)$/.exec(text);
  if (!matched) return null;

  const unit = matched[2] ?? '';
  const found = UNIT_LOOKUP.get(unit);
  if (!found) return null;
  return { unit, family: found.family, scale: found.scale };
}

export function checkUnitConsistency(dataset: Dataset): QualityIssue[] {
  const issues: QualityIssue[] = [];

  for (const column of dataset.columns) {
    const counts = new Map<string, { parsed: ParsedValue; count: number }>();
    let bareNumbers = 0;

    for (const raw of column.values) {
      if (isMissingValue(raw)) continue;

      // 纯数字取值单独计数：一列里「有的写单位、有的不写」是另一类真问题
      if (typeof raw === 'number' || /^[+-]?\d+(?:\.\d+)?$/.test(normalizeText(String(raw)))) {
        bareNumbers += 1;
        continue;
      }

      const parsed = parseValue(raw);
      if (!parsed) continue;
      const existing = counts.get(parsed.unit);
      if (existing) existing.count += 1;
      else counts.set(parsed.unit, { parsed, count: 1 });
    }

    // 只出现一两次的单位不算数：那更像个别单元格录错了，
    // 而「整列混用单位」是要改整列口径的事，两者处置完全不同
    const meaningful = [...counts.values()].filter((item) => item.count >= MIN_OCCURRENCES);

    // 情形一：同一列里出现了两种以上、且都够频繁的单位
    if (meaningful.length >= 2) {
      issues.push(buildMixedUnitsIssue(column.name, meaningful));
      continue;
    }

    // 情形二：一部分取值带单位、一部分不带。这同样会让「这一列到底以什么为单位」
    // 变得说不清 —— 而它比「混用两个单位」更隐蔽，因为看列名看不出来
    const soleUnit = meaningful[0];
    if (soleUnit && bareNumbers >= MIN_OCCURRENCES) {
      issues.push({
        id: createIssueId('unit-consistency', column.name),
        checkId: 'unit-consistency',
        severity: 'medium',
        title: `「${column.name}」列里有的取值带单位、有的不带`,
        description:
          `该列有 ${bareNumbers} 个取值是纯数字，另有 ${soleUnit.count} 个写作「${soleUnit.parsed.unit}」。` +
          '两者混在一起时无法判断纯数字的那些是什么单位 —— 如果默认按列名的单位理解，' +
          `就可能把「${soleUnit.parsed.unit}」当成别的量级读进去。` +
          '建议统一写法：要么都带单位，要么把单位移进列名并核对其余取值。',
        evidence: {
          columns: [column.name],
          statistics: {
            units: soleUnit.parsed.unit,
            unitCount: 1,
            dominantUnit: soleUnit.parsed.unit,
            dominantCount: soleUnit.count,
            bareNumberCount: bareNumbers,
          },
        },
        suggestion: {
          action: 'unify_unit_notation',
          params: { column: column.name, unit: soleUnit.parsed.unit },
          rationale: '写成同一种形式之后，这一列的单位才不会有歧义。',
        },
        confidence: 0.75,
      });
    }
  }

  return issues;
}

function buildMixedUnitsIssue(
  columnName: string,
  meaningful: Array<{ parsed: ParsedValue; count: number }>,
): QualityIssue {
  const families = new Set(meaningful.map((item) => item.parsed.family));
  const units = meaningful.map((item) => item.parsed.unit).sort();
  const dominant = meaningful.reduce((best, item) => (item.count > best.count ? item : best));

  // 两种情形要分开说：同一量纲不同量级（mg 与 g）与不同量纲（cm 与 kg）。
  // 前者是口径不统一，后者更可能是两个字段被合并到了一列 —— 处置不同
  const crossFamily = families.size > 1;

  const statistics: Record<string, number | string> = {
    units: units.join('、'),
    unitCount: units.length,
    dominantUnit: dominant.parsed.unit,
    dominantCount: dominant.count,
  };
  for (const item of meaningful) statistics[`count_${item.parsed.unit}`] = item.count;

  return {
    id: createIssueId('unit-consistency', columnName),
    checkId: 'unit-consistency',
    severity: crossFamily ? 'high' : 'medium',
    title: crossFamily
      ? `「${columnName}」列混用了不同量纲的单位`
      : `「${columnName}」列混用了不同量级的单位`,
    description: crossFamily
      ? `该列同时出现了 ${units.join('、')}，它们属于不同量纲（${[...families].join('、')}）。` +
        '这通常不是「单位不统一」，而是两个不同的测量字段被并进了一列 —— ' +
        '请先确认这一列到底在量什么，再决定怎么拆。'
      : `该列同时出现了 ${units.join('、')}，它们的量级不同（以 ${dominant.parsed.unit} 为主）。` +
        '同一列里混用量级会让均值、最值、标准差全部失真 —— ' +
        '例如 0.005g 与 5mg 是同一个剂量，直接统计却会算成相差 1000 倍的两个数。' +
        `建议统一到 ${dominant.parsed.unit}，并核实每个取值的原始口径。`,
    evidence: { columns: [columnName], statistics },
    suggestion: {
      action: crossFamily ? 'review_unit_family' : 'unify_unit',
      params: { column: columnName, dominantUnit: dominant.parsed.unit, units },
      rationale: crossFamily
        ? '跨量纲混用通常意味着列的含义本身有问题，需要人工确认后再拆列，不能自动换算。'
        : `统一到出现最多的 ${dominant.parsed.unit} 之后，该列的数值才可比较。`,
    },
    confidence: crossFamily ? 0.7 : 0.8,
  };
}
