// 把构建好的规则索引拷进 public/ 供浏览器 fetch。
//
// 为什么是拷贝而不是直接 import：178 条索引约 1384 KB，作为模块 import 会进客户端
// bundle、在首屏解析，而它只在 /rules 页与 query_rules 工具真正被用到时才需要。
//
// 为什么要有这个脚本而不是手工拷：手工拷的那份迟早会与 knowledge/index/ 下的
// 真源分叉 —— 而分叉之后检索到的规则与团队填的不是同一份，这种错误没人会发现。
import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FROM = join(ROOT, 'knowledge', 'index', 'rules.json');
const TO = join(ROOT, 'public', 'knowledge', 'rules.json');

if (!existsSync(FROM)) {
  console.error(
    `找不到 ${FROM}。\n` +
      '规则索引由 knowledge/tools/build-index.py 生成，先跑：\n' +
      '    node --use-system-ca knowledge/tools/build-index.py --run\n' +
      '（或只跑 `--self-recall` 生成完整产物）',
  );
  process.exit(1);
}

mkdirSync(dirname(TO), { recursive: true });
copyFileSync(FROM, TO);

const kb = Math.round(statSync(TO).size / 1024);
console.log(`规则索引已同步：knowledge/index/rules.json → public/knowledge/rules.json（${kb} KB）`);
