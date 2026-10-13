import { ExportPanel } from '@/ui/components/ExportPanel';

export const metadata = {
  title: '报告与导出 · 科研数据质量治理 Agent',
};

/**
 * 报告与导出页。
 *
 * 这一页回答的是科研场景里最实际的一个问题：**「你把这个数据洗了一遍，
 * 我怎么知道你怎么洗的、以及怎么自己复现一遍？」**
 * 所以四样产出里最要紧的不是清洗后的数据，而是**处理留痕与等价的 pandas 脚本**。
 */
export default function ExportPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-xl font-semibold">报告与导出</h1>
        <p className="mt-1 text-sm text-neutral-600">
          清洗后数据、处理留痕、等价的 pandas 脚本 —— 都由同一次清洗的动作序列生成，
          所以脚本跑出来的结果与界面里看到的是一致的。
        </p>
      </header>
      <ExportPanel />
    </main>
  );
}
