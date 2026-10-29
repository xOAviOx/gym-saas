import { AlertCircleIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';

type InlineErrorProps = {
  title: string;
  body?: string;
  action?: ReactNode;
};

export function InlineError({ title, body, action }: InlineErrorProps) {
  return (
    <Alert variant="destructive">
      <AlertCircleIcon aria-hidden="true" />
      <AlertTitle>{title}</AlertTitle>
      {body ? <AlertDescription>{body}</AlertDescription> : null}
      {action ? <AlertAction>{action}</AlertAction> : null}
    </Alert>
  );
}
