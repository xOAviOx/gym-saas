'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { CopyButton } from '@/components/shared/copy-button';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { changeTeamRole, issueTeamInvite, setTeamActive } from '@/features/team/actions';
import { copy } from '@/lib/copy';

type Member = {
  id: string;
  userId: string;
  role: string;
  active: boolean;
  name: string;
  email: string;
};
type Invite = { id: string; email: string; role: string; expiresAt: string };

export function TeamManager({
  members,
  invites,
  currentUserId,
}: {
  members: Member[];
  invites: Invite[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'manager' | 'staff'>('staff');
  const [url, setUrl] = useState('');
  const [pending, setPending] = useState(false);
  async function invite() {
    setPending(true);
    try {
      const result = await issueTeamInvite({ email, role });
      if (result.ok) {
        setUrl(result.data.url);
        setEmail('');
        toast.success(copy.team.invited);
        router.refresh();
      } else toast.error(result.error);
    } catch {
      toast.error(copy.errors.network);
    }
    setPending(false);
  }
  async function change(id: string, next: 'manager' | 'staff') {
    const result = await changeTeamRole({ id, role: next });
    if (result.ok) {
      toast.success(copy.team.updated);
      router.refresh();
    } else toast.error(result.error);
  }
  async function toggle(id: string, active: boolean) {
    const result = await setTeamActive({ id, active });
    if (result.ok) {
      toast.success(copy.team.updated);
      router.refresh();
    } else toast.error(result.error);
  }
  return (
    <div className="grid gap-5">
      <section className="bg-card grid gap-4 rounded-xl border p-5">
        <h2 className="text-lg font-semibold">{copy.team.inviteTitle}</h2>
        <div className="grid gap-2">
          <Label htmlFor="invite-email">{copy.members.email}</Label>
          <Input
            id="invite-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="invite-role">{copy.team.role}</Label>
          <Select value={role} onValueChange={(value) => setRole(value as 'manager' | 'staff')}>
            <SelectTrigger id="invite-role">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="staff">{copy.team.staff}</SelectItem>
              <SelectItem value="manager">{copy.team.manager}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button
          type="button"
          disabled={pending || !email}
          onClick={invite}
          className="justify-self-start"
        >
          {copy.team.createInvite}
        </Button>
        {url ? (
          <div className="grid gap-2">
            <p className="text-muted-foreground text-xs break-all">{url}</p>
            <CopyButton value={url} label={copy.team.copyInvite} />
          </div>
        ) : null}
        <p className="text-muted-foreground text-xs">{copy.team.inviteHelp}</p>
      </section>
      <section className="bg-card rounded-xl border p-5">
        <h2 className="mb-4 text-lg font-semibold">{copy.team.members}</h2>
        <ul className="divide-border divide-y">
          {members.map((member) => (
            <li
              key={member.id}
              className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
            >
              <div>
                <p className="font-medium">
                  {member.name || member.email || copy.team.unnamed(member.userId.slice(0, 8))}
                </p>
                {member.email ? <p className="text-muted-foreground">{member.email}</p> : null}
              </div>
              <div className="flex items-center gap-2">
                {member.role === 'owner' || member.userId === currentUserId ? (
                  <span className="capitalize">{member.role}</span>
                ) : (
                  <>
                    <Select
                      value={member.role}
                      onValueChange={(value) => change(member.id, value as 'manager' | 'staff')}
                    >
                      <SelectTrigger className="w-32" aria-label={copy.team.role}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="staff">{copy.team.staff}</SelectItem>
                        <SelectItem value="manager">{copy.team.manager}</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => toggle(member.id, !member.active)}
                    >
                      {member.active ? copy.team.deactivate : copy.team.activate}
                    </Button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>
      {invites.length ? (
        <section className="bg-card rounded-xl border p-5">
          <h2 className="mb-3 text-lg font-semibold">{copy.team.pending}</h2>
          <ul className="grid gap-2 text-sm">
            {invites.map((invite) => (
              <li key={invite.id} className="flex justify-between gap-3">
                <span>{invite.email}</span>
                <span className="text-muted-foreground capitalize">{invite.role}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
