'use client';

import Image from 'next/image';
import { useState } from 'react';

import { QrCodeIcon, Share2Icon } from '@/components/icons';
import { CopyButton } from '@/components/shared/copy-button';
import { FormDialog } from '@/components/shared/form-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { copy } from '@/lib/copy';

export function UpiQrDialog({
  qr,
  amount,
  payee,
  vpa,
}: {
  /** SVG data URL rendered on the server. */
  qr: string;
  amount: string;
  payee: string;
  vpa: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <FormDialog
      open={open}
      onOpenChange={setOpen}
      title={copy.upiCollect.title}
      description={copy.upiCollect.body(amount)}
      trigger={
        <Button variant="outline" className="flex-1 sm:flex-none">
          <QrCodeIcon aria-hidden="true" />
          {copy.upiCollect.show}
        </Button>
      }
    >
      <div className="grid justify-items-center gap-4 text-center">
        <div className="rounded-xl border bg-white p-3">
          <Image
            src={qr}
            alt={copy.upiCollect.qrAlt(amount)}
            width={256}
            height={256}
            unoptimized
            className="size-64"
          />
        </div>
        <p className="tabular text-3xl leading-tight font-semibold tracking-tight">{amount}</p>
        <p className="text-muted-foreground text-sm break-all">
          {copy.upiCollect.payee(payee, vpa)}
        </p>
        <p className="bg-muted rounded-lg px-4 py-3 text-sm">{copy.upiCollect.afterPay}</p>
      </div>
    </FormDialog>
  );
}

export function PayLinkDialog({
  url,
  expires,
  whatsappUrl,
}: {
  url: string;
  expires: string;
  /** Present only when the member has agreed to WhatsApp messages. */
  whatsappUrl: string | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <FormDialog
      open={open}
      onOpenChange={setOpen}
      title={copy.payLink.title}
      description={copy.payLink.body}
      trigger={
        <Button variant="outline" className="flex-1 sm:flex-none">
          <Share2Icon aria-hidden="true" />
          {copy.payLink.share}
        </Button>
      }
    >
      <div className="grid gap-4">
        <div className="grid gap-1.5">
          <label htmlFor="pay-link-url" className="text-sm font-medium">
            {copy.payLink.linkLabel}
          </label>
          <Input
            id="pay-link-url"
            readOnly
            value={url}
            onFocus={(event) => event.currentTarget.select()}
            className="text-muted-foreground font-mono text-sm md:text-xs"
          />
          <p className="text-muted-foreground text-xs">{copy.payLink.expires(expires)}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <CopyButton value={url} label={copy.payLink.copy} copiedMessage={copy.payLink.copied} />
          {whatsappUrl ? (
            <Button asChild>
              <a href={whatsappUrl} target="_blank" rel="noopener noreferrer">
                {copy.payLink.whatsapp}
              </a>
            </Button>
          ) : null}
        </div>
        {!whatsappUrl ? (
          <p className="text-muted-foreground text-sm">{copy.payLink.noConsent}</p>
        ) : null}
      </div>
    </FormDialog>
  );
}
