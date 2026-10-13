import { describe, it, expect, vi, afterEach } from 'vitest';
import { listChecks } from '@/core';
import { agentTools } from './tools';
import { TOOL_INPUT_SCHEMAS } from '../shared/toolSchemas';
import { createDataQualityAgent } from './dataQualityAgent';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('工具定义', () => {
  it('每个工具都有描述，模型据此决定何时调用', () => {
    for (const [name, definition] of Object.entries(agentTools)) {
      expect(definition.description?.length ?? 0, `${name} 缺少描述`).toBeGreaterThan(10);
    }
  });

  it('工具不带 execute —— 这是工具在浏览器执行的前提', () => {
    for (const [name, definition] of Object.entries(agentTools)) {
      // 一旦带上 execute，AI SDK 会在服务端执行它，原始数据就必须上传，
      // 「数据不出浏览器」这个核心承诺随之失效。所以这条要锁死。
      //
      // 这里用宽松类型读一次：工具是 as const 的，类型上压根没有 execute
      // 这个属性，直接访问连编译都过不了（那本身也是一种保证）。
      const asRecord = definition as unknown as Record<string, unknown>;
      expect(asRecord.execute, `工具「${name}」不该有 execute`).toBeUndefined();
    }
  });

  it('服务端工具名与浏览器执行器一一对应', () => {
    expect(Object.keys(agentTools).sort()).toEqual(Object.keys(TOOL_INPUT_SCHEMAS).sort());
  });

  it('输入契约与服务端共用同一份对象，不会各写一套', () => {
    expect(agentTools.run_checks.inputSchema).toBe(TOOL_INPUT_SCHEMAS.run_checks);
    expect(agentTools.describe_column.inputSchema).toBe(TOOL_INPUT_SCHEMAS.describe_column);
  });

  it('描述里列出全部可用检查项，且是从 core 动态取的', () => {
    const description = agentTools.run_checks.description;

    for (const check of listChecks()) {
      expect(description, `工具描述里缺少检查项「${check.id}」`).toContain(check.id);
      // 光有标识不够，模型得知道这一项在查什么才选得对
      expect(description, `检查项「${check.id}」缺少说明`).toContain(check.title);
    }
  });
});

describe('Agent 构造', () => {
  it('配置齐全时能构造出来', () => {
    vi.stubEnv('LLM_API_KEY', 'sk-测试用');
    vi.stubEnv('LLM_BASE_URL', 'https://example.com');
    vi.stubEnv('LLM_MODEL', 'test-model');

    expect(() => createDataQualityAgent()).not.toThrow();
  });

  it('未配置密钥时构造即抛错，并说明缺哪一项', () => {
    // 惰性构造（而不是模块级常量）正是为了这条：模块级构造会让
    // 任何 import 它的文件在导入阶段就炸，接口层连「返回 503 加指引」
    // 的机会都没有 —— 用户看到的会是一整页 500
    vi.stubEnv('LLM_API_KEY', '');
    vi.stubEnv('LLM_BASE_URL', '');
    vi.stubEnv('LLM_MODEL', '');

    expect(() => createDataQualityAgent()).toThrow(/LLM_API_KEY/);
  });

  it('导入这个模块本身不会触发构造', async () => {
    vi.stubEnv('LLM_API_KEY', '');
    vi.stubEnv('LLM_BASE_URL', '');
    vi.stubEnv('LLM_MODEL', '');

    await expect(import('./dataQualityAgent')).resolves.toBeDefined();
  });
});
