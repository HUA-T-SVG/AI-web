import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';
import { cn } from '@/ui/lib/cn';

/**
 * 状态徽章。
 *
 * 每一种语义色都对应固定的含义，页面里不再临时写 `bg-red-100`：
 * high=严重、medium=中等、low=轻微、success=达标/完成、brand=进行中/主状态、
 * info=中性说明。徽章文字本身承载信息，颜色只是辅助 —— 色觉障碍读者
 * 不该因为分不清红绿就漏掉严重度。
 */
const badgeStyles = cva(
  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium leading-5',
  {
    variants: {
      tone: {
        neutral: 'border-line bg-canvas text-ink-muted',
        brand: 'border-brand-200 bg-brand-50 text-brand-800',
        high: 'border-danger-200 bg-danger-50 text-danger-700',
        medium: 'border-warning-200 bg-warning-50 text-warning-700',
        low: 'border-info-200 bg-info-50 text-info-700',
        success: 'border-success-200 bg-success-50 text-success-700',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeStyles>;

export function Badge({ className, tone, ...rest }: BadgeProps) {
  return <span className={cn(badgeStyles({ tone }), className)} {...rest} />;
}
