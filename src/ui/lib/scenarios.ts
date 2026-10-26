import { CHECK_LABEL } from '@/ui/lib/checkLabels';

/**
 * 研究场景：给「这份数据属于哪类研究」一个显式的选择入口。
 *
 * 为什么是纯数据而不是检查引擎的一部分：场景只回答「先看什么」，
 * 不回答「检查什么」——8 项检查对任何数据都全跑。把它写进 core 会让
 * 「场景 = 检查子集」的误读成为实现事实，覆盖地图与「8 项检查」口径都会跟着失真。
 *
 * 为什么不带 subject（学科）：知识库的学科是「通用 / 数据科学 / 教育学…」，
 * 与「问卷 / 实验 / 教育」不是同一个维度。硬做映射等于替团队编造依据，
 * 所以场景只给关注点与推荐检查，检索时仍由用户/模型按学科自行选择。
 */
export const SCENARIO_IDS = ['survey', 'experiment', 'education'] as const;

export type ScenarioId = (typeof SCENARIO_IDS)[number];

export interface Scenario {
  id: ScenarioId;
  title: string;
  summary: string;
  focusPoints: readonly [string, string, string];
  /** 只用于「本次重点」提示与问题列表筛选；不是实际运行集合，runAllChecks 仍跑满 8 项 */
  recommendedCheckIds: readonly string[];
  sample: { url: string; fileName: string };
}

/**
 * 三场景的唯一真源。文案里刻意不承诺「系统自动检查」——
 * 关注点是提醒用户看的目录，不是产品已实现的能力清单。
 */
const SCENARIO_LIST = [
  {
    id: 'survey',
    title: '问卷数据',
    summary: '李克特量表、人口学变量与多选题为主，先把编码与作答口径对齐。',
    focusPoints: [
      '编码：学号/题号的位数与前后缀是否一致',
      '缺失：空白、拒答与「不适用」是否被混为一谈',
      '类别写法：学历/专业等自由填写项的同义写法',
    ],
    recommendedCheckIds: ['missing', 'type-consistency', 'category-synonyms'],
    sample: { url: '/sample/messy-survey.csv', fileName: '示例-科研问卷.csv' },
  },
  {
    id: 'experiment',
    title: '实验数据',
    summary: '重复测量与仪器读数为主，单位与量程最容易在合并时失真。',
    focusPoints: [
      '单位：mg 与 g、mL 与 L 混写',
      '重复测量：同一被试/样本被重复录入',
      '数值异常：超出仪器量程的读数',
    ],
    recommendedCheckIds: ['unit-consistency', 'duplicates', 'outliers'],
    sample: { url: '/sample/experiment-data.csv', fileName: '示例-实验数据.csv' },
  },
  {
    id: 'education',
    title: '教育数据',
    summary: '成绩、班级与人数口径为主，缺考标记与合计列最容易出错。',
    focusPoints: [
      '成绩：分数列里混入「缺考」等文字',
      '人数口径：班级人数与名单行数不一致',
      '字段关联：学号与班级的对应关系',
    ],
    recommendedCheckIds: ['type-consistency', 'missing', 'outliers'],
    sample: { url: '/sample/education-data.csv', fileName: '示例-教育数据.csv' },
  },
] as const satisfies readonly Scenario[];

export const SCENARIOS: readonly Scenario[] = SCENARIO_LIST;

/**
 * 8 项检查的 id 不在本文件重复维护：`CHECK_LABEL` 已经是检查 id 的界面真源。
 * 推荐检查在单测里被断言必须是它的子集 —— 多写一个不存在的 id 会当场红。
 */
export const ALL_CHECK_IDS: readonly string[] = Object.keys(CHECK_LABEL);

/** 只认已注册场景；未知 id 返回 null，界面据此当作「没选场景」，不猜。 */
export function scenarioById(id: string | null): Scenario | null {
  if (id === null) return null;
  return SCENARIOS.find((scenario) => scenario.id === id) ?? null;
}

export function isScenarioId(value: unknown): value is ScenarioId {
  return typeof value === 'string' && (SCENARIO_IDS as readonly string[]).includes(value);
}
