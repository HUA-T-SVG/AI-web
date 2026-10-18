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
 * 模型从**站点同源**的 `/models/` 读取，不经过任何第三方。
 *
 * ## 为什么改成自托管（线上实测的结果，别改回纯远端）
 *
 * 原先浏览器直接从 HuggingFace / hf-mirror 拉这 23.4 MB。上线后实测两条路都不通：
 *
 *   1. `huggingface.co` 在境内连不上（已知）
 *   2. `hf-mirror.com` 用 curl 看 CORS 头是**正常**的（GET 与 OPTIONS 预检都回
 *      `Access-Control-Allow-Origin`），但**真实浏览器里 `fetch` 直接
 *      `Failed to fetch`**，控制台写的是 `blocked by CORS policy`
 *
 * 结果是语义归并永远降级 —— 界面会诚实地提示「本次没有被检查」，但「硕士／研究生」
 * 正是这个产品的招牌演示点，不能靠第三方镜像的运气。
 *
 * 所以流程改成：`scripts/fetch-model.mjs` 在 **prebuild** 时把模型下载到
 * `public/models/`，运行时同源读取。代价是构建多依赖一次下载（失败不拦构建，
 * 只是降级）；收益是**运行时零第三方依赖**，境内打开即可用。
 *
 * `allowLocalModels` 在浏览器里**默认是 false**（transformers.js 的取值是
 * 「只在非 Web 环境默认开启」），所以必须显式打开；`localModelPath` 的默认值
 * 在浏览器里正好就是 `/models/`，不用改。
 */
env.allowLocalModels = true;
// 关掉远端：自托管的模型一定在，真缺了就让 loadModel 抛错、界面明说「没有被检查」，
// 而不是回退到一个在境内不可用的镜像、再失败一次
env.allowRemoteModels = false;

/**
 * 推理运行时（onnxruntime-web 的 WASM）也必须同源。
 *
 * 只自托管模型文件是不够的：**跑模型的 WASM 运行时**默认从 `cdn.jsdelivr.net` 拉
 * （实测控制台里的 URL 就是 `.../onnxruntime-web@1.31.0-.../ort-wasm-simd-threaded.asyncify.wasm`），
 * 而 jsDelivr 在境内常被阻断 —— 于是模型下来了、推理却起不来，语义归并照样降级。
 *
 * `scripts/sync-ort-wasm.mjs` 在 predev / prebuild 时把这些文件从
 * `node_modules/onnxruntime-web/dist/` 拷到 `public/ort/`，这里把路径指过去。
 */
/**
 * 把 onnxruntime 的 WASM 配置指到站点同源。
 *
 * `env.backends.onnx.wasm` 在类型上是可选的（transformers 会在 import 时初始化它）。
 * 真拿不到时**要说出来**：那意味着内部结构变了，推理会退回从 jsDelivr 拉 WASM ——
 * 而境内那条路大概率不通，界面只会显示「语义归并不可用」，原因看不出来。
 */
function configureOnnxWasm(): void {
  const wasm = env.backends.onnx.wasm;
  if (!wasm) {
    console.warn('[embedding] 拿不到 onnx 的 wasm 后端配置，推理可能改从 CDN 加载（境内可能不可用）');
    return;
  }
  wasm.wasmPaths = '/ort/';
  /**
   * 强制单线程。
   *
   * 多线程 WASM 依赖 `SharedArrayBuffer`，而它要求站点发 COOP/COEP 两个响应头
   * （跨源隔离）。本项目**故意不发**这两个头 —— 它们会连带影响第三方请求与后续
   * 嵌入能力，为一个可选加速付这个代价不划算。而 ORT 在缺隔离时并不总能优雅
   * 回落到单线程。
   *
   * 单线程对 bge-small 这个体量够用：代价是推理慢一些，收益是**能跑起来**。
   */
  wasm.numThreads = 1;
}

configureOnnxWasm();

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
 * 先探测 WebGPU 适配器，再**只用选中的后端加载一次**。
 *
 * ## 为什么不能「先试 webgpu，失败了再试 wasm」
 *
 * 这是实测踩出来的：原来的写法在无显卡环境（headless/CI/没装驱动的机器）下会
 * **永远失败**。原因是 transformers.js 的 `pipeline()` 会按模型 id 缓存**加载用的
 * Promise** —— 第一次（webgpu）失败后，第二次（wasm）拿到的是同一个已经失败的
 * Promise，报错文案里仍然写着 `[webgpu] Error: Failed to get GPU adapter`。
 * 证据：修复前线上控制台里 WASM 的 `.wasm/.mjs` 都已经从 `/ort/` 下载成功、
 * 却仍然报 webgpu 的错；把回退改成「先探测再加载一次」之后，同一个浏览器立刻能用。
 *
 * 所以回退必须发生在**加载之前**：探测适配器，然后只加载一次。
 * 探测比「只看 `navigator.gpu` 是否存在」强一档 —— 后者在有 API 但没有真实适配器的
 * 设备（虚拟机、远程桌面、部分驱动组合）上会给出错误答案。
 *
 * 代价：真的出现「适配器在、但 WebGPU 会话创建失败」时，需要刷新页面才会改用 WASM。
 * 界面会明说原因（`synonymNote`），比「两次尝试都做了、结果还是不回来」诚实。
 */
async function pickDevice(): Promise<'webgpu' | 'wasm'> {
  const gpu = (navigator as Navigator & {
    gpu?: { requestAdapter(): Promise<unknown | null> };
  }).gpu;
  if (!gpu) return 'wasm';

  try {
    const adapter = await gpu.requestAdapter();
    return adapter === null ? 'wasm' : 'webgpu';
  } catch {
    // 请求适配器本身抛错 = 这台机器用不了 WebGPU
    return 'wasm';
  }
}

export const loadModel: (onProgress: (ratio: number) => void) => Promise<LoadedModel> = async (
  onProgress,
) => {
  const device = await pickDevice();
  return loadOnDevice(device, onProgress);
};
