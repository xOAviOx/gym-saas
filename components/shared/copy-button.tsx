'use client';

import { useState, type ComponentProps } from 'react';
import { toast } from 'sonner';

import { CheckIcon, CopyIcon } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { copy } from '@/lib/copy';

/** Copies text to the clipboard; on browsers that refuse, asks the user to copy by hand. */
export function CopyButton({
  value,
  label = copy.common.copy,
  copiedMessage = copy.common.copied,
  variant = 'outline',
  className,
}: {
  value: string;
  label?: string;
  copiedMessage?: string;
  variant?: ComponentProps<typeof Button>['variant'];
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  async function copyValue() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(copiedMessage);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(copy.payLink.copyFailed);
    }
  }
  return (
    <Button type="button" variant={variant} onClick={copyValue} className={className}>
      {copied ? <CheckIcon aria-hidden="true" /> : <CopyIcon aria-hidden="true" />}
      {label}
    </Button>
  );
}
