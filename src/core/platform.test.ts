import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * core 必须保持平台无关。
 *
 * 它同时运行在浏览器 Web Worker 与将来的 MCP Server（Node）里。一旦有人在
 * core 里 import 了 fs 或用了 window，构建时未必报错，但换到另一个运行环境
 * 就会在运行时才炸 —— 那时已经很难定位是哪一行引入的。
 *
 * 这条约束本来指望 lint 来守，但 Next 16 移除了 next lint，脚本还挂着却跑不了
 * （交接说明里记的欠账）。改用测试来守：测试是每次提交的必过门禁，
 * 比 lint 更可靠，也不必等上游把 next lint 装回来。
 */
const FORBIDDEN: { pattern: RegExp; why: string }[] = [
  { pattern: /from\s+['"]node:/, why: 'Node 内置模块' },
  { pattern: /from\s+['"]fs['"]/, why: 'Node 文件系统' },
  { pattern: /from\s+['"]path['"]/, why: 'Node 路径模块' },
  { pattern: /\bwindow\./, why: '浏览器全局 window' },
  { pattern: /\bdocument\./, why: '浏览器全局 document' },
  { pattern: /\blocalStorage\b/, why: '浏览器存储' },
  { pattern: /\bfetch\(/, why: '网络请求' },
];

function collectSourceFiles(dir: string): string[] {
  const found: string[] = [];

  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...collectSourceFiles(full));
    } else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) {
      found.push(full);
    }
  }

  return found;
}

describe('core 的平台无关约束', () => {
  it('至少扫到了文件，避免路径写错导致这条测试空跑', () => {
    // 一条永不失败的架构测试比没有更糟：它会让人以为约束被守住了
    expect(collectSourceFiles('src/core').length).toBeGreaterThan(10);
  });

  it('不引用任何浏览器或 Node 专有 API', () => {
    for (const file of collectSourceFiles('src/core')) {
      const source = readFileSync(file, 'utf8');

      for (const { pattern, why } of FORBIDDEN) {
        expect(source, `${file} 引用了${why}（${pattern}）`).not.toMatch(pattern);
      }
    }
  });
});
