'use client';

import Link from 'next/link';
import type { DatasetProfile } from '@/core';
import { useDatasetStore } from '@/ui/stores/datasetStore';
import { FileDropzone } from '@/ui/components/FileDropzone';
import { DataTable } from '@/ui/components/DataTable';
import { ColumnProfilePanel } from '@/ui/components/ColumnProfilePanel';
import { LocalDataCard } from '@/ui/components/LocalDataCard';
import { Card, CardBody, CardHeader, CardTitle } from '@/ui/components/base/Card';
import { Notice } from '@/ui/components/base/Notice';
import { PageHeader } from '@/ui/components/base/PageHeader';
import { Spinner } from '@/ui/components/base/Spinner';
import { Stat } from '@/ui/components/base/Stat';
import { buttonStyles } from '@/ui/components/base/Button';
import { cn } from '@/ui/lib/cn';

const TYPE_LABEL: Record<string, string> = {
  number: '数值',
  category: '分类',
  text: '文本',
  boolean: '布尔',
  empty: '全空',
  mixed: '混合',
};

function profileStats(profile: DatasetProfile) {
  const missingCells = profile.columns.reduce((sum, column) => sum + column.missingCount, 0);
  const missingColumns = profile.columns.filter((column) => column.missingCount > 0).length;
  const types = new Map<string, number>();
  for (const column of profile.columns) {
    types.set(column.type, (types.get(column.type) ?? 0) + 1);
  }
  return { missingCells, missingColumns, types };
}

function NextSteps() {
  const steps = [
    { href: '/check', title: '看清问题', text: '八项规则检查，按严重程度与字段筛选' },
    { href: '/analysis', title: '让 AI 提建议', text: '先提交检查计划，再由你逐条确认' },
    { href: '/export', title: '交付与复现', text: '清洗后数据、处理留痕与等价的 pandas 脚本' },
  ];
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>接下来</CardTitle>
      </CardHeader>
      <CardBody className="space-y-1">
        {steps.map((step, index) => (
          <Link
            key={step.href}
            href={step.href}
            className="flex items-start gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-brand-50"
          >
            <span
              className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-800"
              aria-hidden="true"
            >
              {index + 1}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium text-ink">{step.title}</span>
              <span className="mt-0.5 block text-xs leading-relaxed text-ink-muted">{step.text}</span>
            </span>
          </Link>
        ))}
      </CardBody>
    </Card>
  );
}

export default function ImportPage() {
  const status = useDatasetStore((state) => state.status);
  const error = useDatasetStore((state) => state.error);
  const parseResult = useDatasetStore((state) => state.parseResult);
  const profile = useDatasetStore((state) => state.profile);
  const loadFile = useDatasetStore((state) => state.loadFile);

  const isReady = status === 'ready' && parseResult !== null;
  const isBusy = status === 'parsing' || status === 'profiling';
  const stats = profile ? profileStats(profile) : null;

  return (
    <div className="page-shell">
      <PageHeader
        title="数据导入"
        description="文件在浏览器内解析，原始数据不会上传到任何服务器。导入后先看数据概况，再决定查什么。"
        meta={
          isReady ? (
            <>
              {parseResult.meta.sheetName ? (
                <span>工作表「{parseResult.meta.sheetName}」</span>
              ) : null}
              {parseResult.meta.encoding ? <span>编码 {parseResult.meta.encoding}</span> : null}
            </>
          ) : null
        }
        actions={
          isReady ? (
            <>
              <Link href="/analysis" className={cn(buttonStyles({ variant: 'secondary', size: 'md' }))}>
                AI 分析
              </Link>
              <Link href="/check" className={cn(buttonStyles({ size: 'md' }))}>
                去质量检查
              </Link>
            </>
          ) : null
        }
      />

      <div className="space-y-6">
        {isReady ? (
          <FileDropzone
            compact
            fileName={parseResult.meta.fileName}
            disabled={isBusy}
            onFile={(file) => void loadFile(file)}
          />
        ) : (
          <FileDropzone disabled={isBusy} onFile={(file) => void loadFile(file)} />
        )}

        {isBusy ? (
          <Notice tone="info" title={status === 'parsing' ? '正在解析文件…' : '正在计算列画像…'}>
            <span className="inline-flex items-center gap-2">
              <Spinner className="h-3.5 w-3.5" />
              {status === 'parsing'
                ? '解析在浏览器内进行，稍候会显示预览与字段摘要。'
                : '数据已解析，正在统计缺失、类型与取值规模。'}
            </span>
          </Notice>
        ) : null}

        {status === 'error' && error ? (
          <Notice tone="danger" title="没法读取这个文件">
            {error}。换一份文件，或确认文件没有损坏后被其他程序占用。
          </Notice>
        ) : null}

        {isReady ? (
          <>
            {parseResult.meta.warnings.map((warning) => (
              <Notice key={warning} tone="warning">
                {warning}
              </Notice>
            ))}

            {profile !== null && stats !== null ? (
              <section aria-labelledby="overview-title" className="space-y-3">
                <h2 id="overview-title" className="text-base font-semibold tracking-tight text-ink">
                  数据概况
                </h2>
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <Stat label="数据规模" value={`${profile.rowCount.toLocaleString('zh-CN')} 行`} hint={`${profile.columnCount} 列`} />
                  <Stat
                    label="有缺失的列"
                    value={`${stats.missingColumns} 列`}
                    hint={`共 ${stats.missingCells.toLocaleString('zh-CN')} 个空格`}
                    tone={stats.missingColumns > 0 ? 'warning' : 'success'}
                  />
                  <Stat
                    label="重复列名"
                    value={`${profile.duplicateColumnNames.length} 个`}
                    hint={profile.duplicateColumnNames.length > 0 ? '按列名定位的处理可能出错' : '列名可用于定位'}
                    tone={profile.duplicateColumnNames.length > 0 ? 'warning' : 'neutral'}
                  />
                  <Stat
                    label="字段类型"
                    value={`${[...stats.types.entries()].filter(([type]) => type !== 'empty').length} 类`}
                    hint={[...stats.types.entries()]
                      .map(([type, count]) => `${TYPE_LABEL[type] ?? type} ${count}`)
                      .join(' · ')}
                  />
                </div>
              </section>
            ) : null}

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
              {profile !== null ? <ColumnProfilePanel profile={profile} /> : <div />}
              <NextSteps />
            </div>

            <section aria-labelledby="preview-title" className="space-y-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 id="preview-title" className="text-base font-semibold tracking-tight text-ink">
                  数据预览
                </h2>
                <span className="text-xs text-ink-muted">只显示前若干行，滚动可看更多</span>
              </div>
              <DataTable dataset={parseResult.dataset} />
            </section>
          </>
        ) : null}

        <LocalDataCard />
      </div>
    </div>
  );
}
