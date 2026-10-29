import { FileSpreadsheetIcon, UserPlusIcon } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { copy } from '@/lib/copy';

const t = copy.onboarding.firstMember;

export function FirstMemberStep() {
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Link
          href="/members/import"
          className="group bg-card hover:border-primary focus-visible:ring-ring/40 flex flex-col gap-3 rounded-xl border p-5 transition-colors duration-150 outline-none focus-visible:ring-3"
        >
          <span className="bg-success-soft text-success inline-flex size-11 items-center justify-center rounded-lg">
            <FileSpreadsheetIcon aria-hidden="true" />
          </span>
          <span className="grid gap-1">
            <span className="text-base font-semibold">{t.importTitle}</span>
            <span className="text-muted-foreground text-sm">{t.importBody}</span>
          </span>
        </Link>
        <Link
          href="/members/new"
          className="group bg-card hover:border-primary focus-visible:ring-ring/40 flex flex-col gap-3 rounded-xl border p-5 transition-colors duration-150 outline-none focus-visible:ring-3"
        >
          <span className="bg-success-soft text-success inline-flex size-11 items-center justify-center rounded-lg">
            <UserPlusIcon aria-hidden="true" />
          </span>
          <span className="grid gap-1">
            <span className="text-base font-semibold">{t.addTitle}</span>
            <span className="text-muted-foreground text-sm">{t.addBody}</span>
          </span>
        </Link>
      </div>
      <Button asChild variant="ghost" className="justify-self-start">
        <Link href="/today">{t.skip}</Link>
      </Button>
    </div>
  );
}
