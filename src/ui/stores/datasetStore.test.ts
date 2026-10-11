import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ParseResult, ParseError } from '@/parser/types';

// 控制解析结果：node 环境里没有真实 Worker，而且状态机的测试不该依赖解析细节
vi.mock('@/parser/workerClient', () => ({ parseInWorker: vi.fn() }));

import { parseInWorker } from '@/parser/workerClient';
import { useDatasetStore } from './datasetStore';

const mockParse = vi.mocked(parseInWorker);

function makeFile(content: string, name = 'a.csv'): File {
  return new File([content], name, { type: 'text/csv' });
}

function okResult(): ParseResult {
  return {
    dataset: { rowCount: 2, columns: [{ name: '年龄', values: [20, 30] }] },
    meta: { fileName: 'a.csv', fileSize: 10, format: 'csv', truncated: false, warnings: [] },
  };
}

describe('datasetStore', () => {
  beforeEach(() => {
    useDatasetStore.getState().reset();
    mockParse.mockReset();
  });

  it('初始状态是 idle', () => {
    const state = useDatasetStore.getState();
    expect(state.status).toBe('idle');
    expect(state.parseResult).toBeNull();
    expect(state.profile).toBeNull();
    expect(state.issues).toEqual([]);
  });

  it('解析成功后进入 ready，并同时算出画像与问题', async () => {
    mockParse.mockResolvedValue(okResult());

    await useDatasetStore.getState().loadFile(makeFile('年龄\n20\n30'));

    const state = useDatasetStore.getState();
    expect(state.status).toBe('ready');
    expect(state.profile?.columns).toHaveLength(1);
    expect(state.parseResult?.meta.fileName).toBe('a.csv');
  });

  it('解析失败后进入 error 并保留可读提示', async () => {
    const failure: ParseError = {
      kind: 'empty-file',
      message: '这个文件是空的，没有任何内容。',
    };
    mockParse.mockResolvedValue(failure);

    await useDatasetStore.getState().loadFile(makeFile(''));

    const state = useDatasetStore.getState();
    expect(state.status).toBe('error');
    expect(state.error).toContain('空');
    expect(state.parseResult).toBeNull();
  });

  it('重新上传会清掉上一次的结果，不出现新旧混合', async () => {
    mockParse.mockResolvedValueOnce(okResult());
    await useDatasetStore.getState().loadFile(makeFile('年龄\n20\n30'));
    expect(useDatasetStore.getState().status).toBe('ready');

    mockParse.mockResolvedValueOnce({ kind: 'corrupt', message: '无法读取这个文件。' });
    await useDatasetStore.getState().loadFile(makeFile('坏数据'));

    const state = useDatasetStore.getState();
    expect(state.status).toBe('error');
    expect(state.profile).toBeNull();
    expect(state.issues).toEqual([]);
  });

  it('解析抛异常时落到 error，不把界面永远卡在解析中', async () => {
    mockParse.mockRejectedValue(new Error('意外错误'));

    await useDatasetStore.getState().loadFile(makeFile('a\n1'));

    const state = useDatasetStore.getState();
    expect(state.status).toBe('error');
    expect(state.error).toContain('意外错误');
  });

  it('reset 清空全部状态', async () => {
    mockParse.mockResolvedValue(okResult());
    await useDatasetStore.getState().loadFile(makeFile('年龄\n20\n30'));

    useDatasetStore.getState().reset();

    const state = useDatasetStore.getState();
    expect(state.status).toBe('idle');
    expect(state.parseResult).toBeNull();
  });

  it('把文件读成 ArrayBuffer 再交给解析层', async () => {
    mockParse.mockResolvedValue(okResult());

    await useDatasetStore.getState().loadFile(makeFile('年龄\n20\n30'));

    const call = mockParse.mock.calls[0]?.[0];
    expect(call?.fileName).toBe('a.csv');
    expect(new TextDecoder().decode(call?.buffer)).toBe('年龄\n20\n30');
  });
});
