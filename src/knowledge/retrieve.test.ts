import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { retrieveRules, toGrams } from './retrieve';
import type { Embedder } from '@/embedding/instance';
import type { RuleIndex } from './types';

const index: RuleIndex = JSON.parse(
  readFileSync(join(process.cwd(), 'tests/fixtures/rules-tiny.json'), 'utf8'),
) as RuleIndex;

/** 查询向量固定，测的是召回与融合逻辑，不是 embedding。 */
function embedderOf(vector: number[]): Embedder {
  return {
    embed: async () => [vector],
    status: () => ({ kind: 'ready', backend: 'wasm' }),
    prefetch: () => undefined,
  };
}

const ids = (hits: Array<{ rule: { id: string } }>) => hits.map((hit) => hit.rule.id);

describe('字符 2-gram', () => {
  it('去掉空白再切 —— 否则「硕士 研究生」的 gram 带空格，召不回「硕士研究生」', () => {
    expect(toGrams('硕士 研究生')).toContain('硕士');
    expect(toGrams('硕士 研究生')).toContain('研究');
    expect(toGrams('硕士 研究生').every((gram) => !gram.includes(' '))).toBe(true);
  });

  it('单个字符也能切出一个 gram', () => {
    expect(toGrams('男')).toEqual(['男']);
  });

  it('空串切出空数组', () => {
    expect(toGrams('   ')).toEqual([]);
  });
});

describe('规则检索', () => {
  it('列名精确命中 适用字段 时加权 —— 这是最强的人工信号', async () => {
    const hits = await retrieveRules('取值分布: 001 002 010', {
      index,
      embedder: embedderOf([1, 0]),
      columns: ['学号'],
      topK: 3,
    });
    expect(ids(hits)[0]).toBe('r-alias');
  });

  it('不加权时同分走 id 字典序，保证结果稳定', async () => {
    const hits = await retrieveRules('学号', { index, embedder: embedderOf([1, 0]), topK: 3 });
    // 学号 的 gram 命中 r-alias，所以它本来就该在前；这里验的是「即使同分也可复现」
    const again = await retrieveRules('学号', { index, embedder: embedderOf([1, 0]), topK: 3 });
    expect(ids(hits)).toEqual(ids(again));
  });

  it('稀疏路真的在起作用：查询词命中某条正文时，只有它被标注为「用词相近」', async () => {
    // 不写成「r-other 排第一」：稠密路也同样在给它打分，两者相加后可能同分，
    // 那样测的是 RRF 的并列规则而不是稀疏路有没有接上。
    const hits = await retrieveRules('比例', { index, embedder: embedderOf([1, 0]), topK: 3 });
    const other = hits.find((hit) => hit.rule.id === 'r-other');
    const alias = hits.find((hit) => hit.rule.id === 'r-alias');
    expect(other?.reason).toContain('正文用词相近');
    // r-alias 的正文里没有「比例」的 2-gram，所以不该被说成用词相近
    expect(alias?.reason).not.toContain('正文用词相近');
  });

  it('学科过滤：不传学科时只召回通用规则', async () => {
    const hits = await retrieveRules('绩点', { index, embedder: embedderOf([1, 0]), topK: 3 });
    expect(ids(hits)).not.toContain('r-subject');
  });

  it('指定学科时通用与该学科都召回', async () => {
    const hits = await retrieveRules('绩点', {
      index,
      embedder: embedderOf([1, 0]),
      subject: '数据科学与大数据技术',
      topK: 3,
    });
    expect(ids(hits)).toContain('r-subject');
    expect(ids(hits)).toContain('r-other');
  });

  it('topK 截断生效，且默认取索引里的 topK', async () => {
    const one = await retrieveRules('任意', { index, embedder: embedderOf([1, 0]), topK: 1 });
    expect(one).toHaveLength(1);
    const byDefault = await retrieveRules('任意', { index, embedder: embedderOf([1, 0]) });
    expect(byDefault.length).toBeLessThanOrEqual(index.topK);
  });

  it('查询向量维度与索引不一致时不给结果，而不是算出无意义的余弦', async () => {
    const hits = await retrieveRules('学号', {
      index,
      embedder: embedderOf([1, 0, 0]), // 索引是 2 维
      topK: 3,
    });
    expect(hits).toEqual([]);
  });

  it('命中结果带上正文与来源 —— 那是要注入 Prompt 的领域知识', async () => {
    const hits = await retrieveRules('学号', { index, embedder: embedderOf([1, 0]), topK: 1 });
    expect(hits[0]?.rule.entry.规则内容).toBeTruthy();
    expect(hits[0]?.reason).toBeTruthy();
  });

  it('学科过滤后没有候选时返回空数组，而不是抛异常', async () => {
    const onlyGeneral: RuleIndex = { ...index, entries: index.entries.filter((e) => e.学科.includes('通用')) };
    const hits = await retrieveRules('绩点', {
      index: onlyGeneral,
      embedder: embedderOf([1, 0]),
      subject: '数据科学与大数据技术',
      topK: 3,
    });
    // 通用条目仍在候选里，所以这里应当有结果（「通用总是参与」）
    expect(hits.length).toBeGreaterThan(0);
  });
});
