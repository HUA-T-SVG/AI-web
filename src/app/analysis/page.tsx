'use client';

import Link from 'next/link';
import { useDatasetStore } from '@/ui/stores/datasetStore';
import { AgentPanel } from '@/ui/components/AgentPanel';
import { Card, CardBody } from '@/ui/components/base/Card';
import { EmptyState } from '@/ui/components/base/EmptyState';
import { PageHeader } from '@/ui/components/base/PageHeader';
import { buttonStyles } from '@/ui/components/base/Button';
import { cn } from '@/ui/lib/cn';

export default function AnalysisPage() {
  const status = useDatasetStore((state) => state.status);

  // 与 /check 一致：没有数据时明确引导。渲染一个点了没反应的输入框
  // 比直接说「先去导入」更让人困惑
  if (status !== 'ready') {
    return (
      <div className="page-shell">
        <PageHeader
          title="AI 分析"
          description="大模型只会收到统计摘要；数据质量检查在你的浏览器内执行，原始数据不会上传。"
        />
        <Card>
          <CardBody>
            <EmptyState
              title="还没有导入数据"
              description="AI 分析需要先有一份数据集。先到「数据导入」上传一份 CSV 或 Excel。"
              action={
                <Link href="/import" className={cn(buttonStyles({ size: 'sm' }), 'mt-2')}>
                  去导入数据
                </Link>
              }
            />
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div className="page-shell">
      <PageHeader
        title="AI 分析"
        description="AI 先提交检查计划，再由你在浏览器内执行检查、逐条确认结果。原始数据不会上传，检查都在本机完成。"
      />
      <AgentPanel />
    </div>
  );
}
