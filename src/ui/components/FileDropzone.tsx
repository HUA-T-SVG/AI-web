'use client';

import { useCallback, useRef, useState, type DragEvent } from 'react';
import { Upload } from 'lucide-react';
import { Button } from '@/ui/components/base/Button';
import { cn } from '@/ui/lib/cn';

const ACCEPT = '.csv,.xlsx';
const SUPPORTED_HINT = '支持 .csv 与 .xlsx，单个文件不超过 50 MB';

export function FileDropzone({
  onFile,
  disabled,
}: {
  onFile: (file: File) => void;
  disabled?: boolean;
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

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 py-14 text-center transition-colors',
        isDragging ? 'border-neutral-900 bg-neutral-100' : 'border-neutral-300 bg-white',
        disabled && 'pointer-events-none opacity-60',
      )}
    >
      <Upload className="h-7 w-7 text-neutral-400" aria-hidden="true" />

      <div>
        <p className="text-sm font-medium text-neutral-800">把数据文件拖到这里</p>
        <p className="mt-1 text-xs text-neutral-500">{SUPPORTED_HINT}</p>
      </div>

      {/* 键盘用户走这里：按钮触发的原生文件选择，不依赖拖拽 */}
      <Button variant="secondary" size="sm" onClick={() => inputRef.current?.click()}>
        选择文件
      </Button>

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

      <p className="text-xs text-neutral-400">文件在浏览器内解析，不会上传到任何服务器</p>
    </div>
  );
}
