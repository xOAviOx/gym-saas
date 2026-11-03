'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import { DownloadIcon, QrCodeIcon } from '@/components/icons';
import { applyActionResult } from '@/components/shared/apply-action-result';
import { CopyButton } from '@/components/shared/copy-button';
import { FormDialog } from '@/components/shared/form-dialog';
import { SubmitButton } from '@/components/shared/submit-button';
import { Button } from '@/components/ui/button';
import { resetMemberQr } from '@/features/attendance/actions';
import { copy } from '@/lib/copy';
import { waMeUrl } from '@/lib/phone';

export function MemberQrDialog({
  memberId,
  name,
  code,
  gym,
  phone,
  consentMessaging,
  qrSrc,
  cardUrl,
}: {
  memberId: string;
  name: string;
  code: string;
  gym: string;
  phone: string;
  consentMessaging: boolean;
  qrSrc: string;
  cardUrl: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);

  async function reset() {
    setPending(true);
    try {
      if (applyActionResult(await resetMemberQr({ memberId }))) {
        toast.success(copy.memberQr.resetDone);
        setConfirming(false);
        router.refresh();
      }
    } catch {
      toast.error(copy.errors.network);
    }
    setPending(false);
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={(value) => {
        if (pending) return;
        setOpen(value);
        if (!value) setConfirming(false);
      }}
      title={copy.memberQr.title}
      description={copy.memberQr.body}
      trigger={
        <Button variant="outline" className="flex-1 sm:flex-none">
          <QrCodeIcon aria-hidden="true" />
          {copy.memberQr.show}
        </Button>
      }
    >
      <div className="grid justify-items-center gap-3">
        <div className="rounded-xl border bg-white p-3">
          <Image
            src={qrSrc}
            alt={copy.memberQr.qrAlt(name)}
            width={224}
            height={224}
            unoptimized
            className="size-56"
          />
        </div>
        <p className="text-muted-foreground font-mono text-sm">{copy.memberQr.memberCode(code)}</p>
      </div>

      {confirming ? (
        <div className="bg-warning-soft grid gap-3 rounded-xl border p-4">
          <div>
            <p className="text-sm font-medium">{copy.memberQr.resetTitle}</p>
            <p className="text-muted-foreground mt-1 text-sm">{copy.memberQr.resetBody}</p>
          </div>
          <div className="flex gap-3">
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => setConfirming(false)}
              className="flex-1"
            >
              {copy.common.cancel}
            </Button>
            <SubmitButton
              type="button"
              pending={pending}
              pendingLabel={copy.common.saving}
              variant="destructive"
              onClick={reset}
              className="flex-1"
            >
              {copy.memberQr.reset}
            </SubmitButton>
          </div>
        </div>
      ) : (
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Button asChild variant="outline">
              <a href={qrSrc} download={`${code}-check-in-qr.png`}>
                <DownloadIcon aria-hidden="true" />
                {copy.memberQr.download}
              </a>
            </Button>
            <CopyButton
              value={cardUrl}
              label={copy.memberQr.copyLink}
              copiedMessage={copy.memberQr.copied}
            />
          </div>
          {consentMessaging ? (
            <Button asChild variant="outline">
              <a
                href={waMeUrl(phone, copy.memberQr.message(name, gym, cardUrl))}
                target="_blank"
                rel="noopener noreferrer"
              >
                {copy.memberQr.whatsapp}
              </a>
            </Button>
          ) : (
            <p className="text-muted-foreground text-xs">{copy.memberQr.noConsent}</p>
          )}
          <Button
            variant="ghost"
            className="text-destructive justify-self-start"
            onClick={() => setConfirming(true)}
          >
            {copy.memberQr.reset}
          </Button>
        </div>
      )}
    </FormDialog>
  );
}
