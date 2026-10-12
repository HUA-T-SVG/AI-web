'use client';

import Link from 'next/link';
import { useDatasetStore } from '@/ui/stores/datasetStore';
import { AgentPanel } from '@/ui/components/AgentPanel';
import { Button } from '@/ui/components/base/Button';
import { Card, CardBody } from '@/ui/components/base/Card';
import { EmptyState } from '@/ui/components/base/EmptyState';

export default function AnalysisPage() {
  const status = useDatasetStore((state) => state.status);

  // 与 /check 一致：没有数据时明确引导。渲染一个点了没反应的输入框
  // 比直接说「先去导入」更让人困惑
  if (status !== 'ready') {
    return (
      <div className="px-6 py-8 lg:px-10">
        <h1 className="text-lg font-semibold text-neutral-900">AI 分析</h1>
        <Card className="mt-6">
          <CardBody>
            <EmptyState
              title="还没有导入数据"
              description="AI 分析需要先有一份数据集。先到「数据导入」上传一份 CSV 或 Excel。"
              action={
                <Link href="/import" className="mt-3">
                  <Button size="sm">去导入数据</Button>
                </Link>
              }
            />
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div className="px-6 py-8 lg:px-10">
      <h1 className="text-lg font-semibold text-neutral-900">AI 分析</h1>
      <p className="mt-1 text-sm text-neutral-500">
        大模型只会收到统计摘要；数据质量检查在你的浏览器内执行，原始数据不会上传
      </p>
      <div className="mt-6">
        <AgentPanel />
      </div>
    </div>
  );
}
