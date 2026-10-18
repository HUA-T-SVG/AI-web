#!/usr/bin/env node
/**
 * 把端侧 embedding 模型下载到 `public/models/`，让运行时走**站点同源**。
 *
 * ## 为什么需要这一步（实测证据，别再改回纯远端）
 *
 * 原先浏览器直接从 HuggingFace / hf-mirror 拉 23.4 MB 模型。上线后实测两个都不行：
 *   - `huggingface.co` 在境内连不上（这是已知的）
 *   - `hf-mirror.com` 用 curl 看 CORS 头是**正常**的（GET 与 OPTIONS 预检都回
 *     `Access-Control-Allow-Origin`），但**真实浏览器里 `fetch` 直接 `Failed to fetch`**
 *     —— 线上页面控制台能看到 `blocked by CORS policy`
 *
 * 结果是语义归并永远降级（界面诚实提示「本次没有被检查」），而「硕士／研究生」
 * 正是这个产品的招牌演示点。第三方镜像的可用性不是我们能控制的，所以模型改成
 * **随站点分发**：构建时下载到 `public/models/`，运行时同源读取，不经过任何第三方。
 *
 * ## 几个刻意的选择
 *
 * - **产物不进仓库**（`public/models/` 在 `.gitignore` 里）：23 MB 二进制进 git 只会
 *   让仓库变重，而它完全可以从公开仓库重新拉。真源是 HuggingFace 上的模型 id。
 * - **下载失败不让构建失败**：退出码永远是 0。模型缺失时应用会走自己的降级路径
 *   （界面明说「语义归并不可用……没有被检查」），那比整站部署失败好得多。
 * - **已存在就跳过**：本地反复 `pnpm build` 不该反复下 23 MB。
 * - **按顺序试多个源**：服务器上先试 huggingface.co（Vercel 在美国，直连很快），
 *   本地先试 hf-mirror.com（境内直连 HF 常常失败）。
 *
 * 用法：
 *   node scripts/fetch-model.mjs            # 缺什么补什么
 *   node scripts/fetch-model.mjs --force    # 全部重下
 */

import { mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const MODEL_ID = 'Xenova/bge-small-zh-v1.5';

/** 只下 q8 需要的文件。精度必须与 `src/embedding/loadModel.ts` 的 DTYPE 一致 */
const FILES = [
  'config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'special_tokens_map.json',
  'vocab.txt',
  'onnx/model_quantized.onnx',
];

const TARGET_DIR = join('public', 'models', ...MODEL_ID.split('/'));

/**
 * 源按顺序试。
 *
 * 环境变量 `MODEL_SOURCE` 可以整体覆盖（自建镜像、或内网缓存）。
 * 其余两个按「先在哪个环境跑」排：`CI` / `VERCEL` 在境外，直连 HF 更可靠。
 */
const SOURCES = process.env.MODEL_SOURCE
  ? [process.env.MODEL_SOURCE]
  : process.env.VERCEL || process.env.CI
    ? ['https://huggingface.co', 'https://hf-mirror.com']
    : ['https://hf-mirror.com', 'https://huggingface.co'];

function fileUrl(source, file) {
  return `${source.replace(/\/+$/, '')}/${MODEL_ID}/resolve/main/${file}`;
}

async function existsWithContent(path) {
  try {
    const info = await stat(path);
    return info.isFile() && info.size > 0;
  } catch {
    return false;
  }
}

async function downloadTo(path, file) {
  for (const source of SOURCES) {
    const url = fileUrl(source, file);
    try {
      const response = await fetch(url, { redirect: 'follow' });
      if (!response.ok) {
        console.warn(`  ${file} ← ${source} 返回 ${response.status}，换下一个源`);
        continue;
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length === 0) {
        console.warn(`  ${file} ← ${source} 拿到 0 字节，换下一个源`);
        continue;
      }
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, buffer);
      return { source, bytes: buffer.length };
    } catch (error) {
      // 网络错误是预期的失败形态之一（境内连不上 HF），不当异常
      console.warn(`  ${file} ← ${source} 失败：${error instanceof Error ? error.message : error}`);
    }
  }
  return null;
}

async function main() {
  const force = process.argv.includes('--force');

  // 已有的文件先看一眼：全部齐了就直接返回，连网络都不碰
  const missing = [];
  for (const file of FILES) {
    const path = join(TARGET_DIR, file);
    if (force || !(await existsWithContent(path))) missing.push(file);
  }

  if (missing.length === 0) {
    console.log(`[model] public/models/${MODEL_ID} 已完整，跳过下载`);
    return;
  }

  console.log(`[model] 需要下载 ${missing.length} 个文件到 public/models/${MODEL_ID}`);
  const failed = [];
  let totalBytes = 0;

  for (const file of missing) {
    const result = await downloadTo(join(TARGET_DIR, file), file);
    if (result === null) {
      failed.push(file);
      continue;
    }
    totalBytes += result.bytes;
    console.log(`  ✓ ${file}  ${(result.bytes / 1024).toFixed(0)} KB  ← ${result.source}`);
  }

  if (failed.length > 0) {
    // **不退出失败**：模型缺失时应用会走自己的降级路径并明说，比整站部署失败好
    console.warn(
      `[model] 有 ${failed.length} 个文件没下到：${failed.join('、')}。` +
        '应用仍可运行，但语义归并会降级（界面会明示「没有被检查」）。',
    );
    return;
  }

  console.log(`[model] 完成，本次写入 ${(totalBytes / 1024 / 1024).toFixed(1)} MB`);
}

main().catch((error) => {
  // 脚本本身崩了也不该拦住构建
  console.warn(`[model] 下载脚本出错（不影响构建，语义归并会降级）：${error}`);
});
