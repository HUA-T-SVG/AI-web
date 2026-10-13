import { env, pipeline } from '@huggingface/transformers';
import type { LoadedModel } from './types';

/**
 * 模型仓库。
 *
 * 这个 id 已经实测验证过（HTTP 200，加载后 512 维）—— **不要凭印象改它**。
 * 写错的后果是「用户第一次打开页面才炸」，而那是演示现场最容易出事的地方。
 * 验证方式见 `knowledge/tools/validate-embedding.mjs`（Task 1 的验证实验）。
 */
/**
 * 模型标识。
 *
 * 导出它是**为了让规则检索能核对后端**：索引里的向量必须与查询向量来自同一个模型。
 * 维度相同（都是 512）挡不住这件事，于是「hash 索引 + bge 查询」会静默算出一堆
 * 没有语义含义的余弦，还会被标成「语义相近」。`retrieveRules` 的 `queryModel`
 * 参数就是拿它比的。
 */
export const MODEL_ID = 'Xenova/bge-small-zh-v1.5';

/**
 * 量化精度。必须与 Task 1 扫阈值时用的精度一致 —— 实测 `q8` 下
 * 「硕士／研究生」余弦 0.7195、`fp32` 下 0.7567，差 0.037，比可用窗口还宽。
 * `q8` 的模型文件约 25 MB（spec §4.3 的预算）。
 */
const DTYPE = 'q8' as const;

/**
 * 允许换镜像。境内直连 huggingface.co 不稳时，把 remoteHost 指到 hf-mirror.com。
 * 用环境变量而不是硬编码：换镜像不该改代码重新部署。
 *
 * 必须是静态成员访问 —— Next 在打包时按字面替换 `process.env.NEXT_PUBLIC_*`，
 * 写成 `process.env[name]` 不会被替换，浏览器里会拿到 undefined。
 */
if (process.env.NEXT_PUBLIC_HF_MIRROR) {
  env.remoteHost = process.env.NEXT_PUBLIC_HF_MIRROR;
}

// 浏览器 Cache API 缓存模型文件，二次访问即秒开（spec §4.3）
env.useBrowserCache = true;

async function loadOnDevice(
  device: 'webgpu' | 'wasm',
  onProgress: (ratio: number) => void,
): Promise<LoadedModel> {
  const extractor = await pipeline('feature-extraction', MODEL_ID, {
    dtype: DTYPE,
    device,
    progress_callback: (report: { status?: string; progress?: number }) => {
      if (report.status === 'progress' && typeof report.progress === 'number') {
        onProgress(report.progress / 100);
      }
    },
  });

  return {
    backend: device,
    run: async (texts: string[]) => {
      const tensor = await extractor(texts, { pooling: 'mean', normalize: true });
      return tensor.tolist() as number[][];
    },
  };
}

/**
 * 优先 WebGPU，失败回退 WASM（spec §4.3）。
 *
 * 回退必须发生在**一次加载之内**，不能只看 `navigator.gpu` 是否存在就决定后端：
 * WebGPU 在部分浏览器与驱动组合上会「加载到一半才报错」，只看 API 存在性会
 * 把这类设备直接判死。
 */
export const loadModel: (onProgress: (ratio: number) => void) => Promise<LoadedModel> = async (
  onProgress,
) => {
  try {
    return await loadOnDevice('webgpu', onProgress);
  } catch {
    // WebGPU 不可用是常态（旧版 Chrome、Safari），不当作错误上报。
    // 但进度必须重置 —— 否则界面会停在 WebGPU 那次的 40% 一动不动。
    onProgress(0);
    return await loadOnDevice('wasm', onProgress);
  }
};
