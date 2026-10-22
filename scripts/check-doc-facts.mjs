#!/usr/bin/env node
/**
 * 技术文档的**事实校验**：文档里的关键数字必须能在仓库产物里找到出处。
 *
 * ## 为什么需要它
 *
 * 技术文档最容易出的问题不是写错字，是**数字漂移**：某天重跑了评测、或改了检查口径，
 * 报告里的数变了，而文档里仍留着旧数字。评委只要拿文档和仓库对一下就会发现 ——
 * 而这种不一致，比少写一节更伤可信度。
 *
 * 所以每一处关键数字都登记成「文档里必须出现什么」+「它必须能在哪个文件里找到」。
 * 文档改了没同步报告、或报告重跑后忘了改文档，这个脚本都会红。
 *
 * **它查不出的**：同一个数字在文档里出现多份、其中一份被改坏 —— 脚本只查「存在且出处
 * 对得上」，不做全文数值一致性比对。这类得靠通读与评审。本脚本是「防漂移」不是「防笔误」。
 *
 * ## 用法
 *
 *     node scripts/check-doc-facts.mjs
 *
 * 退出码非 0 表示有数字对不上。**改文档或重跑评测之后都要跑它。**
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const DOC = process.env.DOC_PATH ?? 'docs/技术文档.md';

/**
 * 每条断言：`doc` 是文档里必须出现的写法，`sources` 是这些数字的出处，
 * `raw` 是出处文件里必须能找到的原始写法（多个 = 都要找到）。
 */
const FACTS = [
  {
    label: 'L1 检查引擎：精确率 93.3% / 召回率 100%（14/14）',
    doc: ['93.3%', '100.0%', '14/14'],
    sources: ['knowledge/reports/eval-l1.md'],
    raw: ['93.3%', '100.0%', '14/14'],
  },
  {
    label: 'L3 检索：Hit@1 94.7% / Hit@5 100% / MRR 0.9737（分母 19）',
    doc: ['94.7%', '0.9737'],
    sources: ['knowledge/reports/eval-retrieval.md'],
    raw: ['94.7%', '0.9737'],
  },
  {
    label: 'L5 系统：剖析 965 ms / 确定性检查 3453 ms（预算 3000 / 30000）',
    doc: ['965', '3453'],
    sources: ['knowledge/reports/eval-system.md'],
    raw: ['965', '3453'],
  },
  {
    label: 'Worker 化：主线程阻塞 4095 → 184 ms（两次克隆，各 92 ms）',
    doc: ['4095', '184', '92 ms'],
    sources: ['knowledge/reports/eval-system.md'],
    raw: ['4095', '184', '92 ms'],
  },
  {
    label: '出站规模：摘要 8099 字符 / 约 2674 输入 token',
    doc: ['8099', '2674'],
    sources: ['knowledge/reports/eval-system.md'],
    raw: ['8099', '2674'],
  },
  {
    label: '字面级阈值：0.95（自动档）/ 0.84（待确认档）',
    doc: ['0.95', '0.84'],
    sources: ['docs/开发交接说明.md'],
    raw: ['0.95', '0.84'],
  },
  {
    label: 'L4 Agent 评测：工具成功率 101/102、截断 3/12',
    doc: ['101/102', '3/12'],
    sources: ['knowledge/reports/eval-agent.md'],
    raw: ['101/102', '3/12'],
  },
  {
    label: '测试规模：666 单测 / 59 文件 / 64 E2E',
    doc: ['666', '59', '64'],
    sources: ['docs/开发交接说明.md'],
    raw: ['666', '59', '64'],
  },
  {
    label: 'L1 自定达标线：Precision ≥ 0.50、Recall ≥ 0.90（0.95 属 L2）',
    doc: ['Precision ≥ 0.50', 'Recall ≥ 0.90'],
    sources: ['src/core/evaluate/l1Eval.test.ts'],
    raw: ['precision >= 0.5', 'recall >= 0.9'],
  },
  // 原先这里有一条「提交数：132」。删掉的原因不是它难查，而是**写死提交数必然过期**：
  // 每提交一次文档就与仓库对不上一次，而这个脚本只能证明「稿子里那个数当时是对的」。
  // 文档现在只写「保留完整提交历史（未 squash）」—— 这是可以长期成立的表述。
  {
    label: 'L4 真实 token：输入 684554 / 输出 27247（12 次对话合计）',
    doc: ['684,554', '27,247'],
    sources: ['knowledge/reports/eval-agent.md'],
    raw: ['684,554', '27,247'],
  },
  {
    label: '部署地址与平台',
    doc: ['https://www.ai-web.me'],
    sources: ['docs/开发交接说明.md'],
    raw: ['https://www.ai-web.me'],
  },
  {
    label: '知识库规模：113 条 = 通用 92 + 学科 21',
    doc: ['113', '92', '21'],
    sources: ['docs/开发交接说明.md'],
    raw: ['113', '92', '21'],
  },
];

/** 赛项要求的 9 章（标题必须一一出现） */
const CHAPTERS = [
  '项目概述',
  '需求分析',
  '系统架构设计',
  '核心功能实现',
  'AI 技术方案',
  '创新点说明',
  '测试与部署',
  '总结与展望',
  '附录',
];

/** 文档里引用的界面截图必须都存在 */
const IMAGE_DIR = 'docs';

function readFile(path) {
  const full = resolve(path);
  if (!existsSync(full)) return null;
  return readFileSync(full, 'utf8');
}

function main() {
  const doc = readFile(DOC);
  if (doc === null) {
    console.error(`找不到文档：${DOC}`);
    return 1;
  }

  const failures = [];
  const rows = [];

  // ① 结构：9 章是否齐全
  for (const [index, chapter] of CHAPTERS.entries()) {
    const pattern = new RegExp(`^# ${index + 1}\\s+${chapter}`, 'm');
    const ok = pattern.test(doc);
    rows.push({ check: `第 ${index + 1} 章「${chapter}」`, ok });
    if (!ok) failures.push(`缺少章节标记：第 ${index + 1} 章「${chapter}」`);
  }

  // ② 数字：文档里出现 + 出处文件里也能找到
  for (const fact of FACTS) {
    const docMissing = fact.doc.filter((needle) => !doc.includes(needle));
    if (docMissing.length > 0) {
      rows.push({ check: fact.label, ok: false, note: `文档缺：${docMissing.join('、')}` });
      failures.push(`文档缺「${fact.label}」的写法：${docMissing.join('、')}`);
      continue;
    }

    const sourceMissing = [];
    for (const source of fact.sources) {
      const content = readFile(source);
      if (content === null) {
        sourceMissing.push(`${source}（文件不存在）`);
        continue;
      }
      for (const needle of fact.raw) {
        if (!content.includes(needle)) sourceMissing.push(`${source} 缺「${needle}」`);
      }
    }
    if (sourceMissing.length > 0) {
      rows.push({ check: fact.label, ok: false, note: sourceMissing.join('；') });
      failures.push(`出处对不上「${fact.label}」：${sourceMissing.join('；')}`);
      continue;
    }
    rows.push({ check: fact.label, ok: true });
  }

  // ③ 图片：markdown 里引用的每张图都必须存在
  const images = [...doc.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map((match) => match[1]);
  rows.push({ check: `界面截图 ${images.length} 张`, ok: images.length > 0 });
  if (images.length === 0) failures.push('一张界面截图都没有');
  for (const relative of images) {
    const exists = existsSync(resolve(IMAGE_DIR, relative));
    rows.push({ check: `图片 ${relative}`, ok: exists });
    if (!exists) failures.push(`图片缺失：${IMAGE_DIR}/${relative}`);
  }

  // 输出
  const width = Math.max(...rows.map((row) => row.check.length));
  for (const row of rows) {
    const mark = row.ok ? '✅' : '❌';
    const note = row.note === undefined ? '' : `  ← ${row.note}`;
    console.log(`${mark}  ${row.check.padEnd(width)}${note}`);
  }

  console.log('');
  if (failures.length > 0) {
    console.log(`❌ ${failures.length} 处对不上：`);
    for (const failure of failures) console.log(`   · ${failure}`);
    return 1;
  }
  console.log(`✅ ${rows.length} 项全部通过：章节结构完整，关键数字都能在仓库产物里找到出处。`);
  return 0;
}

process.exit(main());
