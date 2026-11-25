'use client';

import { Toaster as Sonner, type ToasterProps } from 'sonner';

export function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="dark"
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast:
            'group rounded-[12px] border border-border bg-popover text-popover-foreground font-sans text-sm shadow-none',
          title: 'font-medium text-foreground',
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
