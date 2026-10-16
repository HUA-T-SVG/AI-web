// 把评测结论拷进 public/eval/ 供浏览器 fetch。
//
// 为什么是拷贝而不是直接 import：这些 JSON 只在 /export 的看板被打开时才需要，
// 作为模块 import 会进客户端 bundle 并在首屏解析。
//
// 为什么要有这个脚本而不是手工拷：与 sync-rules.mjs 同一个理由 —— 手工拷的那份
// 迟早会与 knowledge/reports/ 下的真源分叉，而**分叉的指标比没有指标更糟**：
// 看板上会挂着一份过期的数字，看起来仍然可信。
//
// **它只拷不解析**。指标的真源是评测脚本产出的 JSON（`scripts/evalEmit.ts`）；
// 让本脚本去解析那几份 Markdown 报告，会让看板依赖文档的排版 ——
// 有人调一下表格列宽，指标就静默消失或串行。
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FROM_DIR = join(ROOT, 'knowledge', 'reports');
const TO_DIR = join(ROOT, 'public', 'eval');

if (!existsSync(FROM_DIR)) {
  console.error(`找不到 ${FROM_DIR}。评测结论由各层评测脚本产出，先跑一层，例如：\n` +
    '    pnpm vitest run src/core/evaluate/l1Eval.test.ts');
  process.exit(1);
}

const files = readdirSync(FROM_DIR).filter((name) => /^eval-.+\.json$/.test(name));
if (files.length === 0) {
  console.error(
    `在 ${FROM_DIR} 里没有找到 eval-*.json。\n` +
      '它们由评测脚本写出（L1/L3/L5 跑 vitest 即可，L4 要先起 dev server 再跑 pnpm eval:agent）。',
  );
  process.exit(1);
}

mkdirSync(TO_DIR, { recursive: true });
const synced = [];
for (const name of files) {
  copyFileSync(join(FROM_DIR, name), join(TO_DIR, name));
  synced.push(`${name}（${Math.round(statSync(join(TO_DIR, name)).size / 1024)} KB）`);
}

/**
 * 清单文件：告诉看板**哪些评测已经跑过**。
 *
 * 看板靠它决定请求哪几个文件。没有它的话，看板得像原来那样挨个试 —— 而
 * 「试一个不存在的文件」会在浏览器控制台留一条 404，那条日志被各 spec 的
 * 「无控制台错误」断言当成真问题（实测踩到：控制台两条 404）。
 *
 * 这也不是为了骗过断言：**404 是真实的资源错误**，而我们完全有条件在构建期
 * 就把「有哪些产物」写下来 —— 让浏览器在正常路径上不产生错误，比给断言开例外好。
 */
const manifest = {
  generatedAt: new Date().toISOString(),
  sections: files.filter((name) => name !== 'eval-agent.raw.json').map((name) => name.replace(/^eval-|\.json$/g, '')),
};
writeFileSync(join(TO_DIR, 'index.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
synced.push('index.json（清单）');

// 一并拷原始轨迹：它让「这个数字是怎么来的」可复查，而不是只给结论
const rawPath = join(FROM_DIR, 'eval-agent.raw.json');
if (existsSync(rawPath)) {
  copyFileSync(rawPath, join(TO_DIR, 'eval-agent.raw.json'));
  synced.push('eval-agent.raw.json（原始轨迹）');
}

console.log(`评测结论已同步到 public/eval/：\n  ${synced.join('\n  ')}`);
