import type { ColumnProfile, QualityIssue } from '@/core';
import type { RuleHit } from '@/knowledge/types';
import { maskSample } from './summary';

/**
 * 出站数据的塑形层 —— 所有会离开浏览器的内容都在这里定形。
 *
 * 这个产品有一条硬承诺：**原始数据一行都不出门**。而离开浏览器的通道不止
 * 一条，目前有两条，都在这附近：
 *
 *   1. 结构摘要与数据块 —— `summary.ts` 的 `buildDataSummary` / `prompt.ts` 的 `buildSummaryBlock`
 *   2. 工具结果 —— 模型调 `run_checks` / `describe_column` 之后，结果经
 *      `addToolOutput` 回填进 UI 消息，下一次请求随 messages 一起上行
 *
 * 第 2 条最容易被忽略：它看起来只是「把检查结果告诉模型」，但 `core` 为了
 * 让界面能展示证据，会在取值里带上原始内容 —— 列画像的 `samples` 是行序前
 * 五个值的原文，`typeConsistency` 会把越界的原值成串写进 `offendingValues`。
 * 这些原样回传就等于把原始数据送了出去。
 *
 * 所以这里的做法是**白名单重建**，而不是挑着删：显式列出允许出门的字段，
 * 新增字段默认出门不了。挑着删的话，core 里哪天多写一个带原值的字段，
 * 就会静悄悄地漏出去。
 */

/** 列画像里可以出门的部分 */
export interface ColumnDetailForModel {
  name: string;
  type: ColumnProfile['type'];
  missingCount: number;
  missingRate: number;
  uniqueCount: number;
  /** 数值列的聚合量，与结构摘要同一口径 */
  numeric?: ColumnProfile['numeric'];
  /**
   * 分类与布尔列的取值分布。
   *
   * 刻意保留原始写法：类别归并必须看得见「硕士 / 研究生 / 硕士研究生」的差异，
   * 抹掉这个功能就不成立（设计文档 §3.3 的摘要示例本就带分布）。
   */
  distribution?: Record<string, number>;
  /** 样例只给形状，不给原文 */
  sampleShapes: string[];
}

export function columnDetailForModel(column: ColumnProfile): ColumnDetailForModel {
  return {
    name: column.name,
    type: column.type,
    missingCount: column.missingCount,
    missingRate: Number(column.missingRate.toFixed(4)),
    uniqueCount: column.uniqueCount,
    numeric: column.numeric,
    distribution: column.valueDistribution,
    sampleShapes: column.samples.map(maskSample),
  };
}

/** 问题清单里可以出门的部分 */
export interface IssueForModel {
  checkId: string;
  severity: QualityIssue['severity'];
  title: string;
  description: string;
  columns: string[];
  /** 涉及多少行，而不是具体行下标：位置对判断没有帮助，却更长 */
  affectedRowCount: number;
  /**
   * 只保留数值型统计量。
   *
   * 字符串统计量一律丢掉 —— `offendingValues` 这类字段就是原始取值的集合，
   * 而它在类型上与其他统计量长得一样，靠键名去分辨迟早会漏。
   */
  statistics: Record<string, number>;
  suggestion?: { action: string; rationale: string };
  confidence: number;
}

export function issueForModel(issue: QualityIssue): IssueForModel {
  const statistics: Record<string, number> = {};
  for (const [key, value] of Object.entries(issue.evidence.statistics)) {
    if (typeof value === 'number' && Number.isFinite(value)) statistics[key] = value;
  }

  return {
    checkId: issue.checkId,
    severity: issue.severity,
    title: issue.title,
    description: issue.description,
    columns: issue.evidence.columns,
    affectedRowCount: issue.evidence.rowIndices?.length ?? 0,
    statistics,
    // suggestion.params 刻意不带：那是给执行器用的机器参数，模型判断问题
    // 用不到它，而不放行就不必担心里面夹带原值。界面要执行时从本地 store 取。
    suggestion: issue.suggestion
      ? { action: issue.suggestion.action, rationale: issue.suggestion.rationale }
      : undefined,
    confidence: issue.confidence,
  };
}

/** 规则命中里可以出门的部分 */
export interface RuleHitForModel {
  id: string;
  标题: string;
  类别: string;
  /** 规则正文：**逐字保留**。它是要注入 Prompt 的领域知识，不是用户数据 */
  规则内容: string;
  触发条件?: string;
  来源?: string;
  权威度?: string;
  /** 为什么召回这一条 —— 模型要能据此说明判断依据 */
  reason: string;
}

/**
 * 规则命中的出站塑形。
 *
 * 这一处与其它出站路径**方向相反却理由相同**：`issueForModel` 是「挑着放行」，
 * 因为里面混着原始取值；而这里是「挑着不放行」—— 规则正文必须逐字保留，
 * 抹掉它这个功能就不成立了。显式白名单仍然值得写：向量（512 个浮点）、
 * 稀疏词频这些内部字段没有理由离开浏览器，而它们加起来比正文大得多。
 */
export function ruleHitForModel(hit: RuleHit): RuleHitForModel {
  return {
    id: hit.rule.id,
    标题: hit.rule.entry.标题,
    类别: hit.rule.entry.类别,
    规则内容: hit.rule.entry.规则内容,
    触发条件: hit.rule.entry.触发条件,
    来源: hit.rule.entry.来源,
    权威度: hit.rule.entry.权威度,
    reason: hit.reason,
  };
}
