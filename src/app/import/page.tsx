'use client';

import Link from 'next/link';
import { useDatasetStore } from '@/ui/stores/datasetStore';
import { FileDropzone } from '@/ui/components/FileDropzone';
import { DataTable } from '@/ui/components/DataTable';
import { LocalDataCard } from '@/ui/components/LocalDataCard';
import { Card, CardBody, CardHeader, CardTitle } from '@/ui/components/base/Card';
import { Spinner } from '@/ui/components/base/Spinner';

export default function ImportPage() {
  const status = useDatasetStore((state) => state.status);
  const error = useDatasetStore((state) => state.error);
  const parseResult = useDatasetStore((state) => state.parseResult);
  const loadFile = useDatasetStore((state) => state.loadFile);

  return (
    <div className="px-6 py-8 lg:px-10">
      <h1 className="text-lg font-semibold text-neutral-900">数据导入</h1>
      <p className="mt-1 text-sm text-neutral-500">文件在浏览器内解析，不会上传到任何服务器</p>

      <div className="mt-6">
        <FileDropzone
          onFile={(file) => void loadFile(file)}
          disabled={status === 'parsing' || status === 'profiling'}
        />
      </div>

      {status === 'parsing' || status === 'profiling' ? (
        <div className="mt-6 flex items-center gap-2 text-sm text-neutral-600">
          <Spinner />
          {status === 'parsing' ? '正在解析…' : '数据已解析，正在计算列画像…'}
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

          <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="text-sm font-semibold text-neutral-900">数据预览</h2>
            {/* 让用户确认读到的是哪个文件、哪张表、什么编码 —— 选错文件时这是唯一的线索 */}
            <span className="text-xs text-neutral-500">
              {parseResult.meta.fileName}
              {parseResult.meta.sheetName ? ` · 工作表「${parseResult.meta.sheetName}」` : ''}
              {parseResult.meta.encoding ? ` · 编码 ${parseResult.meta.encoding}` : ''}
            </span>
          </div>

          <DataTable dataset={parseResult.dataset} />

          <p className="mt-3 text-xs text-neutral-500">
            去{' '}
            <Link href="/check" className="underline hover:text-neutral-900">
              质量检查
            </Link>{' '}
            看这份数据的问题。
          </p>
        </section>
      ) : null}

      {/* 任何时候都在：清除入口不能只在「刷新后恢复过」时才出现（T8） */}
      <LocalDataCard />
    </div>
  );
}
