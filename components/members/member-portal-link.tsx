'use client';

import { useState } from 'react';
import { toast } from 'sonner';

import { CopyButton } from '@/components/shared/copy-button';
import { Button } from '@/components/ui/button';
import { issuePortalLink, revokePortalLinks } from '@/features/portal/actions';
import { copy } from '@/lib/copy';
import { waMeUrl } from '@/lib/phone';

export function MemberPortalLink({
  memberId,
  phone,
  consentMessaging,
}: {
  memberId: string;
  phone: string;
  consentMessaging: boolean;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function issue() {
    setPending(true);
    try {
      const result = await issuePortalLink({ memberId });
      if (result.ok) {
        setUrl(result.data.url);
        toast.success(copy.portal.linkCreated);
      } else toast.error(result.error);
    } catch {
      toast.error(copy.errors.network);
    }
    setPending(false);
  }

  async function revoke() {
    setPending(true);
    try {
      const result = await revokePortalLinks({ memberId });
      if (result.ok) {
        setUrl(null);
        toast.success(copy.portal.linksRevoked);
      } else toast.error(result.error);
    } catch {
      toast.error(copy.errors.network);
    }
    setPending(false);
  }

  return (
    <section className="bg-card mt-5 grid gap-3 rounded-xl border p-5">
      <h2 className="text-base font-semibold">{copy.portal.shareTitle}</h2>
      <p className="text-muted-foreground text-sm">{copy.portal.shareBody}</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={pending} onClick={issue}>
          {copy.portal.createLink}
        </Button>
        <Button type="button" variant="ghost" disabled={pending} onClick={revoke}>
          {copy.portal.revokeLinks}
        </Button>
      </div>
      {url ? (
        <div className="grid gap-2">
          <p className="text-muted-foreground text-xs break-all">{url}</p>
          <div className="flex flex-wrap gap-2">
            <CopyButton value={url} label={copy.portal.copyLink} />
            {consentMessaging ? (
              <Button asChild variant="outline">
                <a
                  href={waMeUrl(phone, copy.portal.whatsappMessage(url))}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {copy.portal.sendWhatsApp}
                </a>
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
      <p className="text-muted-foreground text-xs">{copy.portal.localWarning}</p>
    </section>
  );
}
