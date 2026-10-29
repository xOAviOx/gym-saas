'use client';

import type { ComponentProps } from 'react';

import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

type SubmitButtonProps = ComponentProps<typeof Button> & {
  pending?: boolean;
  pendingLabel?: string;
};

/** Primary form button that shows progress and blocks double submits. */
export function SubmitButton({
  pending = false,
  pendingLabel,
  children,
  disabled,
  type = 'submit',
  ...props
}: SubmitButtonProps) {
  return (
    <Button type={type} disabled={disabled || pending} aria-busy={pending} {...props}>
      {pending ? <Spinner /> : null}
      {pending && pendingLabel ? pendingLabel : children}
    </Button>
  );
}
