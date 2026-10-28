import {
  DEFAULT_MISSING_HIGH_THRESHOLD,
  DEFAULT_MISSING_LOW_THRESHOLD,
  MIN_OUTLIER_OBSERVATIONS,
  listChecks,
  type RangeRule,
} from '@/core';
import type { ReadableReport, ReportCoverageRow } from './report';

/**
 * 「数据处理方法草稿」——纯确定性模板拼装，**不接任何模型**。
 *
 * 为什么不让大模型写这段：方法学描述是论文里最容易出事的部分，模型会顺手写出
 * 「多重插补」「随机抽样」「剔除 3σ 以外样本」这类本次根本没发生的方法 —— 在科研
 * 场景里那是学术不端级风险。模板只能复述留痕里确实存在的动作，因此同输入必同输出，
 * 读者可以逐句对照留痕与覆盖地图核对。
 *
 * 数据来源只有一个：`ReadableReport`（预览 / Word / Markdown 已经在用的同一份）。
 * 草稿不重算行数、不另建一套计数；「本次未进行」的判断也只读覆盖地图的缺口，
 * 阈值由 core 统一导出。
 */

export const METHOD_DRAFT_TITLE = '数据处理方法（草稿）';
export const METHOD_DRAFT_APPENDIX_HEADING = '附：数据处理方法草稿';
export const METHOD_DRAFT_CAVEAT_HEADING = '需要作者核对的要点';
export const METHOD_DRAFT_DISCLAIMER =
  '本文是根据本次处理记录自动生成的草稿，仅供参考；其中的方法描述、数字与表述须由作者对照原始数据与目标期刊' +
  '（或学校）的要求逐条核对、改写，不能直接作为正式论文或报告提交。';

/** 草稿不得替作者写成既成事实；单测用它守「本研究采用…」这类背书 */
export const METHOD_DRAFT_CLAIM_FORBIDDEN = /本研究(采用|使用)/;

export interface MethodDraftSection {
  heading: string;
  paragraphs: string[];
}

export interface MethodDraft {
  title: string;
  sections: MethodDraftSection[];
  caveats: string[];
  disclaimer: string;
}

export type MethodDraftLineKind = 'title' | 'heading' | 'body' | 'caveat' | 'disclaimer';

export interface MethodDraftLine {
  kind: MethodDraftLineKind;
  text: string;
}

/** 生成草稿时报告还没有 `methodDraft` 字段，用它打破 report ↔ methodDraft 的类型递归 */
export type MethodDraftReport = Omit<ReadableReport, 'methodDraft'>;

export interface MethodDraftKnowledgeBase {
  total: number;
  verified: number;
}

export interface MethodDraftInput {
  report: MethodDraftReport;
  rangeRules: readonly RangeRule[];
  knowledgeBase: MethodDraftKnowledgeBase | null;
}

const CHECKS = listChecks();

const CHECK_METHOD =
  `系统内置 ${CHECKS.length} 项确定性检查（${CHECKS.map((check) => check.title).join('、')}）。` +
  `缺失值检查按缺失率报告：≥${DEFAULT_MISSING_LOW_THRESHOLD * 100}% 记为问题、≥${DEFAULT_MISSING_HIGH_THRESHOLD * 100}% 记为严重；` +
  `异常值检查采用 IQR（Tukey 1.5 倍四分位距），有效观测少于 ${MIN_OUTLIER_OBSERVATIONS} 个时不判定。`;

/** 把某类缺口从覆盖地图里取成「「列名」（原因）」的列表；不拼「通过/合格」 */
const gapList = (rows: readonly ReportCoverageRow[], capability: string) =>
  rows.flatMap((row) =>
    row.gaps
      .filter((gap) => gap.capability === capability)
      .map((gap) => `「${row.column}」（${gap.reason}）`),
  );

function sampleSection(report: MethodDraftReport): MethodDraftSection {
  const summary = report.summary;
  const paragraphs = [
    `本次分析使用文件《${report.sourceFileName}》导入的数据：原始 ${summary.beforeRowCount} 行 × ${summary.beforeColumnCount} 列。`,
  ];
  paragraphs.push(
    summary.isEmpty
      ? `本次未执行任何清洗动作，数据保持导入时的原样（${summary.afterRowCount} 行 × ${summary.afterColumnCount} 列）；下面的描述不含清洗与字段改造。`
      : `经 ${summary.actionCount} 步处理（数据版本 v${report.dataVersion}）后为 ${summary.afterRowCount} 行 × ${summary.afterColumnCount} 列；` +
          `其中删除记录 ${summary.deletedRows} 行，改写单元格 ${summary.changedCells} 个。删除行不计入改写单元格，两者不重复累加。`,
  );
  return { heading: '一、样本与字段', paragraphs };
}

function checksSection(report: MethodDraftReport): MethodDraftSection {
  const paragraphs: string[] = [CHECK_METHOD];
  const counts = report.checks.state === 'done' ? report.checks.counts : null;
  paragraphs.push(
    counts !== null
      ? `本次检查已完成：检出问题 ${counts.issueCount} 条（严重 ${counts.high}、中等 ${counts.medium}、轻微 ${counts.low}），涉及 ${counts.fieldCount} 个字段。`
      : `本次没有可用的检查结论：${report.checks.summary}本节只说明方法，不引用检查结果，也不据此判断缺失或异常情况。`,
  );

  const coverage = report.coverage;
  if (coverage === null) {
    paragraphs.push(
      '本报告没有字段画像与覆盖数据，无法逐字段说明哪些检查本次未进行；「没有发现问题」不能读成「数据没有问题」。',
    );
  } else if (!coverage.trustworthy) {
    paragraphs.push(`检查覆盖情况未知：${coverage.summary}因此不逐字段声称已检查或未检查。`);
  } else {
    const missingGaps = gapList(coverage.fields, '缺失值');
    const outlierGaps = gapList(coverage.fields, '异常值');
    if (missingGaps.length > 0) {
      paragraphs.push(`缺失值：下列字段本次未得出可报告的缺失结论——${missingGaps.join('；')}。`);
    }
    if (outlierGaps.length > 0) {
      paragraphs.push(`异常值：下列字段本次未做异常值判定——${outlierGaps.join('；')}。`);
    }
    if (missingGaps.length === 0 && outlierGaps.length === 0) {
      paragraphs.push(
        '按覆盖记录，缺失值与异常值检查本次已在适用的字段上执行；未检出问题不代表数据没有缺陷。',
      );
    }
  }

  return { heading: '二、缺失与异常', paragraphs };
}

function mergeSection(report: MethodDraftReport): MethodDraftSection {
  const mergeSteps = report.steps.filter((step) => step.mergeResolution !== undefined);
  const paragraphs: string[] = [];

  if (mergeSteps.length === 0) {
    paragraphs.push(
      report.summary.isEmpty
        ? '本次未执行清洗动作，因此没有类别归并。'
        : '本次未执行类别归并动作。类别同义写法只作为待确认建议提交人工判断，系统不会自动归并。',
    );
  } else {
    for (const step of mergeSteps) {
      const resolution = step.mergeResolution;
      if (resolution === undefined) continue;
      const mappingText =
        resolution.groups
          .flatMap((group) =>
            Object.entries(group.mapping).map(
              ([from, to]) => `「${from}」统一为「${to}」`,
            ),
          )
          .join('、') || '（没有记录具体映射）';
      paragraphs.push(
        `本次对「${resolution.column}」列执行了类别归并：${mappingText}。` +
          '归并方向由执行时各取值的出现次数决定（出现次数最多者胜，并列时取组内原有顺序的第一个），' +
          '处理留痕与导出脚本按同一份记录重放。',
      );
    }
  }

  paragraphs.push('语义相似度只用于提出待确认候选，不自动改变数据。');
  return { heading: '三、类别归并口径', paragraphs };
}

function reviewSection(report: MethodDraftReport): MethodDraftSection {
  const decisions = report.decisions;
  if (decisions.length === 0) {
    return { heading: '四、人工复核', paragraphs: ['本次分析没有留下人工复核记录。'] };
  }

  const countOf = (decision: 'accepted' | 'modified' | 'rejected' | 'pending') =>
    decisions.filter((item) => item.decision === decision).length;

  const paragraphs = [
    `本次共复核 AI 建议 ${decisions.length} 条：接受 ${countOf('accepted')} 条、` +
      `修改参数后接受 ${countOf('modified')} 条、拒绝并保留原值 ${countOf('rejected')} 条、` +
      `待确认 ${countOf('pending')} 条。`,
  ];

  const noted = decisions.filter((item) => item.hasNote);
  if (noted.length > 0) {
    paragraphs.push(
      `复核中记录的理由：${noted
        .map((item) => `「${item.title}」${item.decisionText}，理由：${item.note}。`)
        .join('')}`,
    );
  } else {
    paragraphs.push('本次复核没有填写理由：这些决定没有留下可引用的判断依据。');
  }

  return { heading: '四、人工复核', paragraphs };
}

function skippedSection(report: MethodDraftReport): MethodDraftSection {
  const skipped = report.risks.skipped;
  if (skipped.length === 0) {
    return { heading: '五、未执行的动作与原因', paragraphs: ['本次没有未执行的动作。'] };
  }
  const list = skipped
    .map((item) => `${item.actionText}（原因：${item.reason}）`)
    .join('；');
  return {
    heading: '五、未执行的动作与原因',
    paragraphs: [
      `本次有 ${skipped.length} 条动作未执行：${list}。这些动作没有改动数据，方法段不能写成已执行。`,
    ],
  };
}

function rangeRuleText(rule: RangeRule): string {
  const range = [
    rule.min !== undefined ? `下界 ${rule.min}` : null,
    rule.max !== undefined ? `上界 ${rule.max}` : null,
  ]
    .filter((item): item is string => item !== null)
    .join('、');
  const allowed =
    rule.allowedValues !== undefined && rule.allowedValues.length > 0
      ? `允许取值 ${rule.allowedValues.join('、')}`
      : '';
  const detail = [range, allowed].filter(Boolean).join('；') || '未给出具体范围';
  return `「${rule.column}」${detail}（规则标识 ${rule.id}）`;
}

function basisSection(
  report: MethodDraftReport,
  rangeRules: readonly RangeRule[],
  knowledgeBase: MethodDraftKnowledgeBase | null,
): MethodDraftSection {
  const paragraphs: string[] = [
    '数据处理与检查全部在浏览器本地完成，原始数据没有上传；系统不做统计建模、推断统计或研究设计。',
    `检查能力为固定实现：${CHECKS.map((check) => check.title).join('、')}；这些是确定性规则，不做统计推断。`,
  ];

  if (rangeRules.length === 0) {
    paragraphs.push(
      '本次没有配置领域值域规则：「取值范围」检查在未配置的字段上没有给出结论，不能作为领域口径的依据。',
    );
  } else {
    paragraphs.push(
      `本次由用户配置了 ${rangeRules.length} 条领域值域规则：${rangeRules.map(rangeRuleText).join('；')}。` +
        '这是本报告中唯一可逐条追溯到具体规则的依据。',
    );
  }

  if (knowledgeBase === null) {
    paragraphs.push(
      '规则库索引本次没有加载出来，无法说明参考了多少条规则，也不能声称引用了具体规则。',
    );
  } else {
    paragraphs.push(
      `分析阶段参考了领域规则库（共 ${knowledgeBase.total} 条，其中团队已核对 ${knowledgeBase.verified} 条、` +
        `待核对 ${knowledgeBase.total - knowledgeBase.verified} 条）；检索命中不写入处理留痕，` +
        '因此本报告不列出具体规则编号，也不能声称每条建议都来自某条知识库规则。',
    );
  }

  if (report.coverage === null) {
    paragraphs.push('本报告没有覆盖数据，无法说明检查覆盖范围与当前版本的能力边界。');
  } else {
    const boundaries = report.coverage.fields
      .flatMap((row) =>
        row.gaps
          .filter((gap) => gap.kind === 'not-applicable')
          .map((gap) => `${row.column}：${gap.capability}（${gap.reason}）`),
      )
      .join('；');
    paragraphs.push(
      `当前版本的能力边界：${boundaries.length > 0 ? boundaries : '报告没有记录具体的能力边界项'}。` +
        '这些边界之外的情形本次没有检查。',
    );
  }

  return { heading: '六、依据与边界', paragraphs };
}

function buildCaveats(report: MethodDraftReport): string[] {
  const caveats: string[] = [];

  if (report.summary.isEmpty) {
    caveats.push('本次未执行任何清洗动作：方法段只描述导入与检查，不包含清洗步骤。');
  }
  if (report.checks.state !== 'done') {
    caveats.push(`检查结论不可用：${report.checks.summary}`);
  }
  if (report.coverage === null) {
    caveats.push('没有拿到字段画像与覆盖数据：无法逐字段说明哪些检查本次未进行。');
  } else if (!report.coverage.trustworthy) {
    caveats.push(`检查覆盖情况未知：${report.coverage.summary}`);
  }

  const pending = report.decisions.filter((item) => item.decision === 'pending').length;
  if (pending > 0) {
    caveats.push(`仍有 ${pending} 条 AI 建议待确认：未确认的建议没有被执行，方法段不能写成已处理。`);
  }
  const rejected = report.decisions.filter((item) => item.decision === 'rejected').length;
  if (rejected > 0) {
    caveats.push(`有 ${rejected} 条建议被拒绝并保留原值：拒绝不等于问题消失，需在方法或局限中说明。`);
  }
  if (report.risks.skipped.length > 0) {
    caveats.push(`有 ${report.risks.skipped.length} 条动作未执行：数据没有被这些动作改动。`);
  }
  for (const notice of report.staleNotices) {
    caveats.push(`结论版本提示：${notice}`);
  }

  return [...new Set(caveats)];
}

export function buildMethodDraft(input: MethodDraftInput): MethodDraft {
  const { report } = input;
  const caveats = buildCaveats(report);
  if (input.knowledgeBase === null) {
    // 依据段已经写过一次，但「需要作者核对的要点」里也要有：作者扫描 caveats 时
    // 不该漏掉「这份报告没有引用具体规则」这个限制
    caveats.push('规则库索引本次没有加载出来：无法说明参考了多少条规则，也不能声称引用了具体规则。');
  }
  return {
    title: METHOD_DRAFT_TITLE,
    sections: [
      sampleSection(report),
      checksSection(report),
      mergeSection(report),
      reviewSection(report),
      skippedSection(report),
      basisSection(report, input.rangeRules, input.knowledgeBase),
    ],
    caveats: [...new Set(caveats)],
    disclaimer: METHOD_DRAFT_DISCLAIMER,
  };
}

export function methodDraftLines(draft: MethodDraft): MethodDraftLine[] {
  const lines: MethodDraftLine[] = [{ kind: 'title', text: draft.title }];
  for (const section of draft.sections) {
    lines.push({ kind: 'heading', text: section.heading });
    for (const paragraph of section.paragraphs) lines.push({ kind: 'body', text: paragraph });
  }
  if (draft.caveats.length > 0) {
    lines.push({ kind: 'heading', text: METHOD_DRAFT_CAVEAT_HEADING });
    for (const caveat of draft.caveats) lines.push({ kind: 'caveat', text: caveat });
  }
  lines.push({ kind: 'disclaimer', text: draft.disclaimer });
  return lines;
}

export function formatMethodDraftMarkdown(draft: MethodDraft): string {
  const body: string[] = [`# ${draft.title}`];
  for (const section of draft.sections) {
    body.push(`## ${section.heading}`, ...section.paragraphs);
  }
  if (draft.caveats.length > 0) {
    body.push(`## ${METHOD_DRAFT_CAVEAT_HEADING}`, ...draft.caveats.map((caveat) => `- ${caveat}`));
  }
  body.push('---', `> ${draft.disclaimer}`);
  return `${body.join('\n\n')}\n`;
}
