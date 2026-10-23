import { cva, type VariantProps } from 'class-variance-authority';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/ui/lib/cn';

/**
 * 按钮样式表。
 * 导出是为了让 `<Link>` 能直接套用同一套外观 —— 把 Button 嵌进 Link 会产生
 * 无效 HTML（a 不能包含交互元素），读屏会念成「链接…按钮」，键盘还要多按一次 Tab。
 *
 * 焦点样式不在这里写：全局 `:focus-visible` 统一给深青描边，组件再叠 ring
 * 会出现双层光圈。这里只负责「默认 / 悬停 / 禁用」三态与尺寸。
 */
export const buttonStyles = cva(
  // 触屏上至少 44px 高：sm 的 h-9 只有 36px，手指点偏一次就可能是删除/执行这类不可逆操作。
  // 只在窄屏抬下限，桌面端保持 h-9/h-10/h-12，表格工具栏的密度不变。
  'inline-flex max-md:min-h-11 items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:pointer-events-none disabled:opacity-45',
  {
    variants: {
      variant: {
        primary: 'bg-brand-700 text-white shadow-sm hover:bg-brand-800 active:bg-brand-900',
        secondary:
          'border border-line-strong bg-surface text-ink hover:bg-brand-50 hover:border-brand-200',
        ghost: 'text-ink-muted hover:bg-brand-50 hover:text-brand-800',
        danger: 'bg-danger-700 text-white hover:bg-danger-600',
      },
      size: {
        sm: 'h-9 px-3 text-sm',
        md: 'h-10 px-4 text-sm',
        lg: 'h-12 px-6 text-base',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonStyles>;

export function Button({ className, variant, size, type = 'button', ...rest }: ButtonProps) {
  // 默认 type="button"：放在表单里时不写 type 会被当成提交按钮，是很常见的意外提交来源
  return (
    <button type={type} className={cn(buttonStyles({ variant, size }), className)} {...rest} />
  );
}
