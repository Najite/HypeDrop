'use client';

import { Toaster as Sonner, type ToasterProps } from 'sonner';

export function Toaster(props: ToasterProps) {
  return (
    <Sonner
      position="bottom-right"
      toastOptions={{
        style: {
          background: 'var(--popover)',
          color: 'var(--popover-foreground)',
          border: '1px solid var(--border)',
        },
        classNames: {
          toast:
            'group rounded-[14px] font-sans text-sm shadow-lg shadow-slate-950/5 dark:shadow-black/35',
          title: 'font-semibold text-foreground',
          description: 'text-xs text-muted-foreground',
          actionButton:
            'rounded-[8px] bg-primary text-primary-foreground text-xs font-medium px-3 py-1.5',
          cancelButton:
            'rounded-[8px] bg-secondary text-secondary-foreground text-xs font-medium px-3 py-1.5',
        },
      }}
      {...props}
    />
  );
}
