import { describe, expect, it } from 'vitest';
import type { Provenance, ProvenanceStep } from '@/scriptgen';
import {
  buildReadableReport,
  buildStaleNotices,
  formatParams,
  formatReportTime,
  type ReadableReportInput,
  type ReportReviewItem,
} from './report';

/**
 * 报告装配的单测。
 *
 * 守的是「读者能不能从报告里读到该有的东西」：动作、影响、人工决定与理由、
 * 遗留风险，以及版本对不上时必须自己说出来。数字口径（尤其是删行不重复计数）
 * 是这里最容易写错、也最容易被读者当真的一项。
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
    generatedScript: '# pandas 脚本',
    environment: {
      appVersion: '0.1.0',
      ruleLibraryVersion: '113 条',
      embeddingModel: 'bge-small-zh（q8）',
      dataVersion: 3,
    },
  };
}

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
});
