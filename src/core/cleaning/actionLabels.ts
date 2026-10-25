/**
 * 清洗动作的中文名。
 *
 * 为什么放在 core 而不是界面里：这些名字会出现在三个地方 —— 执行器拒绝动作时的
 * 理由、导出页/报告里的「未执行」列表、审阅面板的建议标签。三处各写一份映射，
 * 迟早出现同一动作在报告里叫「统一单位」、在面板里叫「unify_units」的裂缝。
 *
 * 名字只负责「让人看懂」，不改变动作语义：真正执行什么由 `apply.ts` 的动作台账决定。
 */
export const ACTION_LABELS: Record<string, string> = {
  // 已登记、会自动改数据的动作
  merge_categories: '归并同类类别',
  trim_whitespace: '去除首尾空格',
  fill_missing: '填充缺失值',
  remove_duplicates: '删除重复行',

  // 需要人工拍板、不改数据的动作（含 AI 常用的别名写法）
  fill_or_drop: '人工决定缺失值填充或删除（不改数据）',
  unify_unit: '人工统一单位（不改数据）',
  unify_units: '人工统一单位（不改数据）',
  unify_unit_notation: '人工统一单位写法（不改数据）',
  normalize_type: '人工统一取值类型（不改数据）',
  flag_missing_not_impute: '人工标记缺失、不插补（不改数据）',
  merge_categories_after_review: '人工复核后归并类别（不改数据）',
  rename_columns: '人工重命名列（不改数据）',
  review_duplicates: '人工复核重复行（不改数据）',
  review_range_violations: '人工核对越界取值（不改数据）',
  review_outliers: '人工核对异常值（不改数据）',
  review_unit_family: '人工复核单位族（不改数据）',
  review_unit_mix: '人工复核单位混用（不改数据）',
};

/**
 * 取动作的中文名。
 *
 * 未知动作回退成原始标识（没有中文名可用），但调用方应当在句子里加「标识」二字，
 * 让读者明确这是系统没登记的动作，而不是一个中文词条缺失。
 */
export function actionDisplayName(action: string): string {
  const known = ACTION_LABELS[action];
  if (known !== undefined) return known;
  return action;
}
