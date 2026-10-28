import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Provenance, ProvenanceStep } from '@/scriptgen';
import { buildCoverageMap } from './coverageMap';
import { buildReadableReport, type ReadableReportInput } from './report';
import {
  METHOD_DRAFT_CLAIM_FORBIDDEN,
  METHOD_DRAFT_DISCLAIMER,
  METHOD_DRAFT_TITLE,
  buildMethodDraft,
  formatMethodDraftMarkdown,
  methodDraftLines,
  type MethodDraft,
  type MethodDraftInput,
} from './methodDraft';

/**
 * 方法草稿守三条线：**确定性**（同一输入同输出，不接模型）、**不替作者背书**
 * （草稿措辞与免责声明）、**不编造没发生的事**（未清洗 / 小样本 / 未配置规则 /
 * 旧版本检查都只能写「本次未进行」）。
 */
const mergeStep = (overrides: Partial<ProvenanceStep> = {}): ProvenanceStep => ({
  index: 0,
  actionType: 'merge_categories',
  targetColumns: ['学历'],
  appliedAt: '2026-10-26T01:00:00.000Z',
  params: { column: '学历', groups: [['硕士', '研究生']] },
  changedCells: 1,
  beforeRowCount: 7,
  afterRowCount: 7,
  mergeResolution: { column: '学历', groups: [{ winner: '硕士', mapping: { 研究生: '硕士' } }] },
  ...overrides,
});

const deleteStep: ProvenanceStep = {
  index: 1,
  actionType: 'remove_duplicates',
  targetColumns: [],
  params: {},
  appliedAt: '2026-10-26T01:30:00.000Z',
  changedCells: 1,
  beforeRowCount: 7,
  afterRowCount: 6,
};

const provenanceOf = (steps: ProvenanceStep[] = [mergeStep(), deleteStep]): Provenance => ({
  datasetFingerprint: '1a2b3c4d',
  resultFingerprint: '5e6f7a8b',
  sessionStartedAt: '2026-10-26T00:00:00.000Z',
  completedAt: '2026-10-26T00:30:00.000Z',
  steps,
  decisions: [],
  generatedScript: '',
  environment: {
    appVersion: '0.1.0',
    ruleLibraryVersion: '178 条',
    embeddingModel: 'bge(q8)',
    dataVersion: 3,
  },
});

const coverage = (rowCount = 3) =>
  buildCoverageMap({
    profile: {
      rowCount,
      columnCount: 2,
      duplicateColumnNames: [],
      columns: [
        { name: '年龄', type: 'number', missingCount: 0, missingRate: 0, uniqueCount: 3, samples: [] },
        { name: '备注', type: 'text', missingCount: 1, missingRate: 0.1, uniqueCount: 2, samples: [] },
      ],
    },
    issues: [],
    checksStatus: 'done',
    checksVersion: 3,
    dataVersion: 3,
    synonymStatus: 'ready',
    rangeRules: [],
  });

const reportOf = (overrides: Partial<ReadableReportInput> = {}) =>
  buildReadableReport({
    sourceFileName: 'messy-survey.csv',
    dataVersion: 3,
    generatedAt: '2026-10-26T02:00:00.000Z',
    provenance: provenanceOf(),
    originalRowCount: 7,
    currentRowCount: 6,
    originalColumnCount: 6,
    currentColumnCount: 6,
    fieldChanges: [],
    rowDelta: -1,
    skipped: [],
    reviewItems: [],
    runVersion: 3,
    executedVersion: 3,
    checksVersion: 3,
    checksStatus: 'done',
    checkIssues: [{ severity: 'high', columns: ['年龄'], checkId: 'outliers' }],
    coverageMap: coverage(),
    ...overrides,
  });

const draftOf = (
  overrides: Partial<ReadableReportInput> = {},
  rules: MethodDraftInput['rangeRules'] = [],
  knowledgeBase: MethodDraftInput['knowledgeBase'] = { total: 178, verified: 104 },
): MethodDraft => buildMethodDraft({ report: reportOf(overrides), rangeRules: rules, knowledgeBase });

const text = (draft: MethodDraft) =>
  draft.sections.flatMap((section) => section.paragraphs).join('\n');

describe('方法草稿：确定性、不接模型、不替作者背书', () => {
  it('同一输入两次输出深相等；标题固定；六段顺序固定', () => {
    expect(draftOf()).toEqual(draftOf());
    expect(draftOf().title).toBe(METHOD_DRAFT_TITLE);
    expect(draftOf().sections.map((section) => section.heading)).toEqual([
      '一、样本与字段',
      '二、缺失与异常',
      '三、类别归并口径',
      '四、人工复核',
      '五、未执行的动作与原因',
      '六、依据与边界',
    ]);
  });

  it('正文不写「本研究采用…」式既成事实', () => {
    expect(text(draftOf())).not.toMatch(METHOD_DRAFT_CLAIM_FORBIDDEN);
  });

  it('源码里没有模型调用：不 import agent、不 fetch、不调 stream/generate', () => {
    const source = readFileSync(new URL('./methodDraft.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/from\s+['"]@\/agent/);
    expect(source).not.toMatch(/\bfetch\(/);
    expect(source).not.toMatch(/streamText|generateText/);
  });
});

describe('不编造没发生的事', () => {
  it('未执行清洗时明说「本次未执行任何清洗动作」，不写「经 N 步处理」', () => {
    const body = text(draftOf({ provenance: provenanceOf([]), currentRowCount: 7, rowDelta: 0 }));
    expect(body).toContain('本次未执行任何清洗动作');
    expect(body).not.toContain('步处理');
    expect(body).toContain('没有类别归并');
  });

  it('清洗后的数字全部来自 summary，不另算：删除行与改写单元格不重复累加', () => {
    const body = text(draftOf());
    expect(body).toContain('原始 7 行 × 6 列');
    expect(body).toContain('删除记录 1 行');
    expect(body).toContain('改写单元格 1 个');
    // 只改 changedCells，草稿文字应跟着变（证明它读的是 summary 的成品数）
    const changed = text(draftOf({ provenance: provenanceOf([mergeStep({ changedCells: 99 }), deleteStep]) }));
    expect(changed).toContain('改写单元格 99 个');
  });

  it('检查未完成 / 属于旧版本 / 没有覆盖数据三种情况都不给结论', () => {
    expect(text(draftOf({ checksStatus: 'running' }))).toContain('本次没有可用的检查结论');
    expect(draftOf({ checksVersion: 1 }).caveats.join('')).toContain('旧数据版本');
    expect(draftOf({ coverageMap: null }).caveats.join('')).toContain('没有拿到字段画像与覆盖数据');
  });

  it('小样本与低缺失率按覆盖缺口写「本次未进行」，不写「采用 IQR 判定」', () => {
    const body = text(draftOf());
    expect(body).toContain('异常值：下列字段本次未做异常值判定');
    expect(body).toContain('有效观测 3 个');
    expect(body).toContain('缺失值：下列字段本次未得出可报告的缺失结论');
    expect(body).toContain('10.00%');
    // 文本列本来就不做异常值检查：写「不适用」，不能写「未做判定」
    expect(body).toContain('不适用异常值检查');
    expect(body).not.toMatch(/「年龄」[^。]*IQR/);
  });

  it('类别归并口径写清 winner 与「出现次数最多者胜」', () => {
    const body = text(draftOf());
    expect(body).toContain('「研究生」统一为「硕士」');
    expect(body).toContain('出现次数最多者胜');
  });
});

describe('人工复核、未执行动作与依据边界', () => {
  it('人工复核写清四类条数与理由；没填理由就明说没填', () => {
    const reviewItems: ReadableReportInput['reviewItems'] = [
      {
        issue: {
          title: '备注列存在缺失',
          severity: 'medium',
          suggestion: { action: 'fill_missing', params: { column: '备注' }, rationale: '缺失比例高' },
        },
        decision: 'rejected',
        note: '缺失本身有含义',
      },
    ];
    const withNote = text(draftOf({ reviewItems }));
    expect(withNote).toContain('拒绝并保留原值 1 条');
    expect(withNote).toContain('理由：缺失本身有含义');

    const withoutNote = text(
      draftOf({
        reviewItems: [
          {
            ...reviewItems[0]!,
            note: undefined,
          },
        ],
      }),
    );
    expect(withoutNote).toContain('没有填写理由');
  });

  it('未执行的动作写明原因，不能写成已执行', () => {
    const body = text(
      draftOf({
        skipped: [
          {
            action: {
              action: 'unify_units',
              params: { column: '单位' },
              rationale: '单位写法不一',
              columns: ['单位'],
            },
            reason: '缺少目标单位',
          },
        ],
      }),
    );
    expect(body).toContain('未执行');
    expect(body).toContain('缺少目标单位');
  });

  it('只引用可追溯的用户值域规则；知识库只给规模，不编规则编号', () => {
    const withRule = text(
      draftOf({}, [{ id: 'user-range:年龄', column: '年龄', min: 0, max: 120 }]),
    );
    expect(withRule).toContain('user-range:年龄');
    expect(withRule).not.toMatch(/general-[a-z0-9-]+/);
    // 表级边界（只做单数据集）也必须写出来：它只在 coverage.table 上
    expect(withRule).toContain('跨表检查');

    expect(text(draftOf({}, [], null))).toContain('规则库索引本次没有加载出来');
    // 索引加载了也不等于「分析时参考过」：只写「可供检索」
    expect(text(draftOf())).toContain('可供分析时检索');
    expect(text(draftOf())).not.toContain('参考了领域规则库');
  });

  it('检查项崩了时写「检查未完成」，不写成「未做判定」', () => {
    const failedCoverage = buildCoverageMap({
      profile: {
        rowCount: 6,
        columnCount: 1,
        duplicateColumnNames: [],
        columns: [
          { name: '年龄', type: 'number', missingCount: 0, missingRate: 0, uniqueCount: 6, samples: [] },
        ],
      },
      issues: [
        {
          id: 'check-failed:outliers:0',
          checkId: 'check-failed',
          severity: 'high',
          title: '检查未完成',
          description: '测试用',
          evidence: { columns: [], statistics: {} },
          confidence: 1,
        },
      ],
      checksStatus: 'done',
      checksVersion: 3,
      dataVersion: 3,
      synonymStatus: 'ready',
      rangeRules: [],
    });

    const body = text(draftOf({ coverageMap: failedCoverage }));
    expect(body).toContain('异常值：下列字段的检查未完成');
    expect(body).not.toContain('异常值：下列字段本次未做异常值判定');
  });

  it('清单里混有 check-failed 时，第二段与 caveats 都要说明结果不完整', () => {
    const draft = draftOf({
      checkIssues: [
        { severity: 'high', columns: ['年龄'], checkId: 'outliers' },
        { severity: 'high', columns: [], checkId: 'check-failed' },
      ],
    });

    expect(text(draft)).toContain('未能完成的检查项');
    expect(draft.caveats.join('')).toContain('检查项未全部完成');
  });

  it('免责声明只有一个来源：纯文本线与 Markdown 都引用同一常量', () => {
    const draft = draftOf();
    expect(draft.disclaimer).toBe(METHOD_DRAFT_DISCLAIMER);
    expect(methodDraftLines(draft).at(-1)).toEqual({
      kind: 'disclaimer',
      text: METHOD_DRAFT_DISCLAIMER,
    });
    const markdown = formatMethodDraftMarkdown(draft);
    expect(markdown).toContain(METHOD_DRAFT_DISCLAIMER);
    expect(markdown).toContain('# 数据处理方法（草稿）');
  });
});

/**
 * 8 项检查里 `category-synonyms` 的语义部分由端侧模型单独执行，
 * 不能算进「确定性检查」；模型没就绪/降级时，草稿必须明说语义部分没做。
 */
describe('语义层与确定性检查分开写', () => {
  const categoryCoverage = (synonymStatus: 'ready' | 'pending' | 'degraded') =>
    buildCoverageMap({
      profile: {
        rowCount: 6,
        columnCount: 1,
        duplicateColumnNames: [],
        columns: [
          { name: '学历', type: 'category', missingCount: 0, missingRate: 0, uniqueCount: 3, samples: [] },
        ],
      },
      issues: [],
      checksStatus: 'done',
      checksVersion: 3,
      dataVersion: 3,
      synonymStatus,
      rangeRules: [],
    });

  it('方法描述写 7 项确定性规则，并明说类别同义的语义部分不是确定性规则', () => {
    const body = text(draftOf());
    expect(body).toContain('7 项确定性规则');
    expect(body).toContain('语义部分不是确定性规则');
    expect(body).not.toContain('8 项确定性检查');
  });

  it('语义模型降级时只写「字面与结构规则」，并进 caveats', () => {
    const draft = draftOf({ coverageMap: categoryCoverage('degraded') });
    expect(text(draft)).toContain('端侧语义模型不可用');
    expect(draft.caveats.join('')).toContain('语义部分未完成');
  });

  it('语义模型未就绪时写「未做语义相似度检查」', () => {
    const body = text(draftOf({ coverageMap: categoryCoverage('pending') }));
    expect(body).toContain('未做语义相似度检查');
  });
});
