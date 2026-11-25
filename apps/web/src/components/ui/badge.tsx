import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-[6px] border px-2 py-0.5 text-xs font-medium whitespace-nowrap shrink-0 transition-colors duration-200',
  {
    variants: {
      variant: {
        default: 'border-border bg-secondary text-secondary-foreground',
        safe: 'border-risk-safe-border bg-risk-safe-surface text-risk-safe',
        caution: 'border-risk-caution-border bg-risk-caution-surface text-risk-caution',
        danger: 'border-risk-danger-border bg-risk-danger-surface text-risk-danger',
        outline: 'border-border bg-transparent text-muted-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export type BadgeProps = React.ComponentProps<'span'> &
  VariantProps<typeof badgeVariants>;

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant, className }))}
      {...props}
    />
  );
}
