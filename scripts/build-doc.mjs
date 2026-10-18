#!/usr/bin/env node
/**
 * 一条命令重建技术文档：Markdown → Word → PDF，并校验页数不超上限。
 *
 * ## 为什么要这个脚本
 *
 * 技术文档的真源是 `docs/技术文档.md`；Word 与 PDF 都是**产物**。如果每次改完都靠
 * 人工在 Word 里操作，两份内容迟早分叉 —— 而分叉后没人知道哪份是最终稿。
 * 所以把「生成 + 校验」收进一条命令：**改 md，跑它，交付产物**。
 *
 * ## 用法
 *
 *     pnpm doc:build              # 生成 Word + PDF，并检查页数
 *     pnpm doc:build --no-pdf     # 只生成 Word（没装 LibreOffice 时）
 *
 * ## 依赖（按顺序自动探测）
 *
 * 1. **Python + python-docx**：`PYTHON` 环境变量 → `python` → `py -3`
 * 2. **转 PDF**：`LO_KIT_CLI`（LibreOffice Kit 的 cli.js，配 `LO_KIT_NODE` 指定 node）
 *    → 系统 `soffice`（`--headless --convert-to pdf`）
 *    两者都没有时**只生成 Word 并提示**，不算失败 —— 团队可以在 Word 里手动导出 PDF
 *
 * ## 页数上限
 *
 * 赛项要求 ≤ 30 页。PDF 生成后按页对象计数（`/Type /Page`），超过上限直接退出码 1，
 * 这样「页数超了」不会等到提交前才发现。
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const MD = 'docs/技术文档.md';
const DOCX = 'docs/技术文档.docx';
const PDF = 'docs/技术文档.pdf';
const PAGE_LIMIT = 30;

const args = process.argv.slice(2);
const wantPdf = !args.includes('--no-pdf');

function run(command, commandArgs, label) {
  const result = spawnSync(command, commandArgs, { stdio: 'inherit' });
  if (result.status !== 0) {
    console.error(`\n❌ ${label}失败（退出码 ${result.status}）`);
    return false;
  }
  return true;
}

/** 找一个能用的 Python（带 python-docx 的） */
function findPython() {
  const candidates = [];
  if (process.env.PYTHON) candidates.push([process.env.PYTHON, []]);
  candidates.push(['python', []]);
  candidates.push(['py', ['-3']]);

  for (const [command, prefix] of candidates) {
    const probe = spawnSync(command, [...prefix, '-c', 'import docx'], { stdio: 'ignore' });
    if (probe.status === 0) return { command, prefix };
  }
  return null;
}

/** 统计 PDF 页数：数 `/Type /Page`（不含 `/Pages`） */
function countPdfPages(path) {
  const buffer = readFileSync(path);
  const text = buffer.toString('latin1');
  const matches = text.match(/\/Type\s*\/Page[^s]/g);
  return matches === null ? 0 : matches.length;
}

function main() {
  if (!existsSync(MD)) {
    console.error(`❌ 找不到 ${MD}`);
    return 1;
  }

  // ① Markdown → Word
  const python = findPython();
  if (python === null) {
    console.error('❌ 找不到带 python-docx 的 Python。安装：pip install python-docx，或用 PYTHON 环境变量指定解释器。');
    return 1;
  }
  console.log(`[1/3] 生成 Word（${python.command}）`);
  if (!run(python.command, [...python.prefix, 'scripts/md-to-docx.py', MD, DOCX], '生成 Word')) return 1;
  console.log(`      产物：${DOCX}（${Math.round(statSync(DOCX).size / 1024)} KB）`);

  // ② Word → PDF
  if (!wantPdf) {
    console.log('[2/3] 跳过 PDF（--no-pdf）');
    return 0;
  }
  console.log('[2/3] 生成 PDF');
  const kitCli = process.env.LO_KIT_CLI;
  const kitNode = process.env.LO_KIT_NODE ?? process.execPath;

  if (kitCli !== undefined && existsSync(kitCli)) {
    if (!run(kitNode, [kitCli, 'convert', '--input', DOCX, '--output', PDF], '转换 PDF（LibreOffice Kit）')) return 1;
  } else {
    const soffice = spawnSync('soffice', ['--version'], { stdio: 'ignore' });
    if (soffice.status !== 0) {
      console.warn('⚠️ 没找到 LibreOffice（LO_KIT_CLI 或 soffice 都没有）：只生成了 Word，PDF 请在 Word 里手动导出。');
      return 0;
    }
    const outDir = resolve('docs');
    if (!run('soffice', ['--headless', '--convert-to', 'pdf', '--outdir', outDir, DOCX], '转换 PDF（soffice）')) return 1;
  }

  if (!existsSync(PDF)) {
    console.error('❌ 转换命令成功但没有生成 PDF');
    return 1;
  }

  // ③ 页数校验
  const pages = countPdfPages(PDF);
  console.log(`[3/3] 页数：${pages}（上限 ${PAGE_LIMIT}）`);
  if (pages === 0) {
    console.warn('⚠️ 数不出页数（PDF 结构可能压缩了页对象），请自己打开确认。');
    return 0;
  }
  if (pages > PAGE_LIMIT) {
    console.error(`❌ 超过赛项页数上限 ${PAGE_LIMIT} 页。删减后重跑，别等到提交前才发现。`);
    return 1;
  }
  console.log(`✅ 完成：${DOCX} · ${PDF}（${pages} 页，余量 ${PAGE_LIMIT - pages} 页）`);
  return 0;
}

process.exit(main());
