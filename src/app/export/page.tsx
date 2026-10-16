import { ExportPanel } from '@/ui/components/ExportPanel';
import { QualityReportPanel } from '@/ui/components/QualityReportPanel';

export const metadata = {
  title: '报告与导出 · 科研数据质量治理 Agent',
};

/**
 * 报告与导出页。
 *
 * 这一页回答的是科研场景里最实际的一个问题：**「你把这个数据洗了一遍，
 * 我怎么知道你怎么洗的、以及怎么自己复现一遍？」**
 * 所以四样产出里最要紧的不是清洗后的数据，而是**处理留痕与等价的 pandas 脚本**。
 *
 * 这一页还挂着**指标看板**（`QualityReportPanel`）：上面是「这次分析干了什么」，
 * 看板是「系统判断得准不准、依据是什么」。挂这里而不是新开路由，是因为
 * 看板就是质量报告的屏幕形态 —— 而侧边栏五项已满，新开一项要动导航与它的测试。
 */
export default function ExportPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-xl font-semibold">报告与导出</h1>
        <p className="mt-1 text-sm text-neutral-600">
          清洗后数据、处理留痕、等价的 pandas 脚本 —— 都由同一次清洗的动作序列生成，
          所以脚本跑出来的结果与界面里看到的是一致的。下面的指标看板回答
          「系统判断得准不准、依据是什么」。
        </p>
      </header>
      <QualityReportPanel />
      <div className="mt-6">
        <ExportPanel />
      </div>
    </main>
  );
}
