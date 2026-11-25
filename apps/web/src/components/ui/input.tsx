import * as React from 'react';
import { cn } from '../../lib/utils';

export function Input({
  className,
  type,
  ...props
}: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'flex min-h-10 w-full rounded-[8px] border border-input bg-surface-inset px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}
