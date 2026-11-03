import Link from 'next/link';

import { FileSpreadsheetIcon, UserPlusIcon } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { copy } from '@/lib/copy';

const t = copy.onboarding.firstMember;

export function FirstMemberStep() {
  return (
    <div className="grid gap-4">
      <div className="animate-enter grid gap-3 [--index:1] sm:grid-cols-2">
        <Link
          href="/members/import"
          className="group bg-card hover:shadow-lift focus-visible:ring-ring/20 flex flex-col gap-4 rounded-xl border p-5 transition-shadow duration-200 outline-none focus-visible:ring-3 md:p-6"
        >
          <span className="bg-muted text-foreground inline-flex size-10 items-center justify-center rounded-md">
            <FileSpreadsheetIcon aria-hidden="true" />
          </span>
          <span className="grid gap-1">
            <span className="text-base font-semibold">{t.importTitle}</span>
            <span className="text-muted-foreground text-sm">{t.importBody}</span>
          </span>
        </Link>
        <Link
          href="/members/new"
          className="group bg-card hover:shadow-lift focus-visible:ring-ring/20 flex flex-col gap-4 rounded-xl border p-5 transition-shadow duration-200 outline-none focus-visible:ring-3 md:p-6"
        >
          <span className="bg-muted text-foreground inline-flex size-10 items-center justify-center rounded-md">
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
