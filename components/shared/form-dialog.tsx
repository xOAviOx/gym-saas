'use client';

import type { ReactNode } from 'react';
import { XIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { copy } from '@/lib/copy';

/** One accessible dialog, presented as a bottom sheet on narrow screens. */
export function FormDialog({
  title,
  description,
  trigger,
  children,
  open,
  onOpenChange,
}: {
  title: string;
  description: string;
  trigger: ReactNode;
  children: ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        showCloseButton={false}
        className="pb-safe top-auto right-0 bottom-0 left-0 max-h-[90dvh] w-full max-w-none translate-x-0 translate-y-0 gap-5 overflow-y-auto rounded-t-2xl rounded-b-none p-5 sm:top-1/2 sm:right-auto sm:bottom-auto sm:left-1/2 sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:p-6"
      >
        <DialogHeader className="pr-10">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogClose asChild>
          <Button
            size="icon"
            variant="ghost"
            className="absolute top-2 right-2"
            aria-label={copy.common.close}
          >
            <XIcon aria-hidden="true" />
          </Button>
        </DialogClose>
        {children}
      </DialogContent>
    </Dialog>
  );
}
