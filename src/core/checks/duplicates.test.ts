import { describe, it, expect } from 'vitest';
import type { Dataset } from '../types';
import { checkDuplicates } from './duplicates';

function makeDataset(rows: string[][]): Dataset {
  const headers = ['姓名', '年龄'];
  return {
    rowCount: rows.length,
    columns: headers.map((name, colIndex) => ({
      name,
      values: rows.map((r) => r[colIndex] ?? null),
    })),
  };
}

describe('checkDuplicates', () => {
  it('没有重复时不报问题', () => {
    const issues = checkDuplicates(makeDataset([['张三', '20'], ['李四', '21']]));
    expect(issues).toEqual([]);
  });

  it('报出完全重复的行组', () => {
    const issues = checkDuplicates(
      makeDataset([['张三', '20'], ['李四', '21'], ['张三', '20']]),
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]?.checkId).toBe('duplicates');
  });

  it('证据中给出重复行下标', () => {
    const issues = checkDuplicates(
      makeDataset([['张三', '20'], ['李四', '21'], ['张三', '20']]),
    );
    expect(issues[0]?.evidence.rowIndices).toEqual([0, 2]);
  });

  it('忽略空白与大小写差异后仍判为重复', () => {
    const issues = checkDuplicates(makeDataset([['张三 ', '20'], [' 张三', '20']]));
    expect(issues).toHaveLength(1);
  });

  it('指定键列时只按键列判重', () => {
    const dataset = makeDataset([['张三', '20'], ['张三', '21']]);
    expect(checkDuplicates(dataset)).toEqual([]);
    expect(checkDuplicates(dataset, { keyColumns: ['姓名'] })).toHaveLength(1);
  });

  it('空数据集不报问题', () => {
    expect(checkDuplicates({ columns: [], rowCount: 0 })).toEqual([]);
  });

  it('全部行相同只报一组，不报 N 组', () => {
    const issues = checkDuplicates(makeDataset([['张三', '20'], ['张三', '20'], ['张三', '20']]));
    expect(issues).toHaveLength(1);
    expect(issues[0]?.evidence.rowIndices).toEqual([0, 1, 2]);
  });

  it('主键列重复判为 high', () => {
    const dataset: Dataset = {
      rowCount: 4,
      columns: [
        { name: '学号', values: ['001', '002', '001', '003'] },
        { name: '成绩', values: ['90', '80', '70', '60'] },
      ],
    };
    const issues = checkDuplicates(dataset, { keyColumns: ['学号'] });
    expect(issues[0]?.severity).toBe('high');
  });
});
