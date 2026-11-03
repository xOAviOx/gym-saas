import type { Metadata, Viewport } from 'next';
import Link from 'next/link';

import { KioskScreen } from '@/components/attendance/kiosk-screen';
import { TabletIcon } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { currentKioskDevice } from '@/features/attendance/kiosk';
import { getUser } from '@/lib/auth/session';
import { copy } from '@/lib/copy';

export const metadata: Metadata = {
  title: copy.kiosk.title,
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: '#fbfbfa' };

export default async function KioskPage() {
  const device = await currentKioskDevice();
  if (device) {
    return <KioskScreen gymName={device.gymName} />;
  }

  const signedIn = (await getUser()) !== null;
  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <div className="animate-enter grid max-w-md justify-items-center gap-5 text-center">
        <span className="bg-muted text-muted-foreground grid size-14 place-items-center rounded-xl">
          <TabletIcon className="size-6" />
        </span>
        <h1 className="font-serif text-4xl leading-[1.1] tracking-[-0.02em]">
          {copy.kiosk.notPairedTitle}
        </h1>
        <p className="text-muted-foreground leading-relaxed">{copy.kiosk.notPairedBody}</p>
        <Button asChild>
          <Link href={signedIn ? '/attendance' : '/sign-in?next=/attendance'}>
            {signedIn ? copy.kiosk.goToAttendance : copy.kiosk.goToSignIn}
          </Link>
        </Button>
      </div>
    </main>
  );
}
