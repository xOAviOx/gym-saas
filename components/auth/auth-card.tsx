import type { ReactNode } from 'react';

type AuthCardProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
};

export function AuthCard({ title, subtitle, children, footer }: AuthCardProps) {
  return (
    <div className="bg-card rounded-xl border p-6">
      <h1 className="text-2xl">{title}</h1>
      {subtitle ? <p className="text-muted-foreground mt-1 text-sm">{subtitle}</p> : null}
      <div className="mt-6">{children}</div>
      {footer ? (
        <div className="text-muted-foreground mt-6 text-center text-sm">{footer}</div>
      ) : null}
    </div>
  );
}
