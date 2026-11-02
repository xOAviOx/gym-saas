import { randomUUID } from 'node:crypto';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';

import { AttendanceHeatmap } from '@/components/members/attendance-heatmap';
import { EditMember } from '@/components/members/edit-member';
import { MemberActivity } from '@/components/members/member-activity';
import { MemberNotes } from '@/components/members/member-notes';
import { MemberPhoto } from '@/components/members/member-photo';
import { EnrollmentDialog, FreezeControls } from '@/components/memberships/membership-controls';
import { ConfirmAction } from '@/components/shared/confirm-action';
import { EmptyState } from '@/components/shared/empty-state';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { deleteMember, restoreMember } from '@/features/members/actions';
import { buildMemberActivity } from '@/features/members/activity';
import { membershipHint } from '@/features/members/presentation';
import {
  getMember,
  getMemberActivity,
  getMemberMemberships,
  getMemberPhotoUrl,
} from '@/features/members/queries';
import type { MemberDetailsInput } from '@/features/members/schema';
import { getPlans } from '@/features/plans/queries';
import { can } from '@/lib/auth/roles';
import { requireOrg } from '@/lib/auth/session';
import { copy } from '@/lib/copy';
import {
  addDays,
  dateOnlyInIST,
  formatDate,
  formatDateTime,
  relativeDueDate,
  todayIST,
} from '@/lib/dates';
import {
  currentMembership,
  effectiveEndDate,
  membershipState,
  renewalStartDate,
} from '@/lib/membership';
import { formatMoney, sumPaise } from '@/lib/money';
import { formatPhone, telUrl, waMeUrl } from '@/lib/phone';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: copy.members.details };

export default async function MemberPage({
  params,
  searchParams,
}: {
  params: Promise<{ memberId: string }>;
  searchParams: Promise<{ action?: string }>;
}) {
  const ctx = await requireOrg();
  const [{ memberId }, query] = await Promise.all([params, searchParams]);
  if (!z.uuid().safeParse(memberId).success) notFound();
  const supabase = await createClient();
  const member = await getMember(supabase, ctx.org.id, memberId);
  if (!member || (member.deleted_at && !can.deleteMembers(ctx.role))) notFound();
  const today = todayIST();
  const [memberships, activity, plans, photoUrl] = await Promise.all([
    getMemberMemberships(supabase, ctx.org.id, member.id),
    getMemberActivity(supabase, ctx.org.id, member.id, today),
    getPlans(supabase, ctx.org.id, true),
    getMemberPhotoUrl(supabase, ctx.org.id, member.id, member.photo_url),
  ]);
  const current = currentMembership(memberships, today);
  const state = current ? membershipState(current, today) : 'new';
  const balance = sumPaise(activity.invoices.map((i) => i.balanceDue));
  const recentActivity = buildMemberActivity({
    createdAt: member.created_at,
    memberships,
    payments: activity.payments,
    attendance: activity.attendance,
  });
  const values: MemberDetailsInput = {
    fullName: member.full_name,
    phone: member.phone,
    altPhone: member.alt_phone ?? '',
    email: member.email ?? '',
    gender: (member.gender as MemberDetailsInput['gender']) ?? '',
    dob: member.dob ?? '',
    address: member.address ?? '',
    joinedOn: member.joined_on,
    source: member.source,
    emergencyContactName: member.emergency_contact_name ?? '',
    emergencyContactPhone: member.emergency_contact_phone ?? '',
    notes: member.notes ?? '',
    tags: member.tags.join(', '),
    consentMessaging: member.consent_messaging,
  };
  const readOnly = !!member.deleted_at;
  return (
    <>
      <Link href="/members" className="text-primary mb-4 inline-flex min-h-11 items-center text-sm">
        {copy.members.back}
      </Link>
      <header className="mb-5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl break-words md:text-3xl">{member.full_name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <span className="text-muted-foreground text-sm">{member.member_code}</span>
            <StatusBadge status={state} />
          </div>
        </div>
        {!readOnly ? (
          <EditMember key={member.updated_at} memberId={member.id} values={values} today={today} />
        ) : null}
      </header>
      {readOnly ? (
        <section className="bg-warning-soft mb-5 grid gap-3 rounded-xl border p-4">
          <h2 className="text-base font-semibold">{copy.members.deletedTitle}</h2>
          <p className="text-muted-foreground text-sm">
            {copy.members.deletedBody(formatDate(addDays(dateOnlyInIST(member.deleted_at!), 30)))}
          </p>
          <div>
            <ConfirmAction
              label={copy.members.restore}
              description={copy.members.restoreHelp}
              success={copy.members.restored}
              action={restoreMember.bind(null, { memberId: member.id })}
            />
          </div>
        </section>
      ) : null}
      <div className="mb-6 flex gap-3">
        <Button asChild variant="outline" className="flex-1 sm:flex-none">
          <a href={telUrl(member.phone)}>{copy.members.call}</a>
        </Button>
        {member.consent_messaging && !readOnly ? (
          <Button asChild variant="outline" className="flex-1 sm:flex-none">
            <a href={waMeUrl(member.phone)} target="_blank" rel="noopener noreferrer">
              {copy.members.whatsapp}
            </a>
          </Button>
        ) : (
          <Button
            variant="outline"
            disabled
            title={copy.members.consentMissing}
            className="flex-1 sm:flex-none"
          >
            {copy.members.whatsapp}
          </Button>
        )}
      </div>
      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <section className="bg-card grid content-start gap-4 rounded-xl border p-5">
          <p className="text-muted-foreground text-xs font-medium">{copy.members.membership}</p>
          {current ? (
            <>
              <h2 className="text-xl">{current.planName}</h2>
              <div>
                <p className="text-sm">
                  {formatDate(current.start_date)} · {formatDate(effectiveEndDate(current, today))}
                </p>
                <p className="text-muted-foreground mt-1 text-sm">
                  {membershipHint(
                    {
                      status: state,
                      startDate: current.start_date,
                      endDate: effectiveEndDate(current, today),
                    },
                    today,
                  )}
                </p>
              </div>
              {current.sessions_total !== null ? (
                <p className="text-sm">
                  {copy.memberships.sessionsLeft(
                    Math.max(0, current.sessions_total - current.sessions_used),
                    current.sessions_total,
                  )}
                </p>
              ) : null}
              {current.frozen_from && current.frozen_to ? (
                <p className="text-info text-sm">
                  {current.frozen_from > today
                    ? copy.memberships.scheduledFreeze(
                        formatDate(current.frozen_from),
                        formatDate(current.frozen_to),
                      )
                    : copy.memberships.frozenThrough(formatDate(current.frozen_to))}
                </p>
              ) : null}
            </>
          ) : (
            <div>
              <h2 className="text-xl">{copy.members.noMembership}</h2>
              <p className="text-muted-foreground mt-2 text-sm">{copy.members.noMembershipBody}</p>
            </div>
          )}
          {!readOnly ? (
            <div className="flex flex-wrap gap-3">
              <EnrollmentDialog
                key={`enroll:${member.updated_at}:${memberships.length}:${query.action === 'renew'}`}
                memberId={member.id}
                plans={plans}
                startDate={renewalStartDate(memberships, today)}
                requestId={randomUUID()}
                gstEnabled={ctx.org.gst_enabled}
                hasMembership={!!current}
                preferredPlanId={current?.plan_id}
                initialOpen={query.action === 'renew'}
              />
              {current ? (
                <FreezeControls
                  key={`${current.id}:${current.updated_at}`}
                  memberId={member.id}
                  membership={current}
                  today={today}
                />
              ) : null}
            </div>
          ) : null}
        </section>
        <section
          id="member-dues"
          className="bg-card grid scroll-mt-6 content-start gap-4 rounded-xl border p-5"
        >
          <p className="text-muted-foreground text-xs font-medium">{copy.members.pendingDues}</p>
          <h2 className={`tabular text-3xl ${balance > 0 ? 'text-danger' : ''}`}>
            {formatMoney(balance)}
          </h2>
          {balance === 0 ? (
            <p className="text-muted-foreground text-sm">{copy.members.nothingDue}</p>
          ) : (
            <ul className="grid gap-3">
              {activity.invoices.map((invoice) => (
                <li key={invoice.id} className="flex justify-between gap-3 text-sm">
                  <div>
                    <p className="font-medium">{invoice.number}</p>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {relativeDueDate(invoice.dueDate, today).label}
                    </p>
                  </div>
                  <span className="tabular">{formatMoney(invoice.balanceDue)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <Tabs defaultValue="memberships">
        <TabsList className="mb-4 flex h-auto min-h-11 w-full overflow-x-auto">
          <TabsTrigger value="memberships" className="min-h-11 flex-1">
            {copy.members.membership}
          </TabsTrigger>
          <TabsTrigger value="payments" className="min-h-11 flex-1">
            {copy.members.payments}
          </TabsTrigger>
          <TabsTrigger value="attendance" className="min-h-11 flex-1">
            {copy.members.attendance}
          </TabsTrigger>
          <TabsTrigger value="notes" className="min-h-11 flex-1">
            {copy.members.notes}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="memberships">
          {memberships.length ? (
            <ul className="grid gap-3">
              {memberships.map((m) => (
                <li
                  key={m.id}
                  className="bg-card flex items-start justify-between gap-4 rounded-xl border p-4"
                >
                  <div>
                    <h3 className="text-sm font-semibold">{m.planName}</h3>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {formatDate(m.start_date)} · {formatDate(effectiveEndDate(m, today))}
                    </p>
                    <p className="tabular mt-3 text-sm">{formatMoney(m.finalAmount)}</p>
                  </div>
                  <StatusBadge status={membershipState(m, today)} />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title={copy.members.noMembershipHistory} />
          )}
        </TabsContent>
        <TabsContent value="payments">
          {activity.payments.length ? (
            <ul className="bg-card divide-y rounded-xl border">
              {activity.payments.map((p) => (
                <li key={p.id} className="flex items-start justify-between gap-3 p-4">
                  <div>
                    <p className="text-sm font-medium">
                      {copy.members.paymentMethod[p.method]}
                      {p.isReversal ? ` · ${copy.members.reversal}` : ''}
                    </p>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {p.invoiceNumber} · {formatDateTime(p.paidAt)}
                    </p>
                    {p.reference ? (
                      <p className="text-muted-foreground mt-1 text-xs break-all">
                        {copy.members.reference}: {p.reference}
                      </p>
                    ) : null}
                  </div>
                  <span className="tabular shrink-0 text-sm font-medium">
                    {formatMoney(p.amount)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title={copy.members.noPayments} body={copy.members.noPaymentsBody} />
          )}
        </TabsContent>
        <TabsContent value="attendance">
          <div className="bg-card rounded-xl border p-5">
            <AttendanceHeatmap timestamps={activity.attendance} today={today} />
          </div>
        </TabsContent>
        <TabsContent value="notes">
          <div className="bg-card rounded-xl border p-5">
            <MemberNotes memberId={member.id} notes={member.notes ?? ''} readOnly={readOnly} />
          </div>
        </TabsContent>
      </Tabs>
      <MemberActivity items={recentActivity} />
      <details className="bg-card mt-6 rounded-xl border p-5">
        <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">
          {copy.members.profile}
        </summary>
        <div className="mt-5 grid gap-5">
          <MemberPhoto
            memberId={member.id}
            fullName={member.full_name}
            url={photoUrl}
            readOnly={readOnly}
          />
          <dl className="grid gap-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">{copy.members.phone}</dt>
              <dd>{formatPhone(member.phone)}</dd>
            </div>
            {member.email ? (
              <div className="flex flex-wrap justify-between gap-4">
                <dt className="text-muted-foreground">{copy.members.email}</dt>
                <dd className="break-all">{member.email}</dd>
              </div>
            ) : null}
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">{copy.members.memberSince}</dt>
              <dd>{formatDate(member.joined_on)}</dd>
            </div>
            {member.gender ? (
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">{copy.members.gender}</dt>
                <dd>{copy.members.genders[member.gender as 'male' | 'female' | 'other']}</dd>
              </div>
            ) : null}
            {member.dob ? (
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">{copy.members.dob}</dt>
                <dd>{formatDate(member.dob)}</dd>
              </div>
            ) : null}
            {member.address ? (
              <div className="grid gap-1">
                <dt className="text-muted-foreground">{copy.members.address}</dt>
                <dd className="whitespace-pre-wrap">{member.address}</dd>
              </div>
            ) : null}
            {member.emergency_contact_name ? (
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">{copy.members.emergencyContactName}</dt>
                <dd>{member.emergency_contact_name}</dd>
              </div>
            ) : null}
            {member.emergency_contact_phone ? (
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">{copy.members.emergencyContactPhone}</dt>
                <dd>{formatPhone(member.emergency_contact_phone)}</dd>
              </div>
            ) : null}
          </dl>
          {member.tags.length ? (
            <div className="flex flex-wrap gap-2">
              {member.tags.map((tag) => (
                <span key={tag} className="bg-muted rounded-full px-3 py-1 text-xs">
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
          <p className="text-muted-foreground text-xs">
            {member.consent_messaging && member.consent_recorded_at
              ? copy.members.consentRecorded(formatDateTime(member.consent_recorded_at))
              : copy.members.consentMissing}
          </p>
        </div>
      </details>
      {!readOnly && can.deleteMembers(ctx.role) ? (
        <div className="mt-8 border-t pt-5">
          <ConfirmAction
            label={copy.members.delete}
            description={copy.members.deleteHelp}
            success={copy.members.deleted}
            action={deleteMember.bind(null, { memberId: member.id })}
            redirectTo="/members"
            destructive
          />
        </div>
      ) : null}
    </>
  );
}
