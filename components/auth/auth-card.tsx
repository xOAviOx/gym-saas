import type { ReactNode } from 'react';

type AuthCardProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
};

export function AuthCard({ title, subtitle, children, footer }: AuthCardProps) {
  return (
    <div className="bg-card border-border animate-enter rounded-xl border p-6 sm:p-8">
      <h1 className="font-serif text-3xl leading-[1.1] font-normal tracking-[-0.02em]">{title}</h1>
      {subtitle ? (
        <p className="text-muted-foreground leading-prose mt-2 text-sm">{subtitle}</p>
      ) : null}
      <div className="mt-6">{children}</div>
      {footer ? (
        <div className="text-muted-foreground mt-6 text-center text-sm">{footer}</div>
      ) : null}
    </div>
  );
}
