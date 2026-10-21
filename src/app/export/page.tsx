import { ExportPanel } from '@/ui/components/ExportPanel';
import { QualityReportPanel } from '@/ui/components/QualityReportPanel';
import { PageHeader } from '@/ui/components/base/PageHeader';

export const metadata = {
  title: '报告与导出 · 科研数据质量治理 Agent',
};

/**
 * 报告与导出页。
 *
 * 这一页回答的是科研场景里最实际的一个问题：**「你把这个数据洗了一遍，
 * 我怎么知道你怎么洗的、以及怎么自己复现一遍？」**
 * 所以先给「处理摘要 + 报告入口」，再看质量概览与评测证据 —— 读者通常
 * 是来取文件的，不是来读长图的。
 *
 * 指标看板（`QualityReportPanel`）挂在同一页而不是新开路由：侧边栏五项已满，
 * 而看板就是质量报告的屏幕形态。
 */
export default function ExportPage() {
  return (
    <main className="page-shell">
      <PageHeader
        title="报告与导出"
        description="清洗后数据、处理留痕、等价的 pandas 脚本，都由同一次清洗的动作序列生成，所以脚本结果与界面一致。"
      />
      <div className="space-y-6">
        <ExportPanel />
        <QualityReportPanel />
      </div>
    </main>
  );
}
