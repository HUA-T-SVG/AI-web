#!/usr/bin/env node
/**
 * 把 onnxruntime-web 的 WASM 运行时拷到 `public/ort/`，让推理引擎也走**站点同源**。
 *
 * ## 为什么需要它（线上实测的证据）
 *
 * 模型文件改成自托管之后，浏览器控制台里仍有这一条：
 *
 *   https://cdn.jsdelivr.net/npm/onnxruntime-web@1.31.0-.../dist/ort-wasm-simd-threaded.asyncify.wasm
 *
 * 也就是说：**模型是本地的，但跑模型的 WASM 运行时还在从 jsDelivr 拉**。jsDelivr 在境内
 * 常被阻断/不稳定，于是 WASM 后端起不来，语义归并仍然降级 —— 界面会诚实提示
 * 「语义归并不可用……没有被检查」，但招牌演示点就没了。
 *
 * 这两个文件本来就在 `node_modules/onnxruntime-web/dist/` 里，不需要下载，**拷一份**即可。
 *
 * ## 拷哪些
 *
 * 只拷真正会用到的两个变体（都被打包成 .wasm + 配套 .mjs）：
 *   - `ort-wasm-simd-threaded.asyncify.*` —— CPU/WASM 后端（WebGPU 不可用时的回退）
 *   - `ort-wasm-simd-threaded.jsep.*`      —— WebGPU 后端
 *
 * `jspi` 变体不拷：我们不用 JSPI，多拷 16 MB 只会让部署包更重。
 *
 * 拷完之后 `src/embedding/loadModel.ts` 里把 `wasmPaths` 指到 `/ort/`，
 * 于是整个推理链路（模型权重 + 运行时）都不再经过第三方。
 */

import { copyFile, mkdir, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { globSync } from 'node:fs';

const FILES = [
  'ort-wasm-simd-threaded.asyncify.wasm',
  'ort-wasm-simd-threaded.asyncify.mjs',
  'ort-wasm-simd-threaded.jsep.wasm',
  'ort-wasm-simd-threaded.jsep.mjs',
];

const TARGET_DIR = join('public', 'ort');

/**
 * 找到 onnxruntime-web 的 dist 目录。
 *
 * 它是 `@huggingface/transformers` 的传递依赖，pnpm 下不一定在顶层 node_modules 里，
 * 所以先试正常解析，失败再退回 `.pnpm` 目录里按名字找 —— 两条路都失败就报错退出，
 * 而不是悄悄跳过（跳过会让线上重新变成从 jsDelivr 拉，而那种失败很难被发现）。
 */
function findOrtDist() {
  const require = createRequire(import.meta.url);
  try {
    return join(dirname(require.resolve('onnxruntime-web/package.json')), 'dist');
  } catch {
    // 退路：pnpm 的 .pnpm 目录
  }
  const matches = globSync('node_modules/.pnpm/onnxruntime-web@*/node_modules/onnxruntime-web/dist');
  if (matches.length === 0) throw new Error('找不到 onnxruntime-web 的 dist 目录');
  return matches[0];
}

async function main() {
  const dist = findOrtDist();
  await mkdir(TARGET_DIR, { recursive: true });

  let copied = 0;
  for (const file of FILES) {
    const source = join(dist, file);
    const target = join(TARGET_DIR, file);
    try {
      const info = await stat(source);
      await copyFile(source, target);
      copied += info.size;
      console.log(`  ✓ ${file}  ${(info.size / 1024 / 1024).toFixed(1)} MB`);
    } catch (error) {
      console.warn(`  ${file} 拷贝失败：${error instanceof Error ? error.message : error}`);
    }
  }

  if (copied === 0) {
    console.warn('[ort] 没有拷到任何文件，推理会退回从 CDN 拉取（境内可能不可用）');
    return;
  }
  console.log(`[ort] 已写入 public/ort/，共 ${(copied / 1024 / 1024).toFixed(1)} MB`);
}

main().catch((error) => {
  // 与模型下载脚本一致：不拦构建，缺失时应用会降级并在界面上说明
  console.warn(`[ort] 拷贝脚本出错（不影响构建，语义归并可能降级）：${error}`);
});
