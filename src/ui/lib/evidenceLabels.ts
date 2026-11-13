/** 质量检查详情和 AI 审阅共用字段名。 */
const LABELS: Record<string, string> = {
  violationCount: '越界取值数',
  columnNumber: '列序号',
  values: '越界取值',
  ruleId: '规则标识',
  missingCount: '缺失数',
  missingRate: '缺失率',
  totalRows: '总行数',
  duplicateRows: '重复行数',
  outlierCount: '异常值数',
  method: '判定方法',
  min: '最小值',
  max: '最大值',
  observedCount: '参与统计取值数',
  offendingCount: '异常取值数',
  offendingValues: '异常取值',
  numericCount: '数值取值数',
  nonNumericCount: '非数值取值数',
  units: '单位',
  unitCount: '单位种类数',
  dominantUnit: '主要单位',
  dominantCount: '主要单位出现数',
  bareNumberCount: '无单位取值数',
  columnIndices: '重复列序号',
  occurrenceCount: '出现次数',
};

export function evidenceLabel(key: string) {
  return LABELS[key] ?? key;
}
