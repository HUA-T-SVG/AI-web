import { beforeEach, describe, expect, it } from 'vitest';
import {
  activeScenario,
  parseScenario,
  serializeScenario,
  useScenarioStore,
} from './scenarioStore';

beforeEach(() => {
  useScenarioStore.getState().reset();
});

/**
 * 场景选择的生命周期必须跟着文件走。
 *
 * 最危险的错是「上一份数据的场景套到新数据上」：用户换了文件，检查页却还在
 * 按上一份的「本次重点」筛选，看起来像新数据出了问题，实际是旧口径在说话。
 * 所以这里钉住「同名保留、换文件清空、刷新能恢复」。
 */
describe('场景选择的生命周期跟着文件走', () => {
  it('同名文件保留、换文件清空', () => {
    const store = useScenarioStore.getState();
    // 用户先点场景、再上传自己的数据是很常见的顺序，首次绑定要保留这个预选
    store.beginFile(null);
    store.select('experiment');

    useScenarioStore.getState().beginFile('a.csv');
    expect(useScenarioStore.getState().scenarioId).toBe('experiment');

    // 重试 / 重跑会再次走到 beginFile，同一个文件不应丢掉场景
    useScenarioStore.getState().beginFile('a.csv');
    expect(useScenarioStore.getState().scenarioId).toBe('experiment');

    useScenarioStore.getState().beginFile('b.csv');
    expect(useScenarioStore.getState().scenarioId).toBeNull();
  });

  it('clear 只清场景，reset 两者都清；activeScenario 可读', () => {
    useScenarioStore.getState().beginFile('a.csv');
    useScenarioStore.getState().select('survey');
    useScenarioStore.getState().clear();

    expect(useScenarioStore.getState().fileName).toBe('a.csv');
    expect(activeScenario()).toBeNull();

    useScenarioStore.getState().select('education');
    expect(activeScenario()?.title).toBe('教育数据');

    useScenarioStore.getState().reset();
    expect(useScenarioStore.getState().fileName).toBeNull();
    expect(useScenarioStore.getState().scenarioId).toBeNull();
  });

  it('持久化往返；坏 JSON / 未知 id / 类型不对一律当没有', () => {
    expect(parseScenario(serializeScenario('示例-实验数据.csv', 'experiment'))).toEqual({
      fileName: '示例-实验数据.csv',
      scenarioId: 'experiment',
    });

    for (const raw of [
      null,
      '',
      '{',
      '[]',
      '{"fileName":"a.csv","scenarioId":"chemistry"}',
      '{"fileName":42,"scenarioId":"survey"}',
    ]) {
      expect(parseScenario(raw)).toBeNull();
    }
  });
});
