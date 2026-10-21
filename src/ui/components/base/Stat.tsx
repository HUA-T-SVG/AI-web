import type { ReactNode } from 'react';
import { cn } from '@/ui/lib/cn';

type StatTone = 'neutral' | 'brand' | 'danger' | 'warning' | 'success';

const TONE: Record<StatTone, string> = {
  neutral: 'text-ink',
  brand: 'text-brand-700',
  danger: 'text-danger-700',
  warning: 'text-warning-700',
  success: 'text-success-700',
};

/**
 * 一个指标格。数字先于标签被看到，提示行解释数字的来源或口径。
 * 五个页面里的「概况 / 统计」都走这一个组件，避免格子高度与字号各写各的。
 */
export function Stat({
  label,
  value,
  hint,
  tone = 'neutral',
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: StatTone;
  className?: string;
}) {
  return (
    <div className={cn('rounded-lg border border-line bg-surface px-4 py-3', className)}>
      <p className="text-xs text-ink-muted">{label}</p>
      <p className={cn('mt-1 text-xl font-semibold tabular-nums tracking-tight', TONE[tone])}>{value}</p>
      {hint ? <p className="mt-1 text-xs leading-relaxed text-ink-muted">{hint}</p> : null}
    </div>
  );
}
