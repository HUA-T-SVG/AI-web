import { cva, type VariantProps } from 'class-variance-authority';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/ui/lib/cn';

const buttonStyles = cva(
  'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-neutral-900 text-white hover:bg-neutral-700',
        secondary: 'border border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-100',
        ghost: 'text-neutral-700 hover:bg-neutral-100',
      },
      size: {
        sm: 'h-8 px-3 text-sm',
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
  return <button type={type} className={cn(buttonStyles({ variant, size }), className)} {...rest} />;
}
