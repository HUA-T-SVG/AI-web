import { describe, expect, it } from 'vitest';
import type { ColumnProfile, ColumnType, DatasetProfile, QualityIssue } from '@/core';
import {
  buildCoverageMap,
  type CoverageGap,
  type CoverageMap,
  type CoverageMapInput,
  type FieldCoverage,
} from './coverageMap';

/**
 * 覆盖地图的用例都盯着同一件事：**它会不会把「没检查」说成「检查过」**。
 * 所以除了断言缺口本身，大多数用例还会顺手检查文案里不出现「通过」「合格」——
 * 这两个词一旦落在这张图上，就等于替一份不完整的检查签了字。
 */

const VERDICT_WORDS = /通过|合格/;

function column(
  name: string,
  type: ColumnType,
  overrides: Partial<Omit<ColumnProfile, 'name' | 'type'>> = {},
): ColumnProfile {
  return {
    name,
    type,
    missingCount: 0,
    missingRate: 0,
    uniqueCount: 0,
    samples: [],
    ...overrides,
  };
}

function datasetOf(...columns: ColumnProfile[]): DatasetProfile {
  return { rowCount: 4, columnCount: columns.length, columns, duplicateColumnNames: [] };
}

function coverageInput(overrides: Partial<CoverageMapInput> = {}): CoverageMapInput {
  const base: CoverageMapInput = {
    profile: datasetOf(column('年龄', 'number')),
    issues: [],
    checksStatus: 'done',
    checksVersion: 1,
    dataVersion: 1,
    synonymStatus: 'ready',
    rangeRules: [],
  };
  return { ...base, ...overrides };
}

function issue(input: Pick<QualityIssue, 'id' | 'checkId'> & Partial<QualityIssue>): QualityIssue {
  const base: QualityIssue = {
    id: input.id,
    checkId: input.checkId,
    severity: input.severity ?? 'medium',
    title: input.title ?? '测试问题',
    description: input.description ?? '测试用的问题描述',
    evidence: input.evidence ?? { columns: [], statistics: {} },
    confidence: input.confidence ?? 0.9,
  };
  return input.suggestion === undefined ? base : { ...base, suggestion: input.suggestion };
}

/** 构造 runAllChecks 在检查项崩溃时产出的那条问题：真实项藏在 id 中间那段 */
function failedIssue(checkId: string, sequence: number): QualityIssue {
  return issue({
    id: `check-failed:${checkId}:${sequence}`,
    checkId: 'check-failed',
    evidence: { columns: [], statistics: { failedCheckId: checkId } },
  });
}

function allRows(map: CoverageMap): FieldCoverage[] {
  return [map.table, ...map.fields];
}

function fieldOf(map: CoverageMap, name: string): FieldCoverage {
  const field = map.fields.find((item) => item.column === name);
  if (field === undefined) throw new Error(`覆盖地图里没有「${name}」这一列`);
  return field;
}

function gapOf(row: FieldCoverage, capability: string): CoverageGap | undefined {
  return row.gaps.find((gap) => gap.capability === capability);
}

function expectNoVerdictWords(map: CoverageMap): void {
  for (const gap of allRows(map).flatMap((row) => row.gaps)) {
    expect(gap.reason).not.toMatch(VERDICT_WORDS);
    expect(gap.capability).not.toMatch(VERDICT_WORDS);
  }
  expect(map.summary).not.toMatch(VERDICT_WORDS);
}

function buildCategoryMap(synonymStatus: CoverageMapInput['synonymStatus']): CoverageMap {
  return buildCoverageMap(
    coverageInput({ profile: datasetOf(column('学历', 'category')), synonymStatus }),
  );
}

describe('可信性优先：检查没跑完、失败或过期时只说未知', () => {
  it('检查还在跑时，每一行都只留「未知」一条缺口', () => {
    const map = buildCoverageMap(
      coverageInput({
        profile: datasetOf(column('年龄', 'number'), column('备注', 'text')),
        checksStatus: 'running',
      }),
    );

    expect(map.trustworthy).toBe(false);
    for (const row of allRows(map)) {
      expect(row.completed).toEqual([]);
      expect(row.gaps).toHaveLength(1);
      expect(row.gaps[0]?.kind).toBe('not-run');
      expect(row.gaps[0]?.action).toBeNull();
    }
    expect(map.summary).toContain('未知');
    expectNoVerdictWords(map);
  });

  it('检查失败时说「失败」并给出重跑入口，而不是当作零问题', () => {
    const map = buildCoverageMap(coverageInput({ checksStatus: 'failed' }));

    expect(map.trustworthy).toBe(false);
    for (const row of allRows(map)) {
      expect(row.completed).toEqual([]);
      expect(row.gaps[0]?.kind).toBe('not-run');
      expect(row.gaps[0]?.action).toBe('rerun-checks');
      expect(row.gaps[0]?.reason).toContain('检查失败');
    }
    expect(map.summary).toContain('失败');
    expect(map.summary).toContain('未知');
    expectNoVerdictWords(map);
  });

  it('数据换了版本之后，旧结论作废并提示重跑', () => {
    const map = buildCoverageMap(coverageInput({ checksVersion: 1, dataVersion: 2 }));

    expect(map.trustworthy).toBe(false);
    for (const row of allRows(map)) {
      expect(row.completed).toEqual([]);
      expect(row.gaps).toHaveLength(1);
      expect(row.gaps[0]?.kind).toBe('stale');
      expect(row.gaps[0]?.action).toBe('rerun-checks');
      expect(row.gaps[0]?.reason).toContain('旧数据版本');
    }
    expect(map.summary).toContain('未知');
    expectNoVerdictWords(map);
  });

  it('检查完成但没记版本号时，同样不敢标成可信', () => {
    const map = buildCoverageMap(coverageInput({ checksVersion: null }));

    expect(map.trustworthy).toBe(false);
    expect(map.table.completed).toEqual([]);
    expect(map.table.gaps[0]?.kind).toBe('stale');
  });
});

describe('字段级覆盖：按列类型与用户配置算已覆盖项', () => {
  it('数值列跑完四项检查，但没配值域规则时如实标成待配置', () => {
    const map = buildCoverageMap(coverageInput());
    const age = fieldOf(map, '年龄');

    expect(map.trustworthy).toBe(true);
    expect(age.completed).toEqual(
      expect.arrayContaining(['missing', 'type-consistency', 'unit-consistency', 'outliers']),
    );

    const rangeGap = gapOf(age, '值域规则');
    expect(rangeGap?.kind).toBe('not-configured');
    expect(rangeGap?.action).toBe('configure-range');
    expect(rangeGap?.reason).toContain('尚未确认');

    expect(map.summary).toContain('已覆盖 1 个字段');
    expectNoVerdictWords(map);
  });

  it('配了值域规则的数值列算已覆盖，不再提示未配置', () => {
    const map = buildCoverageMap(
      coverageInput({ rangeRules: [{ id: 'user-range:年龄', column: '年龄', min: 0, max: 120 }] }),
    );
    const age = fieldOf(map, '年龄');

    expect(age.completed).toContain('range-rules');
    expect(gapOf(age, '值域规则')).toBeUndefined();
  });

  it('混杂列也能配值域规则 —— 解析不出的取值只是被跳过', () => {
    const mixedProfile = datasetOf(column('年龄', 'mixed'));
    const unconfigured = buildCoverageMap(coverageInput({ profile: mixedProfile }));
    const missingRule = gapOf(fieldOf(unconfigured, '年龄'), '值域规则');

    expect(missingRule?.kind).toBe('not-configured');
    expect(missingRule?.action).toBe('configure-range');

    const configured = buildCoverageMap(
      coverageInput({
        profile: mixedProfile,
        rangeRules: [{ id: 'user-range:年龄', column: '年龄', min: 0, max: 120 }],
      }),
    );
    const row = fieldOf(configured, '年龄');

    expect(row.completed).toContain('range-rules');
    expect(gapOf(row, '值域规则')).toBeUndefined();
    // 混杂列终究不是数值列，异常值检查不适用
    expect(gapOf(row, '异常值')?.kind).toBe('not-applicable');
  });

  it('文本列不适用异常值与值域规则，各留一条解释', () => {
    const map = buildCoverageMap(coverageInput({ profile: datasetOf(column('备注', 'text')) }));
    const remark = fieldOf(map, '备注');

    expect(remark.completed).toEqual(['missing', 'type-consistency', 'unit-consistency']);

    const outlierGap = gapOf(remark, '异常值');
    expect(outlierGap?.kind).toBe('not-applicable');
    expect(outlierGap?.reason).toContain('非数值列');

    const rangeGap = gapOf(remark, '值域规则');
    expect(rangeGap?.kind).toBe('not-applicable');
    expect(rangeGap?.action).toBeNull();
    expect(rangeGap?.reason).toContain('文本/空列');
  });

  it('类别列没配允许取值清单时提示配置，配了就算已覆盖', () => {
    const education = fieldOf(buildCategoryMap('ready'), '学历');

    // 分类列的「取值范围」是允许取值清单，不是数值区间：入口必须能点出来
    expect(education.completed).not.toContain('range-rules');
    const missing = gapOf(education, '值域规则');
    expect(missing?.kind).toBe('not-configured');
    expect(missing?.action).toBe('configure-range');
    expect(missing?.reason).toContain('允许取值清单');

    const configured = buildCoverageMap(
      coverageInput({
        profile: datasetOf(column('学历', 'category')),
        rangeRules: [
          {
            id: 'edu-allowed',
            column: '学历',
            allowedValues: ['本科', '硕士', '博士'],
            rationale: '学历合法取值',
          },
        ],
      }),
    );
    const covered = fieldOf(configured, '学历');
    expect(covered.completed).toContain('range-rules');
    expect(gapOf(covered, '值域规则')).toBeUndefined();
  });

  it('语义归并就绪时，类别列的语义检查才算已覆盖', () => {
    const map = buildCategoryMap('ready');
    const education = fieldOf(map, '学历');

    expect(map.trustworthy).toBe(true);
    expect(education.completed).toContain('category-synonyms');
    expect(gapOf(education, '语义归并')).toBeUndefined();
  });

  it('语义模型还在排队时，类别列如实标注这次没查同义写法', () => {
    for (const status of ['pending', 'idle'] as const) {
      const education = fieldOf(buildCategoryMap(status), '学历');
      const gap = gapOf(education, '语义归并');

      expect(education.completed).not.toContain('category-synonyms');
      expect(gap?.kind).toBe('not-run');
      expect(gap?.action).toBeNull();
      expect(gap?.reason).toContain('语义模型还没准备好');
    }
  });

  it('端侧模型不可用时，语义归并降级成一条明确的能力缺口', () => {
    const education = fieldOf(buildCategoryMap('degraded'), '学历');
    const gap = gapOf(education, '语义归并');

    expect(education.completed).not.toContain('category-synonyms');
    expect(gap?.kind).toBe('degraded');
    expect(gap?.reason).toContain('端侧模型不可用');
    expect(gap?.action).toBeNull();
  });

  it('全空列只说明「无从检查」，不虚报任何已完成项', () => {
    const map = buildCoverageMap(coverageInput({ profile: datasetOf(column('空列', 'empty')) }));
    const empty = fieldOf(map, '空列');

    expect(empty.completed).toEqual([]);
    expect(empty.gaps).toHaveLength(1);
    expect(empty.gaps[0]?.kind).toBe('not-applicable');
    expect(empty.gaps[0]?.capability).toBe('全部列级检查');
    expect(empty.gaps[0]?.reason).toContain('无从检查');
  });

  it('某个检查项崩溃时，从已完成清单移除并单独说明', () => {
    const map = buildCoverageMap(
      coverageInput({
        profile: datasetOf(column('年龄', 'number'), column('备注', 'text')),
        issues: [failedIssue('missing', 1), failedIssue('outliers', 2)],
      }),
    );
    const age = fieldOf(map, '年龄');

    expect(age.completed).not.toContain('missing');
    expect(age.completed).not.toContain('outliers');
    expect(age.completed).toContain('type-consistency');

    const missingGap = gapOf(age, '缺失值');
    expect(missingGap?.kind).toBe('failed');
    expect(missingGap?.reason).toContain('未完成');
    expect(missingGap?.action).toBe('rerun-checks');
    expect(gapOf(age, '异常值')?.kind).toBe('failed');

    // 缺失检查扫过所有列，文本列也得跟着标掉，不能只剩数值列显示失败
    const remark = fieldOf(map, '备注');
    expect(remark.completed).not.toContain('missing');
    expect(gapOf(remark, '缺失值')?.kind).toBe('failed');
  });

  it('检查只提了候选时给人工复核入口，并说明这不是结论', () => {
    const issues = [
      issue({
        id: 'outlier-review',
        checkId: 'outliers',
        evidence: { columns: ['年龄'], statistics: {} },
        suggestion: { action: 'review_outliers', params: {}, rationale: '请确认异常是否真实' },
      }),
      issue({
        id: 'outlier-review-2',
        checkId: 'outliers',
        evidence: { columns: ['年龄'], statistics: {} },
        suggestion: { action: 'review_outliers', params: {}, rationale: '同一条列上的第二个候选' },
      }),
    ];
    const row = fieldOf(buildCoverageMap(coverageInput({ issues })), '年龄');
    const reviewGaps = row.gaps.filter((gap) => gap.capability === '人工复核');

    // 同一字段上并列两条「待复核」只会刷屏，合并成一条
    expect(reviewGaps).toHaveLength(1);
    expect(reviewGaps[0]?.kind).toBe('needs-review');
    expect(reviewGaps[0]?.action).toBe('review-pending');
    expect(reviewGaps[0]?.reason).toContain('不是自动结论');
  });

  it('低置信度的类别同义候选同样必须人工确认', () => {
    const issues = [
      issue({
        id: 'synonym-review',
        checkId: 'category-synonyms',
        confidence: 0.45,
        evidence: { columns: ['学历'], statistics: {} },
        suggestion: { action: 'merge_categories', params: {}, rationale: '若确认同义再合并' },
      }),
    ];
    const map = buildCoverageMap(
      coverageInput({ profile: datasetOf(column('学历', 'category')), issues }),
    );

    expect(gapOf(fieldOf(map, '学历'), '人工复核')?.kind).toBe('needs-review');
  });
});

describe('表级行：能力边界与整表检查', () => {
  it('表级固定两条能力边界，completed 只说明执行过、不宣称结论', () => {
    const map = buildCoverageMap(coverageInput());
    const table = map.table;

    expect(table.column).toBe('全表');
    expect(table.type).toBe('table');
    expect(table.completed).toEqual(['duplicates', 'duplicate-column-names']);
    expect(table.gaps).toHaveLength(2);

    const crossTable = gapOf(table, '跨表检查');
    expect(crossTable?.kind).toBe('not-applicable');
    expect(crossTable?.action).toBeNull();
    expect(crossTable?.reason).toContain('单数据集');

    const crossField = gapOf(table, '跨字段口径');
    expect(crossField?.kind).toBe('not-applicable');
    expect(crossField?.action).toBeNull();
    expect(crossField?.reason).toContain('人工核对');

    // 没有任何一条「重复记录没问题」之类的表述
    expectNoVerdictWords(map);
  });

  it('表级检查崩溃时也如实标失败，能力边界仍然保留', () => {
    const map = buildCoverageMap(coverageInput({ issues: [failedIssue('duplicates', 1)] }));
    const table = map.table;

    expect(table.completed).toEqual(['duplicate-column-names']);

    const failed = gapOf(table, '重复记录');
    expect(failed?.kind).toBe('failed');
    expect(failed?.action).toBe('rerun-checks');
    expect(gapOf(table, '跨表检查')).toBeDefined();
  });

  it('不可信时表级行同样只剩一条未知缺口', () => {
    const map = buildCoverageMap(coverageInput({ checksStatus: 'running' }));

    expect(map.table.completed).toEqual([]);
    expect(map.table.gaps).toHaveLength(1);
    expect(map.table.gaps[0]?.kind).toBe('not-run');
  });
});

describe('文案底线：覆盖不等于结论', () => {
  it('整张地图不出现「通过」「合格」', () => {
    const map = buildCoverageMap(
      coverageInput({
        profile: datasetOf(
          column('年龄', 'mixed'),
          column('学历', 'category'),
          column('备注', 'text'),
          column('空列', 'empty'),
        ),
        issues: [
          issue({
            id: 'review-all',
            checkId: 'outliers',
            evidence: { columns: ['年龄'], statistics: {} },
            suggestion: { action: 'review_outliers', params: {}, rationale: '请确认' },
          }),
        ],
      }),
    );

    expectNoVerdictWords(map);
    expect(map.summary).not.toContain('通过');
    expect(map.summary).not.toContain('合格');
  });
});
