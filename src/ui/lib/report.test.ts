import { describe, expect, it } from 'vitest';
import type { DatasetProfile } from '@/core';
import type { Provenance, ProvenanceStep } from '@/scriptgen';
import {
  buildChecksConclusion,
  buildReadableReport,
  buildStaleNotices,
  formatParams,
  formatReportTime,
  type ReadableReportInput,
  type ReportCheckIssue,
  type ReportReviewItem,
} from './report';
import { buildCoverageMap } from './coverageMap';

/**
 * 报告装配的单测。
 *
 * 守的是「读者能不能从报告里读到该有的东西」：动作、影响、人工决定与理由、
 * 遗留风险、检查结论，以及版本对不上时必须自己说出来。数字口径（尤其是删行
 * 不重复计数）是这里最容易写错、也最容易被读者当真的一项；检查结论则相反 ——
 * 最容易在「没跑完」时被写成一句看起来像结论的话。
 */

function step(partial: Partial<ProvenanceStep> & Pick<ProvenanceStep, 'index'>): ProvenanceStep {
  return {
    actionType: 'trim_whitespace',
    targetColumns: ['备注'],
    params: { columns: ['备注'] },
    appliedAt: '2026-10-23T01:02:03.000Z',
    changedCells: 1,
    beforeRowCount: 7,
    afterRowCount: 7,
    ...partial,
  };
}

function provenance(steps: ProvenanceStep[]): Provenance {
  return {
    datasetFingerprint: '1a2b3c4d',
    resultFingerprint: '5e6f7a8b',
    sessionStartedAt: '2026-10-23T00:00:00.000Z',
    completedAt: '2026-10-23T00:30:00.000Z',
    steps,
    decisions: [],
    generatedScript: '# pandas 脚本',
    environment: {
      appVersion: '0.1.0',
      ruleLibraryVersion: '113 条',
      embeddingModel: 'bge-small-zh（q8）',
      dataVersion: 3,
    },
  };
}

/** 备注、学历在两条问题里都出现：涉及字段要按列名去重，不能重复计数 */
const checkIssues: ReportCheckIssue[] = [
  { severity: 'high', columns: ['年龄'], checkId: 'outliers' },
  { severity: 'medium', columns: ['备注', '学历'], checkId: 'type-consistency' },
  { severity: 'medium', columns: ['备注'], checkId: 'missing' },
  { severity: 'low', columns: ['学历'], checkId: 'units' },
];

function baseInput(overrides: Partial<ReadableReportInput> = {}): ReadableReportInput {
  return {
    sourceFileName: 'messy-survey.csv',
    dataVersion: 3,
    generatedAt: '2026-10-23T02:00:00.000Z',
    provenance: provenance([
      step({ index: 0, actionType: 'trim_whitespace', changedCells: 2 }),
      step({
        index: 1,
        actionType: 'remove_duplicates',
        params: {},
        targetColumns: [],
        changedCells: 2,
        beforeRowCount: 7,
        afterRowCount: 5,
      }),
    ]),
    originalRowCount: 7,
    currentRowCount: 5,
    originalColumnCount: 6,
    currentColumnCount: 6,
    fieldChanges: [
      { name: '备注', missingBefore: 2, missingAfter: 0, uniqueBefore: 6, uniqueAfter: 5 },
    ],
    rowDelta: -2,
    reviewItems: [],
    skipped: [],
    runVersion: 3,
    executedVersion: 3,
    checksVersion: 3,
    checksStatus: 'done',
    checkIssues,
    ...overrides,
  };
}

const rejectedItem: ReportReviewItem = {
  issue: {
    title: '备注列存在缺失',
    severity: 'medium',
    suggestion: {
      action: 'fill_missing',
      params: { column: '备注', value: '未填写' },
      rationale: '缺失比例 12%，填一个明确标记比留空更便于复核',
    },
  },
  decision: 'rejected',
  note: '缺失本身有含义：受访者拒答与未填写要分开保留',
};

const acceptedItem: ReportReviewItem = {
  issue: {
    title: '学历写法不一致',
    severity: 'low',
    suggestion: {
      action: 'merge_categories',
      params: { column: '学历', groups: [['硕士', '研究生']] },
      rationale: '同一含义的两种写法会影响分组统计',
    },
  },
  decision: 'accepted',
};

const pendingItem: ReportReviewItem = {
  issue: {
    title: '年龄存在异常值',
    severity: 'high',
    suggestion: {
      action: 'fill_or_drop',
      params: { column: '年龄' },
      rationale: '需要人工判断该填还是该删',
    },
  },
  decision: 'pending',
};

/** 报告覆盖段落用的两列画像：一列数值（可配值域）、一列文本（不适用异常值） */
const coverageProfile: DatasetProfile = {
  rowCount: 7,
  columnCount: 2,
  duplicateColumnNames: [],
  columns: [
    {
      name: '年龄',
      type: 'number',
      missingCount: 0,
      missingRate: 0,
      uniqueCount: 5,
      numeric: { min: 1, max: 999, mean: 100, q1: 10, median: 20, q3: 30, stdDev: 40 },
      samples: ['20', '21'],
    },
    {
      name: '备注',
      type: 'text',
      missingCount: 2,
      missingRate: 0.28,
      uniqueCount: 5,
      samples: ['正常', '未知'],
    },
  ],
};

function coverageInput(checksStatus: 'done' | 'running' = 'done') {
  return buildCoverageMap({
    profile: coverageProfile,
    issues: [],
    checksStatus,
    checksVersion: 3,
    dataVersion: 3,
    synonymStatus: 'ready',
    rangeRules: [{ id: 'rule-age', column: '年龄', min: 0, max: 120, rationale: '测试' }],
  });
}

describe('可读报告装配', () => {
  it('有动作时给出处理摘要、逐步动作与字段变化', () => {
    const report = buildReadableReport(baseInput());

    expect(report.summary.actionCount).toBe(2);
    // 删除重复行那一步的 changedCells 记的是「删了 2 行」，不能和改单元格相加
    expect(report.summary.changedCells).toBe(2);
    expect(report.summary.deletedRows).toBe(2);
    expect(report.summary.beforeRowCount).toBe(7);
    expect(report.summary.afterRowCount).toBe(5);
    expect(report.summary.isEmpty).toBe(false);

    expect(report.steps).toHaveLength(2);
    expect(report.steps[0]?.actionText).toBe('去除首尾空格');
    expect(report.steps[0]?.impactText).toBe('改动 2 个单元格，行数不变（7 行）');
    expect(report.steps[1]?.actionText).toBe('删除重复行');
    expect(report.steps[1]?.impactText).toBe('删除 2 行（7 → 5 行）');
    expect(report.steps[0]?.paramsText).toContain('columns=');

    expect(report.fieldChanges).toHaveLength(1);
    expect(report.fieldChanges[0]?.name).toBe('备注');
    expect(report.rowDelta).toBe(-2);
  });

  it('没有动作时不编造摘要，直接说明数据保持原样', () => {
    const report = buildReadableReport(
      baseInput({
        provenance: provenance([]),
        originalRowCount: 7,
        currentRowCount: 7,
        rowDelta: 0,
        fieldChanges: [],
      }),
    );

    expect(report.summary.isEmpty).toBe(true);
    expect(report.summary.actionCount).toBe(0);
    expect(report.summary.changedCells).toBe(0);
    expect(report.summary.deletedRows).toBe(0);
    expect(report.steps).toEqual([]);
    expect(report.fieldChanges).toEqual([]);
    expect(report.risks.isEmpty).toBe(true);
    expect(report.risks.summary).toBe('本轮没有待确认建议、被拒建议或未执行动作。');
  });

  it('把人工决定与理由写进报告，没填理由时明说而不是留白', () => {
    const report = buildReadableReport(
      baseInput({ reviewItems: [rejectedItem, acceptedItem, pendingItem] }),
    );

    expect(report.decisions).toHaveLength(3);

    const rejected = report.decisions.find((item) => item.decision === 'rejected');
    expect(rejected?.decisionText).toBe('拒绝建议、保留原值');
    expect(rejected?.note).toContain('受访者拒答');
    expect(rejected?.hasNote).toBe(true);

    const accepted = report.decisions.find((item) => item.decision === 'accepted');
    expect(accepted?.decisionText).toBe('接受建议');
    expect(accepted?.note).toBe('未填写理由');
    expect(accepted?.hasNote).toBe(false);

    const pending = report.decisions.find((item) => item.decision === 'pending');
    expect(pending?.decisionText).toBe('待确认');
    expect(pending?.note).toBe('尚未处理，没有理由记录');

    // 遗留风险按「待确认 / 已拒绝 / 未执行」分组，理由跟着走
    expect(report.risks.pending).toHaveLength(1);
    expect(report.risks.rejected).toHaveLength(1);
    expect(report.risks.rejected[0]?.note).toContain('受访者拒答');
    expect(report.risks.summary).toBe('待确认 1 条、已拒绝 1 条。');
  });

  it('旧版本提示：建议、执行版本与数据版本对不上时都要自己说出来', () => {
    expect(buildStaleNotices({ dataVersion: 4, runVersion: 3, executedVersion: null })).toEqual([
      '上一轮 AI 建议基于数据版本 v3，当前数据已是 v4；这批建议已失效，报告不把它们当作当前结论。',
    ]);

    expect(buildStaleNotices({ dataVersion: 5, runVersion: 3, executedVersion: 4 })).toEqual([
      '处理动作与人工决定执行于数据版本 v4，当前数据已是 v5；报告反映的是执行时那一版的结果。',
    ]);

    expect(
      buildStaleNotices({
        dataVersion: 4,
        checksVersion: 3,
        checksStatus: 'done',
      }),
    ).toEqual(['问题清单属于数据版本 v3，与当前 v4 不一致；报告里的检查结论不是当前版本的结果。']);

    // 版本一致、检查完成时不应凭空造出一条提示
    expect(
      buildStaleNotices({
        dataVersion: 3,
        runVersion: 3,
        executedVersion: 3,
        checksVersion: 3,
        checksStatus: 'done',
      }),
    ).toEqual([]);

    // 报告里也要带着同一个结论，不能只在单独的函数里算过
    const report = buildReadableReport(
      baseInput({ dataVersion: 5, runVersion: 3, executedVersion: 3, checksVersion: 5 }),
    );
    expect(report.staleNotices).toHaveLength(1);
    expect(report.staleNotices[0]).toContain('v3');
  });

  it('时间与参数是可读文本，不把原始 ISO 和 [object Object] 印进报告', () => {
    expect(formatReportTime('2026-10-23T02:00:00.000Z')).toBe('2026-10-23 02:00:00（UTC）');
    // 认不出来的形状原样返回，不假装解析成功
    expect(formatReportTime('昨天')).toBe('昨天');

    expect(formatParams({ column: '备注', value: '未填写' })).toBe(
      'column=「备注」；value=「未填写」',
    );
    expect(formatParams({})).toBe('（无参数）');
    expect(formatParams({ groups: [['硕士', '研究生']] })).toBe('groups=[[「硕士」, 「研究生」]]');
  });

  it('检查完成且版本一致：给检出分布、涉及字段与结论版本', () => {
    const report = buildReadableReport(baseInput());

    expect(report.checks.state).toBe('done');
    expect(report.checks.counts).toEqual({
      issueCount: 4,
      high: 1,
      medium: 2,
      low: 1,
      // 备注、学历各出现两次，按列名去重后是 年龄 / 备注 / 学历 三个字段
      fieldCount: 3,
      dataVersion: 3,
    });
    expect(report.checks.summary).toBe(
      '检查已完成：检出问题 4 条（严重 1 条、中等 2 条、轻微 1 条），涉及 3 个字段。',
    );
    expect(report.checks.details.join('')).toContain('结论基于数据版本 v3');
  });

  it('检查没跑完、失败或还没开始时不给结论，也不把空清单说成没问题', () => {
    const running = buildChecksConclusion({
      dataVersion: 3,
      checksStatus: 'running',
      checksVersion: null,
    });
    expect(running.state).toBe('incomplete');
    expect(running.summary).toContain('检查尚未完成');
    expect(running.summary).toContain('不给检查结论');

    const failed = buildChecksConclusion({
      dataVersion: 3,
      checksStatus: 'failed',
      checksVersion: null,
      checksNote: '检查 Worker 没有响应',
      checkIssues: [],
    });
    expect(failed.state).toBe('incomplete');
    expect(failed.summary).toContain('检查失败');
    expect(failed.summary).toContain('不给检查结论');
    expect(failed.details.join('')).toContain('检查 Worker 没有响应');

    const idle = buildChecksConclusion({ dataVersion: 3, checksStatus: 'idle' });
    expect(idle.state).toBe('incomplete');
    expect(idle.summary).toContain('检查尚未开始');

    // 三种「没有结论」的状态都不许出现绿色口径，也不许给出统计数字
    for (const conclusion of [running, failed, idle]) {
      expect(conclusion.counts).toBeNull();
      expect(conclusion.summary).not.toContain('没有检出问题');
    }
  });

  it('检查结论属于旧数据版本时明说已失效，不拿旧数字当当前结论', () => {
    const stale = buildChecksConclusion({
      dataVersion: 5,
      checksStatus: 'done',
      checksVersion: 3,
      checkIssues,
    });

    expect(stale.state).toBe('stale');
    expect(stale.summary).toBe('检查结论属于旧数据版本 v3，当前是 v5，已失效。');
    expect(stale.counts).toBeNull();
    expect(stale.details.join('')).toContain('重新检查');
  });

  it('没有检查信息时不编造结论，只说明报告里有的是清洗留痕', () => {
    const report = buildReadableReport(
      baseInput({ checksStatus: undefined, checksVersion: undefined, checkIssues: undefined }),
    );

    expect(report.checks.state).toBe('unavailable');
    expect(report.checks.summary).toBe('本次报告只有清洗留痕，没有可用的检查结论。');
    expect(report.checks.counts).toBeNull();
  });

  it('有检查项自身失败时要说明清单不完整，不能让人以为全都查过了', () => {
    const conclusion = buildChecksConclusion({
      dataVersion: 3,
      checksStatus: 'done',
      checksVersion: 3,
      // check-failed 是 core 在单个检查抛错时产出的诊断问题，证据里没有具体字段
      checkIssues: [...checkIssues, { severity: 'high', columns: [], checkId: 'check-failed' }],
    });

    expect(conclusion.state).toBe('done');
    expect(conclusion.summary).toContain('检出问题 5 条');
    expect(conclusion.details.join('')).toContain('其中 1 条来自未能完成的检查项');
  });

  it('把检查覆盖与能力边界写进报告，不把「没发现问题」写成「全部通过」', () => {
    const report = buildReadableReport(baseInput({ coverageMap: coverageInput() }));

    expect(report.coverage).not.toBeNull();
    const coverage = report.coverage!;
    expect(coverage.trustworthy).toBe(true);
    // 表级行固定列出跨表/跨字段能力边界，而不是显示「无问题」
    expect(coverage.table.column).toBe('全表');
    expect(coverage.table.gapsText).toContain('跨表检查');
    expect(coverage.table.gapsText).toContain('跨字段口径');

    const age = coverage.fields.find((row) => row.column === '年龄')!;
    // 已配置值域规则：这一项应出现在已完成里，而不是继续算「未覆盖」
    expect(age.completedText).toContain('缺失值');
    expect(age.completedText).toContain('异常值');
    expect(age.completedText).toContain('取值范围');

    const remark = coverage.fields.find((row) => row.column === '备注')!;
    expect(remark.gapsText).toContain('异常值');

    expect(coverage.summary).toContain('不代表数据没有问题');
    expect(coverage.note).toContain('不等于');
    // 整个报告对象里都不能出现「全部通过/检查合格」这种容易被误读的结论
    expect(JSON.stringify(report)).not.toMatch(/全部通过|检查合格/);
  });

  it('检查没跑完时覆盖段落也说自己不可信，不列「已完成」', () => {
    const report = buildReadableReport(baseInput({ coverageMap: coverageInput('running') }));

    expect(report.coverage).not.toBeNull();
    expect(report.coverage!.trustworthy).toBe(false);
    expect(report.coverage!.fields.every((row) => row.completedText === '—')).toBe(true);
  });

  it('没有覆盖数据时报告不编造，显式说明没有画像', () => {
    const report = buildReadableReport(baseInput());

    expect(report.coverage).toBeNull();
  });
});
