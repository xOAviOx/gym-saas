'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { toast } from 'sonner';

import { applyActionResult } from '@/components/shared/apply-action-result';
import { ConfirmAction } from '@/components/shared/confirm-action';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { saveMemberPhoto } from '@/features/members/actions';
import { copy } from '@/lib/copy';

export function MemberPhoto({
  memberId,
  fullName,
  url,
  readOnly = false,
}: {
  memberId: string;
  fullName: string;
  url: string | null;
  readOnly?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const initials = fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0])
    .join('')
    .toUpperCase();
  async function upload(file: File) {
    if (
      !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
      file.size > 5 * 1024 * 1024
    ) {
      toast.error(copy.members.photoInvalid);
      return;
    }
    const data = new FormData();
    data.set('memberId', memberId);
    data.set('photo', file);
    setPending(true);
    try {
      if (applyActionResult(await saveMemberPhoto(data))) {
        toast.success(copy.members.photoSaved);
        router.refresh();
      }
    } catch {
      toast.error(copy.errors.network);
    }
    setPending(false);
    if (input.current) input.current.value = '';
  }
  function remove() {
    const data = new FormData();
    data.set('memberId', memberId);
    return saveMemberPhoto(data);
  }
  return (
    <div className="flex flex-wrap items-center gap-4">
      <Avatar className="size-16 rounded-2xl">
        <AvatarImage src={url ?? undefined} alt={fullName} />
        <AvatarFallback className="rounded-2xl text-xl">{initials}</AvatarFallback>
      </Avatar>
      {!readOnly ? (
        <div className="grid gap-2">
          <div className="flex flex-wrap gap-2">
            <input
              ref={input}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              aria-label={copy.members.photo}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void upload(file);
              }}
            />
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => input.current?.click()}
            >
              {pending ? copy.common.saving : copy.members.uploadPhoto}
            </Button>
            {url ? (
              <ConfirmAction
                label={copy.members.removePhoto}
                description={copy.members.photoRemoveHelp}
                success={copy.members.photoSaved}
                action={remove}
                destructive
              />
            ) : null}
          </div>
          <p className="text-muted-foreground text-xs">{copy.members.photoHelp}</p>
        </div>
      ) : null}
    </div>
  );
}
