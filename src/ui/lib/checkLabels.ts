/**
 * 检查项标识的中文名。
 *
 * 标识（`type-consistency`）是代码与问题详情里的稳定键，不该出现在给用户看的
 * 标题、图例与徽章上。两处都要用，所以放在一处，避免各写一份后漂移。
 */
export const CHECK_LABEL: Record<string, string> = {
  'duplicate-column-names': '重复列名',
  missing: '缺失值',
  duplicates: '重复记录',
  'type-consistency': '类型不一致',
  outliers: '异常值',
  'range-rules': '取值范围',
  'unit-consistency': '单位一致性',
  'category-synonyms': '类别同义',
};

export function checkLabel(checkId: string): string {
  return CHECK_LABEL[checkId] ?? checkId;
}
