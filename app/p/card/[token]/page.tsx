import type { Metadata } from 'next';
import Image from 'next/image';

import { readMemberQr } from '@/features/attendance/member-qr';
import { copy } from '@/lib/copy';
import { qrDataUrl } from '@/lib/qr';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: copy.memberQr.cardTitle,
  robots: { index: false, follow: false },
  // The URL is the member's check-in code; never send it to another site.
  referrer: 'no-referrer',
};

async function loadCard(token: string) {
  const decoded = readMemberQr(token);
  if (!decoded) return null;
  const { data, error } = await createAdminClient()
    .from('members')
    .select('full_name,member_code,qr_version,deleted_at,organizations!inner(name)')
    .eq('id', decoded.memberId)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.deleted_at || data.qr_version !== decoded.version) return null;
  return { name: data.full_name, code: data.member_code, gym: data.organizations.name };
}

export default async function MemberCardPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const card = await loadCard(decodeURIComponent(token));

  return (
    <main className="bg-background grid min-h-dvh place-items-center px-4 py-10">
      {card ? (
        <section className="bg-card animate-enter grid w-full max-w-sm justify-items-center gap-5 rounded-xl border p-6 text-center sm:p-8">
          <div>
            <p className="text-muted-foreground text-[11px] font-medium tracking-[0.05em] uppercase">
              {copy.memberQr.cardTitle}
            </p>
            <h1 className="mt-2 font-serif text-3xl leading-[1.1] tracking-[-0.02em]">
              {card.gym}
            </h1>
          </div>
          <div className="rounded-xl border bg-white p-3">
            <Image
              src={await qrDataUrl(decodeURIComponent(token))}
              alt={copy.memberQr.qrAlt(card.name)}
              width={256}
              height={256}
              unoptimized
              className="size-64"
            />
          </div>
          <div>
            <p className="text-lg font-medium">{card.name}</p>
            <p className="text-muted-foreground font-mono text-sm">
              {copy.memberQr.memberCode(card.code)}
            </p>
          </div>
          <p className="text-muted-foreground text-sm">{copy.memberQr.cardBody}</p>
        </section>
      ) : (
        <section className="bg-card grid w-full max-w-sm gap-2 rounded-xl border p-6 text-center">
          <h1 className="font-serif text-3xl leading-[1.1] tracking-[-0.02em]">
            {copy.memberQr.cardInvalidTitle}
          </h1>
          <p className="text-muted-foreground text-sm">{copy.memberQr.cardInvalidBody}</p>
        </section>
      )}
    </main>
  );
}
