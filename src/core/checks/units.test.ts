import { describe, expect, it } from 'vitest';
import { checkUnitConsistency } from './units';
import type { Dataset } from '../types';

function datasetOf(values: Array<string | number | null>, name = '剂量'): Dataset {
  return { rowCount: values.length, columns: [{ name, values }] };
}

describe('单位一致性', () => {
  it('同一列里混用 mg 与 g，且数值分布呈倍数关系 → 报出', () => {
    const issues = checkUnitConsistency(
      datasetOf(['5mg', '10mg', '0.005g', '0.01g', '8mg', '0.008g']),
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]?.checkId).toBe('unit-consistency');
    expect(String(issues[0]?.evidence.statistics.units)).toContain('mg');
    expect(String(issues[0]?.evidence.statistics.units)).toContain('g');
  });

  it('单位写在表头而不是取值里 → 不报（那是另一条规则的事）', () => {
    // 「剂量(mg)」这一列的取值是纯数字，单位在列名里。
    // 值域与单位的关系在列名上，不属于「同一列内单位混用」
    expect(checkUnitConsistency(datasetOf([5, 10, 0.005, 0.01], '剂量(mg)'))).toHaveLength(0);
  });

  it('单一单位 → 不报', () => {
    expect(checkUnitConsistency(datasetOf(['5mg', '10mg', '8mg', '12mg']))).toHaveLength(0);
  });

  it('取值里没有任何单位后缀 → 不报', () => {
    expect(checkUnitConsistency(datasetOf([23, 25, 24, 26], '年龄'))).toHaveLength(0);
  });

  it('量级相同、只是写法不同（如 mg 与 MG）→ 不报', () => {
    expect(checkUnitConsistency(datasetOf(['5mg', '10MG', '8Mg', '12mG']))).toHaveLength(0);
  });

  it('跨量纲族（长度与质量）混在一列 → 报出，且说明是不同量纲', () => {
    const issues = checkUnitConsistency(datasetOf(['5cm', '10cm', '5kg', '10kg']));
    expect(issues).toHaveLength(1);
    expect(issues[0]?.description).toContain('量纲');
  });

  it('单位只出现一次（低频）时不下结论 —— 可能是录入错误而不是量纲混用', () => {
    const values = Array.from({ length: 20 }, (_, index) => `${index + 1}mg`);
    values.push('1g');
    expect(checkUnitConsistency(datasetOf(values))).toHaveLength(0);
  });

  it('纯数字列的 values 里混了带单位的串 → 报出', () => {
    const issues = checkUnitConsistency(datasetOf([5, 10, '0.005g', '0.01g']));
    expect(issues).toHaveLength(1);
  });

  it('空列与全缺失不报，也不抛异常', () => {
    expect(checkUnitConsistency(datasetOf([null, null, null]))).toHaveLength(0);
    expect(checkUnitConsistency({ rowCount: 0, columns: [{ name: '空', values: [] }] })).toHaveLength(
      0,
    );
  });

  it('问题的证据里带上每种单位的出现次数，用户能看出是哪边占多数', () => {
    const issues = checkUnitConsistency(datasetOf(['5mg', '10mg', '0.005g', '0.01g', '8mg']));
    expect(Number(issues[0]?.evidence.statistics.dominantCount)).toBeGreaterThanOrEqual(3);
  });
});
