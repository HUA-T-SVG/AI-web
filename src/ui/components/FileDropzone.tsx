'use client';

import { useCallback, useRef, useState, type DragEvent } from 'react';
import { FileSpreadsheet, Upload } from 'lucide-react';
import { Button } from '@/ui/components/base/Button';
import { cn } from '@/ui/lib/cn';

const ACCEPT = '.csv,.xlsx';
const SUPPORTED_HINT = '支持 .csv 与 .xlsx，单个文件不超过 50 MB';

export function FileDropzone({
  onFile,
  onSample,
  sampleLabel,
  sampleBusy = false,
  disabled,
  compact = false,
  fileName,
}: {
  onFile: (file: File) => void;
  /** 首屏「体验示例数据」入口。不传则不渲染 */
  onSample?: () => void;
  /**
   * 示例按钮的文案。默认「体验示例数据」—— 未选场景时就是原来那句；
   * 选了场景后由调用方传入「问卷数据示例」这类更具体的说法，让用户知道点开的是哪份示例。
   */
  sampleLabel?: string;
  sampleBusy?: boolean;
  disabled?: boolean;
  /** 已导入后收成一条文件栏：首屏把空间让给数据概况与下一步 */
  compact?: boolean;
  fileName?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (file) onFile(file);
    },
    [onFile],
  );

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragging(false);
      if (disabled) return;
      handleFiles(event.dataTransfer.files);
    },
    [disabled, handleFiles],
  );

  const fileInput = (
    <input
      ref={inputRef}
      type="file"
      accept={ACCEPT}
      className="sr-only"
      aria-label="选择数据文件"
      onChange={(event) => {
        handleFiles(event.target.files);
        // 清空 value，否则连续选择同一个文件不会再触发 change
        event.target.value = '';
      }}
    />
  );

  if (compact) {
    return (
      <div
        className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3"
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <span
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
            isDragging ? 'bg-brand-100 text-brand-700' : 'bg-canvas text-ink-muted',
          )}
          aria-hidden="true"
        >
          <FileSpreadsheet className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink">{fileName ?? '已导入数据'}</p>
          <p className="text-xs text-ink-muted">换文件会重新解析，当前页的分析结果随之清空</p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          换一个文件
        </Button>
        {fileInput}
      </div>
    );
  }

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      className={cn(
        'flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors sm:py-16',
        isDragging ? 'border-brand-500 bg-brand-50' : 'border-line-strong bg-surface',
        disabled && 'pointer-events-none opacity-60',
      )}
    >
      <span
        className={cn(
          'flex h-14 w-14 items-center justify-center rounded-2xl transition-colors',
          isDragging ? 'bg-brand-100 text-brand-700' : 'bg-canvas text-ink-muted',
        )}
        aria-hidden="true"
      >
        <Upload className="h-6 w-6" />
      </span>

      <div>
        <p className="text-base font-medium text-ink">把数据文件拖到这里</p>
        <p className="mt-1 text-xs text-ink-muted">{SUPPORTED_HINT}</p>
      </div>

      {/* 键盘用户走这里：按钮触发的原生文件选择，不依赖拖拽 */}
      <Button variant="primary" size="md" onClick={() => inputRef.current?.click()}>
        选择文件
      </Button>

      {onSample !== undefined ? (
        <div className="flex flex-col items-center gap-1.5">
          <span className="text-xs text-ink-muted">或者先看看示例</span>
          <Button
            variant="secondary"
            size="sm"
            data-testid="sample-entry"
            disabled={sampleBusy}
            onClick={onSample}
          >
            {sampleLabel ?? '体验示例数据'}
          </Button>
        </div>
      ) : null}

      {fileInput}

      {/* 这是产品的核心承诺，必须达到 WCAG AA */}
      <p className="text-xs text-ink-muted">文件在浏览器内解析，不会上传到任何服务器</p>
    </div>
  );
}
