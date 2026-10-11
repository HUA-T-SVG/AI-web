import type { ReactNode } from 'react';
import { cn } from '@/ui/lib/cn';

export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn('flex flex-col items-center justify-center gap-2 py-12 text-center', className)}
    >
      <p className="text-sm font-medium text-neutral-700">{title}</p>
      {description ? <p className="max-w-md text-xs text-neutral-500">{description}</p> : null}
      {action}
    </div>
  );
}
