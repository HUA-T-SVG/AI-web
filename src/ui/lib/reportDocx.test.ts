import { describe, expect, it } from 'vitest';
import type { Provenance } from '@/scriptgen';
import { buildReadableReport, type ReadableReportInput } from './report';
import type { CoverageMap } from './coverageMap';
import { buildReportDocx, buildReportDocxBlob } from './reportDocx';

/**
 * Word 生成的单测。
 *
 * 只验「它是不是一个真的 .docx」：docx 本质是 zip，文件头必须是 `PK`。
 * 内容层面的断言放在 `report.test.ts`（那份报告对象才是内容的真源）；
 * 这里再断言一遍段落文字，会把同一份期望写两处，改一处忘一处就变成假绿。
 */

const provenance: Provenance = {
  datasetFingerprint: '1a2b3c4d',
  resultFingerprint: '5e6f7a8b',
  sessionStartedAt: '2026-10-23T00:00:00.000Z',
  completedAt: '2026-10-23T00:30:00.000Z',
  steps: [
    {
      index: 0,
      actionType: 'trim_whitespace',
      targetColumns: ['备注'],
      params: { columns: ['备注'] },
      appliedAt: '2026-10-23T01:02:03.000Z',
      changedCells: 2,
      beforeRowCount: 7,
      afterRowCount: 7,
    },
    {
      index: 1,
      actionType: 'remove_duplicates',
      targetColumns: [],
      params: {},
      appliedAt: '2026-10-23T01:03:00.000Z',
      changedCells: 2,
      beforeRowCount: 7,
      afterRowCount: 5,
    },
  ],
  decisions: [],
  generatedScript: '# pandas 脚本',
  environment: {
    appVersion: '0.1.0',
    ruleLibraryVersion: '113 条',
    embeddingModel: 'bge-small-zh（q8）',
    dataVersion: 3,
  },
};

function sampleReport(overrides: Partial<ReadableReportInput> = {}) {
  return buildReadableReport({
    sourceFileName: 'messy-survey.csv',
    dataVersion: 3,
    generatedAt: '2026-10-23T02:00:00.000Z',
    provenance,
    originalRowCount: 7,
    currentRowCount: 5,
    originalColumnCount: 6,
    currentColumnCount: 6,
    fieldChanges: [
      { name: '备注', missingBefore: 2, missingAfter: 0, uniqueBefore: 6, uniqueAfter: 5 },
    ],
    rowDelta: -2,
    reviewItems: [
      {
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
      },
    ],
    skipped: [],
    runVersion: 3,
    executedVersion: 3,
    checksVersion: 3,
    checksStatus: 'done',
    checkIssues: [
      { severity: 'high', columns: ['年龄'], checkId: 'outliers' },
      { severity: 'medium', columns: ['备注'], checkId: 'missing' },
    ],
    ...overrides,
  });
}

describe('Word 报告', () => {
  it('Packer.toBuffer 产出的是 PK 开头的非空字节', async () => {
    const bytes = await buildReportDocx(sampleReport());

    expect(bytes.byteLength).toBeGreaterThan(1000);
    // zip 文件头 'PK'。长度够、头不对，说明生成的是别的格式（例如退化成 HTML）
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
  });

  it('浏览器下载路径给出带正确 MIME 的 Blob', async () => {
    const blob = await buildReportDocxBlob(sampleReport());

    expect(blob.size).toBeGreaterThan(1000);
    expect(blob.type).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
  });

  it('没有动作也能生成 —— 空报告不允许抛错', async () => {
    const report = buildReadableReport({
      sourceFileName: 'empty.csv',
      dataVersion: 1,
      generatedAt: '2026-10-23T02:00:00.000Z',
      provenance: { ...provenance, steps: [] },
      originalRowCount: 5,
      currentRowCount: 5,
      originalColumnCount: 3,
      currentColumnCount: 3,
      fieldChanges: [],
      rowDelta: 0,
      reviewItems: [],
      skipped: [],
    });

    const bytes = await buildReportDocx(report);
    expect(bytes[0]).toBe(0x50);
  });

  it('检查未完成或属于旧版本时也能生成，不会因为缺少结论抛错', async () => {
    const reports = [
      sampleReport({ checksStatus: 'running', checksVersion: null, checkIssues: [] }),
      sampleReport({ checksVersion: 1 }),
    ];

    for (const report of reports) {
      // 内容口径由 report.test.ts 钉住；这里只确认三态都不会在 Word 生成路径上抛错
      const bytes = await buildReportDocx(report);
      expect(bytes[0]).toBe(0x50);
      expect(bytes[1]).toBe(0x4b);
    }
  });

  it('带检查覆盖地图时 Word 仍能生成', async () => {
    // Word 的内容口径同样由 report.test.ts 钉住；这里守的是「新增的覆盖表
    // 不会让 OOXML 生成路径抛错」——表格是最容易在序列化阶段炸掉的部分。
    const coverageMap: CoverageMap = {
      trustworthy: true,
      summary: '已覆盖 1 个字段；1 处属于能力边界或待补充配置（不代表数据没有问题）',
      table: {
        column: '全表',
        type: 'table',
        completed: ['duplicates'],
        gaps: [
          {
            kind: 'not-applicable',
            capability: '跨表检查',
            reason: '当前只处理单数据集',
            action: null,
          },
        ],
      },
      fields: [{ column: '备注', type: 'text', completed: ['missing'], gaps: [] }],
    };

    const bytes = await buildReportDocx(sampleReport({ coverageMap }));
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
  });
});
