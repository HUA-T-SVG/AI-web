import { describe, it, expect } from 'vitest';
import type { ColumnData, Dataset } from '../types';
import { inferColumnType, profileColumn, profileDataset } from './index';

function col(name: string, values: ColumnData['values']): ColumnData {
  return { name, values };
}

describe('inferColumnType', () => {
  it('全部数值推断为 number', () => {
    expect(inferColumnType(col('年龄', [1, 2, 3]))).toBe('number');
  });

  it('数值字符串也推断为 number', () => {
    expect(inferColumnType(col('年龄', ['1', '2', '3']))).toBe('number');
  });

  it('布尔值推断为 boolean', () => {
    expect(inferColumnType(col('是否', [true, false, true]))).toBe('boolean');
  });

  it('重复取值少的文本推断为 category', () => {
    expect(inferColumnType(col('学历', ['本科', '硕士', '本科', '硕士']))).toBe('category');
  });

  it('取值几乎全不同的文本推断为 text', () => {
    const values = Array.from({ length: 20 }, (_, i) => `备注内容${i}`);
    expect(inferColumnType(col('备注', values))).toBe('text');
  });

  it('全部缺失推断为 empty', () => {
    expect(inferColumnType(col('空列', [null, null, null]))).toBe('empty');
  });

  it('数值与文本混杂推断为 mixed', () => {
    expect(inferColumnType(col('混合', [1, '未知', 3]))).toBe('mixed');
  });

  it('超长数字不推断为 number', () => {
    // 学号、身份证号若被当作数值参与统计会丢失精度
    expect(inferColumnType(col('学号', ['12345678901234567890', '12345678901234567891']))).toBe(
      'text',
    );
  });

  it('前导零数字串按标识处理，不推断为 number', () => {
    // 「001」在表格里是文本、含义是编号；当成数值会算出毫无意义的均值，
    // 还会让异常值检查把它当数量列去挑「离群值」
    expect(inferColumnType(col('学号', ['001', '002', '003']))).toBe('text');
    expect(inferColumnType(col('编号', ['-001', '-002']))).toBe('text');
  });

  it('重复的前导零标识推断为 category', () => {
    expect(inferColumnType(col('学号', ['001', '001', '002', '002']))).toBe('category');
  });

  it('普通数字与零不受前导零规则影响', () => {
    expect(inferColumnType(col('年龄', ['0', '1', '2']))).toBe('number');
    expect(inferColumnType(col('比率', ['0.5', '0.25']))).toBe('number');
  });
});

describe('profileColumn', () => {
  it('统计缺失数与缺失率', () => {
    const p = profileColumn(col('年龄', [1, null, 3, '']));
    expect(p.missingCount).toBe(2);
    expect(p.missingRate).toBe(0.5);
  });

  it('数值列给出统计量', () => {
    const p = profileColumn(col('年龄', [1, 2, 3, 4, 5]));
    expect(p.numeric?.min).toBe(1);
    expect(p.numeric?.max).toBe(5);
    expect(p.numeric?.median).toBe(3);
  });

  it('分类列给出取值分布，大小写与空白差异被归并', () => {
    const p = profileColumn(col('单位', ['mg', 'MG', ' mg ', 'g']));
    expect(p.valueDistribution).toEqual({ mg: 3, g: 1 });
  });

  it('空列不崩溃，类型为 empty 且统计量为 0', () => {
    const p = profileColumn(col('空列', []));
    expect(p.type).toBe('empty');
    expect(p.missingRate).toBe(0);
    expect(p.uniqueCount).toBe(0);
  });

  it('单行数据集不产生 NaN', () => {
    const p = profileColumn(col('年龄', [25]));
    expect(p.numeric?.stdDev).toBe(0);
  });

  it('混合类型的列仍然统计不同取值数', () => {
    // 界面的列画像会展示这个数字；返回 0 会让人以为画像算错了
    const p = profileColumn(col('年龄', [1, 2, '未知', 4]));
    expect(p.type).toBe('mixed');
    expect(p.uniqueCount).toBe(4);
  });

  it('前导零标识列不产出数值统计', () => {
    const p = profileColumn(col('学号', ['001', '002', '003']));
    expect(p.type).toBe('text');
    expect(p.numeric).toBeUndefined();
    expect(p.uniqueCount).toBe(3);
  });
});

describe('profileDataset', () => {
  it('报出重复列名', () => {
    const ds: Dataset = {
      rowCount: 2,
      columns: [col('年龄', [1, 2]), col('年龄', [3, 4])],
    };
    const profile = profileDataset(ds);
    expect(profile.columns).toHaveLength(2);
    expect(profile.duplicateColumnNames).toEqual(['年龄']);
  });

  it('空数据集返回空画像', () => {
    const profile = profileDataset({ rowCount: 0, columns: [] });
    expect(profile.rowCount).toBe(0);
    expect(profile.columns).toEqual([]);
    expect(profile.duplicateColumnNames).toEqual([]);
  });
});
