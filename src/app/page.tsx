'use client';

import { useDatasetStore } from '@/ui/stores/datasetStore';
import { FileDropzone } from '@/ui/components/FileDropzone';
import { DataTable } from '@/ui/components/DataTable';
import { ColumnProfilePanel } from '@/ui/components/ColumnProfilePanel';
import { IssueList } from '@/ui/components/IssueList';
import { Card, CardBody, CardHeader, CardTitle } from '@/ui/components/base/Card';
import { Spinner } from '@/ui/components/base/Spinner';

export default function HomePage() {
  const status = useDatasetStore((state) => state.status);
  const error = useDatasetStore((state) => state.error);
  const parseResult = useDatasetStore((state) => state.parseResult);
  const profile = useDatasetStore((state) => state.profile);
  const issues = useDatasetStore((state) => state.issues);
  const loadFile = useDatasetStore((state) => state.loadFile);

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <h1 className="text-xl font-semibold text-neutral-900">科研数据质量治理 Agent</h1>
      <p className="mt-1 text-sm text-neutral-500">
        把数据清洗变成一份可复现、可追溯的处理记录
      </p>

      <div className="mt-8">
        <FileDropzone onFile={(file) => void loadFile(file)} disabled={status === 'parsing'} />
      </div>

      {status === 'parsing' ? (
        <div className="mt-6 flex items-center gap-2 text-sm text-neutral-600">
          <Spinner />
          正在解析…
        </div>
      ) : null}

      {status === 'error' && error ? (
        <Card className="mt-6 border-red-200">
          <CardHeader className="border-red-100">
            <CardTitle className="text-red-800">没法读取这个文件</CardTitle>
          </CardHeader>
          <CardBody className="text-sm text-red-700">{error}</CardBody>
        </Card>
      ) : null}

      {status === 'ready' && parseResult ? (
        <section className="mt-8">
          {parseResult.meta.warnings.map((warning) => (
            <p key={warning} className="mb-3 rounded bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {warning}
            </p>
          ))}

          <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <div className="min-w-0">
              <h2 className="mb-3 text-sm font-semibold text-neutral-900">数据预览</h2>
              <DataTable dataset={parseResult.dataset} />
            </div>

            {profile ? (
              <div className="min-w-0">
                <h2 className="mb-3 text-sm font-semibold text-neutral-900">数据概况</h2>
                <ColumnProfilePanel profile={profile} />
              </div>
            ) : null}
          </div>

          <div className="mt-6">
            <IssueList issues={issues} />
          </div>
        </section>
      ) : null}
    </main>
  );
}
