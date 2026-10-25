import { beforeEach, describe, expect, it } from 'vitest';
import type { RangeRule } from '@/core';
import {
  activeRangeRules,
  parseRangeRules,
  serializeRangeRules,
  useRangeRuleStore,
  userRangeRuleId,
} from './rangeRuleStore';

function rule(column: string, min: number, max: number): RangeRule {
  return { id: userRangeRuleId(column), column, min, max, rationale: '测试用' };
}

beforeEach(() => {
  useRangeRuleStore.getState().reset();
});

/**
 * 值域规则是「用户配置」，它的生命周期必须跟着文件走。
 *
 * 最危险的一种错是：换了一份数据、规则还在，于是新数据的同一列被上一份的
 * 领域口径检查 —— 用户会看到一条没有依据的「越界」问题，而覆盖地图还会
 * 声称这一列「已配置」。所以这里专门钉住「换文件清空、同名保留」。
 */
describe('用户值域规则的归属', () => {
  it('首次载入记录文件名；同一文件重跑不会清掉已填的规则', () => {
    const store = useRangeRuleStore.getState();
    store.beginFile('a.csv');
    store.upsert(rule('年龄', 0, 120));
    expect(activeRangeRules()).toHaveLength(1);

    // 重试 / 重跑会再次走到 beginFile，同一个文件不应丢配置
    useRangeRuleStore.getState().beginFile('a.csv');
    expect(activeRangeRules()).toHaveLength(1);
  });

  it('换一份文件就清空：领域口径不能跨文件复用', () => {
    const store = useRangeRuleStore.getState();
    store.beginFile('a.csv');
    store.upsert(rule('年龄', 0, 120));

    useRangeRuleStore.getState().beginFile('b.csv');
    expect(activeRangeRules()).toEqual([]);
    expect(useRangeRuleStore.getState().fileName).toBe('b.csv');
  });

  it('同名列 upsert 覆盖旧规则，remove 只删指定列', () => {
    const store = useRangeRuleStore.getState();
    store.beginFile('a.csv');
    store.upsert(rule('年龄', 0, 120));
    store.upsert(rule('年龄', 18, 65));
    store.upsert(rule('分数', 0, 100));

    expect(activeRangeRules().find((item) => item.column === '年龄')?.min).toBe(18);
    useRangeRuleStore.getState().remove('年龄');
    expect(activeRangeRules().map((item) => item.column)).toEqual(['分数']);
  });

  it('规则 id 带固定前缀，便于区分用户填写与将来导入的规则', () => {
    expect(userRangeRuleId('年龄')).toBe('user-range:年龄');
  });
});

/**
 * 规则要能在刷新后恢复（sessionStorage），所以序列化/反序列化必须稳。
 *
 * 坏数据不能让页面白屏：storage 是外部输入，形状校验失败就当作没有配置，
 * 让用户重新填一次，而不是在渲染阶段抛异常。
 */
describe('规则的持久化格式', () => {
  it('序列化再反序列化能还原文件名与规则', () => {
    const raw = serializeRangeRules('survey.csv', { 年龄: rule('年龄', 0, 120) });
    const restored = parseRangeRules(raw);

    expect(restored?.fileName).toBe('survey.csv');
    expect(restored?.rules['年龄']).toEqual(rule('年龄', 0, 120));
  });

  it('空值、坏 JSON、形状不对的数据都当作没有配置', () => {
    expect(parseRangeRules(null)).toBeNull();
    expect(parseRangeRules('')).toBeNull();
    expect(parseRangeRules('{')).toBeNull();
    expect(parseRangeRules('[]')).toBeNull();
    expect(parseRangeRules('{"fileName":"a.csv","rules":[]}')).toBeNull();
    // 列名与键不一致的条目跳过，不把规则挂到错误的列上
    const restored = parseRangeRules(
      '{"fileName":"a.csv","rules":{"年龄":{"id":"x","column":"分数","min":0,"max":100}}}',
    );
    expect(restored?.fileName).toBe('a.csv');
    expect(restored?.rules).toEqual({});
  });
});
