import type { ReactNode } from 'react';
import { CircleCheck, CircleX, Info, TriangleAlert } from 'lucide-react';
import { cn } from '@/ui/lib/cn';

type NoticeTone = 'info' | 'success' | 'warning' | 'danger';

const TONE_STYLES: Record<NoticeTone, { box: string; icon: string; Icon: typeof Info }> = {
  info: { box: 'border-info-200 bg-info-50 text-info-700', icon: 'text-info-700', Icon: Info },
  success: {
    box: 'border-success-200 bg-success-50 text-success-700',
    icon: 'text-success-600',
    Icon: CircleCheck,
  },
  warning: {
    box: 'border-warning-200 bg-warning-50 text-warning-700',
    icon: 'text-warning-600',
    Icon: TriangleAlert,
  },
  danger: {
    box: 'border-danger-200 bg-danger-50 text-danger-700',
    icon: 'text-danger-600',
    Icon: CircleX,
  },
};

/**
 * 语义提示块。加载失败、降级、数据来源、成功回执都用它，页面不再各写一套
 * 彩色 div。图标 + 标题 + 正文三重表达，不只靠底色区分严重程度。
 */
export function Notice({
  tone = 'info',
  title,
  children,
  testId,
  className,
}: {
  tone?: NoticeTone;
  title?: string;
  children?: ReactNode;
  testId?: string;
  className?: string;
}) {
  const style = TONE_STYLES[tone];
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      data-testid={testId}
      className={cn('flex items-start gap-3 rounded-lg border px-4 py-3', style.box, className)}
    >
      <style.Icon className={cn('mt-0.5 h-4 w-4 shrink-0', style.icon)} aria-hidden="true" />
      <div className="min-w-0 text-sm leading-relaxed">
        {title ? <p className="font-medium">{title}</p> : null}
        {children ? <div className={title ? 'mt-0.5 text-xs' : 'text-xs'}>{children}</div> : null}
      </div>
    </div>
  );
}
