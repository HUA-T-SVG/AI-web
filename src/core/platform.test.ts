import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 平台无关约束：这些目录里的代码必须同时能跑在浏览器与 Node 里。
 *
 * `core` 要跑在浏览器 Web Worker 与将来的 MCP Server（Node）里；`scriptgen`
 * 同理 —— 它生成的是要在用户本机执行的 pandas 脚本，自己不能依赖任何运行时。
 * 一旦有人 import 了 fs 或用了 window，构建时未必报错，但换到另一个运行环境
 * 就会在运行时才炸 —— 那时已经很难定位是哪一行引入的。
 *
 * 这条约束本来指望 lint 来守，但 Next 16 移除了 next lint，脚本还挂着却跑不了
 * （交接说明里记的欠账）。改用测试来守：测试是每次提交的必过门禁，
 * 比 lint 更可靠，也不必等上游把 next lint 装回来。
 *
 * **文件留在 `src/core/` 下是历史原因**（约束最初只针对 core）。它守的是一条
 * 跨目录的架构约定，所以新增平台无关目录时改这里，别另开一份 —— 两份清单
 * 迟早会漂移，而漂移之后总有一边在裸奔。
 */
const PLATFORM_FREE_ROOTS = ['src/core', 'src/scriptgen'];

/** 每个目录至少要扫到这么多文件，否则认为路径写错了。 */
const MIN_FILES: Record<string, number> = { 'src/core': 10, 'src/scriptgen': 3 };

const FORBIDDEN: { pattern: RegExp; why: string }[] = [
  { pattern: /from\s+['"]node:/, why: 'Node 内置模块' },
  { pattern: /from\s+['"]fs['"]/, why: 'Node 文件系统' },
  { pattern: /from\s+['"]path['"]/, why: 'Node 路径模块' },
  { pattern: /\bwindow\./, why: '浏览器全局 window' },
  { pattern: /\bdocument\./, why: '浏览器全局 document' },
  { pattern: /\blocalStorage\b/, why: '浏览器存储' },
  { pattern: /\bfetch\(/, why: '网络请求' },
  { pattern: /\bBlob\b/, why: '浏览器 Blob' },
  { pattern: /\bURL\.createObjectURL\b/, why: '浏览器对象 URL' },
  // 反向依赖：平台无关层不得引 UI 层。UI 引 core 是对的，反过来会让
  // 「core 能被 MCP Server 复用」这条架构决策失效。
  //
  // 已知没守住的另一半（见交接说明的欠账）：`core/cleaning/` 从
  // `@/agent/shared/schemas` 取 `CleaningAction` 类型，而那是**类型**依赖、
  // 挪契约要动 4 个文件。add 这条 pattern 之前先看那条欠账的处置计划。
  { pattern: /from\s+['"]@\/ui\//, why: 'UI 层（反向依赖）' },
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

describe('平台无关约束', () => {
  it('每个目录都至少扫到了文件，避免路径写错导致这条测试空跑', () => {
    // 一条永不失败的架构测试比没有更糟：它会让人以为约束被守住了。
    // 这里对每个目录分别断言，就是为了让「新加了一个目录但路径写错」
    // 立刻失败，而不是静默地什么都不检查
    for (const root of PLATFORM_FREE_ROOTS) {
      expect(collectSourceFiles(root).length, `${root} 扫到的文件太少，路径可能写错了`).toBeGreaterThan(
        MIN_FILES[root] ?? 1,
      );
    }
  });

  it('不引用任何浏览器或 Node 专有 API', () => {
    for (const root of PLATFORM_FREE_ROOTS) {
      for (const file of collectSourceFiles(root)) {
        const source = readFileSync(file, 'utf8');

        for (const { pattern, why } of FORBIDDEN) {
          expect(source, `${file} 引用了${why}（${pattern}）`).not.toMatch(pattern);
        }
      }
    }
  });
});
