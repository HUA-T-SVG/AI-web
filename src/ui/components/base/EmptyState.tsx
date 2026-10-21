import type { ReactNode } from 'react';
import { Inbox } from 'lucide-react';
import { cn } from '@/ui/lib/cn';

export function EmptyState({
  title,
  description,
  action,
  className,
  icon,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  icon?: ReactNode;
}) {
  return (
    <div
      className={cn('flex flex-col items-center justify-center gap-3 px-6 py-12 text-center', className)}
    >
      <span
        className="flex h-11 w-11 items-center justify-center rounded-full bg-canvas text-ink-muted"
        aria-hidden="true"
      >
        {icon ?? <Inbox className="h-5 w-5" />}
      </span>
      <div className="space-y-1">
        <p className="text-sm font-medium text-ink">{title}</p>
        {description ? (
          <p className="mx-auto max-w-md text-xs leading-relaxed text-ink-muted">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
