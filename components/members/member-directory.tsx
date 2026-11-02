'use client';

import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from '@tanstack/react-table';
import { SearchIcon, UsersIcon } from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';

import { EmptyState } from '@/components/shared/empty-state';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { MemberFilter } from '@/features/members/schema';
import { memberQuickAction, membershipHint } from '@/features/members/presentation';
import type { DirectoryMember, DirectoryOverview } from '@/features/members/types';
import { MEMBER_PAGE_SIZE } from '@/features/members/queries-constants';
import { copy } from '@/lib/copy';
import { formatDate } from '@/lib/dates';
import { formatMoney } from '@/lib/money';
import { formatPhoneNational } from '@/lib/phone';
import { cn } from '@/lib/utils';

function directoryUrl(q: string, filter: MemberFilter, page = 1) {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (filter !== 'all') params.set('filter', filter);
  if (page > 1) params.set('page', String(page));
  return `/members${params.size ? `?${params}` : ''}`;
}

function directoryColumns(today: string): ColumnDef<DirectoryMember>[] {
  return [
    {
      accessorKey: 'fullName',
      header: copy.members.details,
      cell: ({ row }) => (
        <Link
          href={`/members/${row.original.id}`}
          className="focus-visible:ring-ring/40 block rounded-lg py-2 outline-none focus-visible:ring-3"
        >
          <span className="font-medium">{row.original.fullName}</span>
          <span className="text-muted-foreground mt-1 block text-xs">
            {row.original.memberCode} · {formatPhoneNational(row.original.phone)}
          </span>
        </Link>
      ),
    },
    {
      accessorKey: 'status',
      header: copy.members.membership,
      cell: ({ row }) => (
        <div className="grid justify-items-start gap-1.5">
          <StatusBadge status={row.original.status} />
          {row.original.planName ? (
            <span className="text-muted-foreground text-xs">{row.original.planName}</span>
          ) : null}
        </div>
      ),
    },
    {
      accessorKey: 'endDate',
      header: copy.memberships.endDate,
      cell: ({ row }) => (
        <div className="text-sm">
          <p>
            {row.original.endDate ? formatDate(row.original.endDate) : copy.members.noMembership}
          </p>
          {row.original.endDate ? (
            <p className="text-muted-foreground mt-1 text-xs">
              {membershipHint(row.original, today)}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      accessorKey: 'balanceDue',
      header: copy.members.pendingDues,
      cell: ({ row }) => (
        <span className={cn('tabular font-medium', row.original.balanceDue > 0 && 'text-danger')}>
          {formatMoney(row.original.balanceDue)}
        </span>
      ),
    },
    {
      id: 'actions',
      header: copy.members.actions,
      cell: ({ row }) => <QuickAction member={row.original} />,
    },
  ];
}

function QuickAction({ member }: { member: DirectoryMember }) {
  const action = memberQuickAction(member);
  if (!action) return null;
  return (
    <Button asChild variant="outline" className="shrink-0 whitespace-normal">
      <Link href={action.href} aria-label={copy.members.actionFor(action.label, member.fullName)}>
        {action.label}
      </Link>
    </Button>
  );
}

export function MemberDirectory({
  members,
  total,
  overview,
  today,
  q,
  filter,
  page,
  canRestore,
}: {
  members: DirectoryMember[];
  total: number;
  overview: DirectoryOverview;
  today: string;
  q: string;
  filter: MemberFilter;
  page: number;
  canRestore: boolean;
}) {
  'use no memo';
  const columns = useMemo(() => directoryColumns(today), [today]);
  // TanStack's mutable table instance must stay outside React Compiler memoization.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: members,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    rowCount: total,
    state: { pagination: { pageIndex: page - 1, pageSize: MEMBER_PAGE_SIZE } },
  });
  const pages = Math.max(1, Math.ceil(total / MEMBER_PAGE_SIZE));
  const rows = table.getRowModel().rows;
  const filters = Object.entries(copy.members.filters).filter(
    ([key]) => canRestore || key !== 'deleted',
  ) as [MemberFilter, string][];
  const overviewCards = [
    { filter: 'expiring', title: copy.members.expiringOverview },
    { filter: 'expired', title: copy.members.expiredOverview },
    { filter: 'dues', title: copy.members.duesOverview },
  ] as const;
  return (
    <div className="grid gap-4">
      {filter !== 'deleted' ? (
        <section aria-label={copy.members.overviewTitle} className="grid gap-3">
          <div>
            <h2 className="text-sm font-semibold">{copy.members.overviewTitle}</h2>
            <p className="text-muted-foreground mt-1 text-xs">{copy.members.overviewHelp}</p>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {overviewCards.map((card) => (
              <Link
                key={card.filter}
                href={directoryUrl(q, card.filter)}
                aria-current={filter === card.filter ? 'page' : undefined}
                className={cn(
                  'bg-card hover:border-primary/50 focus-visible:ring-ring/40 grid min-w-0 content-start gap-2 rounded-xl border p-3 transition-colors outline-none focus-visible:ring-3 sm:p-4',
                  filter === card.filter && 'border-primary bg-success-soft',
                )}
              >
                <span className="text-muted-foreground min-h-8 min-w-0 text-xs break-words">
                  {card.title}
                </span>
                <span className="tabular min-w-0 text-xl font-semibold break-all sm:text-2xl">
                  {overview.counts[card.filter].toLocaleString('en-IN')}
                  {card.filter === 'dues' ? (
                    <span className="sr-only">
                      {' '}
                      {copy.members.overviewUnit(overview.counts.dues)}
                    </span>
                  ) : null}
                </span>
                <span className="text-muted-foreground min-w-0 text-xs break-words">
                  {card.filter === 'dues'
                    ? formatMoney(overview.balanceDue)
                    : copy.members.overviewUnit(overview.counts[card.filter])}
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
      <form method="get" action="/members" role="search" className="flex gap-2">
        {filter !== 'all' ? <input type="hidden" name="filter" value={filter} /> : null}
        <label htmlFor="member-search" className="sr-only">
          {copy.members.searchLabel}
        </label>
        <Input
          key={q}
          id="member-search"
          name="q"
          type="search"
          defaultValue={q}
          placeholder={copy.members.searchPlaceholder}
          maxLength={100}
          className="bg-card"
        />
        <Button type="submit" variant="outline" size="icon" aria-label={copy.members.search}>
          <SearchIcon aria-hidden="true" />
        </Button>
      </form>
      <nav
        aria-label={copy.members.filtersLabel}
        className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0"
      >
        {filters.map(([value, label]) => (
          <Link
            key={value}
            href={directoryUrl(q, value)}
            aria-current={filter === value ? 'page' : undefined}
            aria-label={copy.members.filterCount(label, overview.counts[value] ?? 0)}
            className={cn(
              'inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm transition-colors duration-150',
              filter === value
                ? 'bg-success-soft border-primary text-primary font-medium'
                : 'bg-card text-muted-foreground hover:border-zinc-400',
            )}
          >
            {label}
            <span className="bg-muted tabular ml-2 rounded-full px-1.5 py-0.5 text-xs">
              {(overview.counts[value] ?? 0).toLocaleString('en-IN')}
            </span>
          </Link>
        ))}
      </nav>
      <div className="text-muted-foreground flex flex-wrap justify-between gap-2 text-xs">
        <p role="status" aria-live="polite" aria-atomic="true">
          {copy.members.results(total)}
        </p>
        <p>{copy.members.sortHelp}</p>
      </div>
      {rows.length === 0 ? (
        <EmptyState
          icon={UsersIcon}
          title={
            filter === 'deleted'
              ? copy.members.deletedEmpty
              : total === 0 && !q && filter === 'all'
                ? copy.members.emptyTitle
                : copy.members.noResults
          }
          body={
            filter === 'deleted'
              ? copy.members.deletedEmptyBody
              : total === 0 && !q && filter === 'all'
                ? copy.members.emptyBody
                : copy.members.noResultsBody
          }
          action={
            q || filter !== 'all' ? (
              <Button variant="outline" asChild>
                <Link href="/members">{copy.members.clearFilters}</Link>
              </Button>
            ) : (
              <Button asChild>
                <Link href="/members/new">{copy.members.addMember}</Link>
              </Button>
            )
          }
        />
      ) : (
        <div className="bg-card overflow-hidden rounded-xl border">
          <ul className="divide-y xl:hidden">
            {rows.map(({ original: m }) => (
              <li key={m.id} className="p-4">
                <Link
                  href={`/members/${m.id}`}
                  className="focus-visible:ring-ring/40 block rounded-lg outline-none focus-visible:ring-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="min-w-0 truncate text-base font-semibold">{m.fullName}</span>
                    <StatusBadge status={m.status} />
                  </div>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {m.memberCode} · {formatPhoneNational(m.phone)}
                  </p>
                  <div className="mt-3 flex justify-between gap-3 text-sm">
                    <span className="text-muted-foreground min-w-0 truncate">
                      {m.planName ?? copy.members.noMembership}
                      {m.endDate ? ` · ${formatDate(m.endDate)}` : ''}
                    </span>
                    {m.balanceDue > 0 ? (
                      <span className="text-danger tabular shrink-0 font-medium">
                        {formatMoney(m.balanceDue)}
                      </span>
                    ) : null}
                  </div>
                </Link>
                {!m.deletedAt ? (
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <p className="text-muted-foreground min-w-0 text-xs">
                      {membershipHint(m, today)}
                    </p>
                    <QuickAction member={m} />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
          <table className="hidden w-full text-left xl:table">
            <thead className="text-muted-foreground bg-muted/30 border-b text-xs">
              {table.getHeaderGroups().map((group) => (
                <tr key={group.id}>
                  {group.headers.map((header) => (
                    <th key={header.id} scope="col" className="px-5 py-3 font-medium">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-muted/30">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-5 py-3 text-sm">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pages > 1 ? (
        <nav
          aria-label={copy.members.pagination}
          className="flex items-center justify-between gap-2"
        >
          {page > 1 ? (
            <Button asChild variant="outline">
              <Link href={directoryUrl(q, filter, page - 1)}>{copy.members.previous}</Link>
            </Button>
          ) : (
            <Button variant="outline" disabled>
              {copy.members.previous}
            </Button>
          )}
          <p className="text-muted-foreground text-xs">{copy.members.page(page, pages)}</p>
          {page < pages ? (
            <Button asChild variant="outline">
              <Link href={directoryUrl(q, filter, page + 1)}>{copy.members.next}</Link>
            </Button>
          ) : (
            <Button variant="outline" disabled>
              {copy.members.next}
            </Button>
          )}
        </nav>
      ) : null}
    </div>
  );
}
