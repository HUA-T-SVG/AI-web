import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateText } from 'ai';
import { isLlmConfigured } from '@/agent/server/provider';
import { POST } from './route';

vi.mock('ai', () => ({ generateText: vi.fn(), tool: (definition: unknown) => definition }));
vi.mock('@/agent/server/provider', () => ({
  getChatModel: () => 'test-model',
  isLlmConfigured: vi.fn(() => true),
  llmConfigHint: () => '未配置大模型',
}));

const input = { text: '成绩：0 到 100 分（含边界）。', columns: ['成绩'] };
const post = (body: unknown, key = 'dictionary-route-test') => POST(new Request('http://localhost/api/data-dictionary', {
  method: 'POST', headers: { 'content-type': 'application/json', 'x-real-ip': key }, body: JSON.stringify(body),
}));

function mockToolCall(input: unknown) {
  vi.mocked(generateText).mockResolvedValue({ toolCalls: [{ toolName: 'draft_dictionary_rules', input }] } as
    unknown as Awaited<ReturnType<typeof generateText>>);
}

describe('数据字典提取 API', () => {
  beforeEach(() => {
    vi.mocked(generateText).mockReset();
    vi.mocked(isLlmConfigured).mockReturnValue(true);
  });

  it('只转发粘贴文本与表头，返回结构化候选，不缓存结果', async () => {
    const result = { candidates: [{ field: '成绩', quote: input.text, kind: 'range', min: 0, max: 100 }] };
    mockToolCall(result);
    const response = await post(input);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual(result);
    expect(vi.mocked(generateText).mock.calls[0]?.[0].prompt).toBe(JSON.stringify(input));
  });

  it('拒绝空字典、额外数据或过大的请求，不调用模型', async () => {
    expect((await post({ ...input, text: '  ' })).status).toBe(400);
    expect((await post({ ...input, rows: [[100]] })).status).toBe(400);
    expect((await post({ ...input, text: '字'.repeat(100_000) })).status).toBe(413);
    expect(generateText).not.toHaveBeenCalled();
  });

  it('模型无有效候选结构或没有配置时提供可读降级，不暴露供应商错误', async () => {
    mockToolCall({ candidates: [{ field: '成绩', kind: 'run-anything' }] });
    const bad = await post(input);
    expect(bad.status).toBe(502);
    expect((await bad.json()).error).toContain('手动');
    vi.mocked(generateText).mockRejectedValue(new Error('SENSITIVE_SERVER_MESSAGE'));
    const failed = await post(input);
    expect(failed.status).toBe(502);
    expect(await failed.text()).not.toContain('SENSITIVE_SERVER_MESSAGE');
    vi.mocked(isLlmConfigured).mockReturnValue(false);
    expect((await post(input)).status).toBe(503);
  });
});
