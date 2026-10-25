import { describe, expect, it } from 'vitest';
import { extractSourceMeta } from './ruleSource';

/**
 * 「来源链接 / 核验日期」现在真的能从来源列里读出来。
 *
 * 这两项此前在界面上一律是「未提供」—— 知识库 11 列里没有独立字段。
 * 多学科扩展版把 URL 与核对日期写进了来源正文，所以这里是解析而不是默认值：
 * 解析不到就必须回到「未提供」，不能为了页面好看编一个。
 */
describe('来源元信息解析', () => {
  const pandas =
    'pandas 官方文档：read_csv（读取参数）\n' +
    'https://pandas.pydata.org/docs/reference/api/pandas.read_csv.html\n' +
    '核对日期：2026-10-25';

  it('从三段式来源里同时取出 URL 与核对日期', () => {
    expect(extractSourceMeta(pandas)).toEqual({
      url: 'https://pandas.pydata.org/docs/reference/api/pandas.read_csv.html',
      verifiedAt: '2026-10-25',
    });
  });

  it('去掉紧跟在 URL 后面的中文右括号 —— 否则链接会 404', () => {
    const source = 'Microsoft：Date systems（https://support.microsoft.com/excel/date-systems）';
    expect(extractSourceMeta(source).url).toBe('https://support.microsoft.com/excel/date-systems');
  });

  it('http 与 https 都认', () => {
    expect(extractSourceMeta('见 http://example.org/rule/1').url).toBe('http://example.org/rule/1');
  });

  it('没有链接就没有链接，不猜', () => {
    expect(extractSourceMeta('国内社会科学调查数据的常见约定')).toEqual({
      url: null,
      verifiedAt: null,
    });
    expect(extractSourceMeta(undefined).url).toBeNull();
    expect(extractSourceMeta('').verifiedAt).toBeNull();
  });

  it('核对日期用半角冒号也认；另两种日期行写法（资料查阅日期 / 复核日期）同样识别', () => {
    expect(extractSourceMeta('某标准\nhttps://example.org/a\n核对日期: 2025-01-02').verifiedAt).toBe(
      '2025-01-02',
    );
    // 178 条扩展版实际混着三种写法；只认「核对日期」会让 65 条已写日期的条目
    // 在界面上显示「未提供」——那是把有数据说成没数据。
    expect(
      extractSourceMeta('某文档\nhttps://example.org/b\n资料查阅日期：2026-10-25').verifiedAt,
    ).toBe('2026-10-25');
    expect(extractSourceMeta('某论文\nhttps://example.org/c\n复核日期：2026-10-24').verifiedAt).toBe(
      '2026-10-24',
    );
  });
});
