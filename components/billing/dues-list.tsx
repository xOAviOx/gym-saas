'use client';

import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from '@tanstack/react-table';
import { IndianRupeeIcon, SearchIcon } from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';

import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DUES_PAGE_SIZE, type DuesFilter } from '@/features/billing/schema';
import type { DuesRow, DuesSummary } from '@/features/billing/types';
import { copy } from '@/lib/copy';
import { formatDate, relativeDueDate } from '@/lib/dates';
import { formatMoney } from '@/lib/money';
import { formatPhoneNational } from '@/lib/phone';
import { cn } from '@/lib/utils';

import { InvoiceStatusBadge } from './invoice-status-badge';

function duesUrl(q: string, filter: DuesFilter, page = 1) {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (filter !== 'all') params.set('filter', filter);
  if (page > 1) params.set('page', String(page));
  return `/dues${params.size ? `?${params}` : ''}`;
}

function RowFlags({ row }: { row: DuesRow }) {
  if (!row.pendingClaims && !row.openLink) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {row.pendingClaims ? (
        <span className="bg-warning-soft text-warning inline-flex min-h-6 items-center rounded-full px-2.5 py-1 text-xs font-medium">
          {copy.dues.claimsBadge(row.pendingClaims)}
        </span>
      ) : null}
      {row.openLink ? (
        <span className="bg-info-soft text-info inline-flex min-h-6 items-center rounded-full px-2.5 py-1 text-xs font-medium">
          {copy.dues.linkBadge}
        </span>
      ) : null}
    </div>
  );
}

function DueLabel({ row, today }: { row: DuesRow; today: string }) {
  const relative = relativeDueDate(row.dueDate, today);
  return (
    <span className={cn('text-xs', relative.days < 0 ? 'text-danger' : 'text-muted-foreground')}>
      {relative.label}
    </span>
  );
}

function duesColumns(today: string): ColumnDef<DuesRow>[] {
  return [
    {
      accessorKey: 'fullName',
      header: copy.dues.member,
      cell: ({ row }) => (
        <div className="grid gap-1 py-1">
          <span className="font-medium">{row.original.fullName}</span>
          <span className="text-muted-foreground text-xs">
            {row.original.memberCode} · {formatPhoneNational(row.original.phone)}
          </span>
        </div>
      ),
    },
    {
      accessorKey: 'invoiceNumber',
      header: copy.dues.invoice,
      cell: ({ row }) => (
        <div className="grid justify-items-start gap-1.5">
          <span className="text-sm">{row.original.invoiceNumber}</span>
          <InvoiceStatusBadge status={row.original.status} />
        </div>
      ),
    },
    {
      accessorKey: 'dueDate',
      header: copy.dues.due,
      cell: ({ row }) => (
        <div className="grid gap-1">
          <span>{formatDate(row.original.dueDate)}</span>
          <DueLabel row={row.original} today={today} />
        </div>
      ),
    },
    {
      accessorKey: 'balance',
      header: copy.dues.balance,
      cell: ({ row }) => (
        <div className="grid gap-1.5">
          <span className="tabular text-danger font-medium">
            {formatMoney(row.original.balance)}
          </span>
          <RowFlags row={row.original} />
        </div>
      ),
    },
    {
      id: 'open',
      header: () => <span className="sr-only">{copy.dues.open}</span>,
      cell: ({ row }) => (
        <Button asChild variant="outline">
          <Link
            href={`/invoices/${row.original.id}`}
            aria-label={copy.dues.openFor(row.original.invoiceNumber, row.original.fullName)}
          >
            {copy.dues.open}
          </Link>
        </Button>
      ),
    },
  ];
}

export function DuesList({
  rows: data,
  total,
  summary,
  today,
  q,
  filter,
  page,
}: {
  rows: DuesRow[];
  total: number;
  summary: DuesSummary;
  today: string;
  q: string;
  filter: DuesFilter;
  page: number;
}) {
  'use no memo';
  const columns = useMemo(() => duesColumns(today), [today]);
  // TanStack's mutable table instance must stay outside React Compiler memoization.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    rowCount: total,
    state: { pagination: { pageIndex: page - 1, pageSize: DUES_PAGE_SIZE } },
  });
  const pages = Math.max(1, Math.ceil(total / DUES_PAGE_SIZE));
  const rows = table.getRowModel().rows;
  const filters = Object.entries(copy.dues.filters) as [DuesFilter, string][];
  const nothingOpen = summary.counts.all === 0 && summary.counts.claims === 0;
  return (
    <div className="grid gap-4">
      <section aria-label={copy.dues.summaryLabel} className="grid grid-cols-2 gap-3">
        <Link
          href={duesUrl(q, 'all')}
          className="bg-card hover:border-primary/50 focus-visible:ring-ring/40 grid gap-1 rounded-xl border p-4 transition-colors outline-none focus-visible:ring-3"
        >
          <span className="text-muted-foreground text-sm">{copy.dues.outstanding}</span>
          <span className="tabular text-2xl font-semibold md:text-3xl">
            {formatMoney(summary.outstanding)}
          </span>
          <span className="text-muted-foreground text-xs">
            {copy.dues.invoiceCount(summary.counts.all)}
          </span>
        </Link>
        <Link
          href={duesUrl(q, 'overdue')}
          className={cn(
            'bg-card hover:border-primary/50 focus-visible:ring-ring/40 grid gap-1 rounded-xl border p-4 transition-colors outline-none focus-visible:ring-3',
            filter === 'overdue' && 'border-primary',
          )}
        >
          <span className="text-muted-foreground text-sm">{copy.dues.overdue}</span>
          <span
            className={cn(
              'tabular text-2xl font-semibold md:text-3xl',
              summary.overdue > 0 && 'text-danger',
            )}
          >
            {formatMoney(summary.overdue)}
          </span>
          <span className="text-muted-foreground text-xs">
            {copy.dues.invoiceCount(summary.counts.overdue)}
          </span>
        </Link>
      </section>
      <form method="get" action="/dues" role="search" className="flex gap-2">
        {filter !== 'all' ? <input type="hidden" name="filter" value={filter} /> : null}
        <label htmlFor="dues-search" className="sr-only">
          {copy.dues.searchLabel}
        </label>
        <Input
          key={q}
          id="dues-search"
          name="q"
          type="search"
          defaultValue={q}
          placeholder={copy.dues.searchPlaceholder}
          maxLength={100}
          className="bg-card"
        />
        <Button type="submit" variant="outline" size="icon" aria-label={copy.dues.search}>
          <SearchIcon aria-hidden="true" />
        </Button>
      </form>
      <nav
        aria-label={copy.dues.filtersLabel}
        className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0"
      >
        {filters.map(([value, label]) => (
          <Link
            key={value}
            href={duesUrl(q, value)}
            aria-current={filter === value ? 'page' : undefined}
            aria-label={copy.dues.filterCount(label, summary.counts[value])}
            className={cn(
              'inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm transition-colors duration-150',
              filter === value
                ? 'bg-success-soft border-primary text-primary font-medium'
                : 'bg-card text-muted-foreground hover:border-zinc-400',
              value === 'claims' &&
                summary.counts.claims > 0 &&
                filter !== value &&
                'border-warning text-warning',
            )}
          >
            {label}
            <span className="bg-muted tabular ml-2 rounded-full px-1.5 py-0.5 text-xs">
              {summary.counts[value].toLocaleString('en-IN')}
            </span>
          </Link>
        ))}
      </nav>
      <p
        className="text-muted-foreground text-xs"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {copy.dues.results(total)}
      </p>
      {rows.length === 0 ? (
        <EmptyState
          icon={IndianRupeeIcon}
          title={nothingOpen && !q ? copy.dues.emptyTitle : copy.dues.noResults}
          body={nothingOpen && !q ? copy.dues.emptyBody : copy.dues.noResultsBody}
          action={
            q || filter !== 'all' ? (
              <Button variant="outline" asChild>
                <Link href="/dues">{copy.dues.clearFilters}</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="bg-card overflow-hidden rounded-xl border">
          <ul className="divide-y lg:hidden">
            {rows.map(({ original: row }) => (
              <li key={row.id}>
                <Link
                  href={`/invoices/${row.id}`}
                  aria-label={copy.dues.openFor(row.invoiceNumber, row.fullName)}
                  className="hover:bg-muted/30 focus-visible:ring-ring/40 grid gap-2 p-4 outline-none focus-visible:ring-3 focus-visible:ring-inset"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="min-w-0 truncate text-base font-semibold">{row.fullName}</span>
                    <span className="tabular text-danger shrink-0 font-semibold">
                      {formatMoney(row.balance)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground min-w-0 truncate text-xs">
                      {row.invoiceNumber} · {row.memberCode}
                    </span>
                    <DueLabel row={row} today={today} />
                  </div>
                  <RowFlags row={row} />
                </Link>
              </li>
            ))}
          </ul>
          <table className="hidden w-full text-left lg:table">
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
        <nav aria-label={copy.dues.pagination} className="flex items-center justify-between gap-2">
          {page > 1 ? (
            <Button asChild variant="outline">
              <Link href={duesUrl(q, filter, page - 1)}>{copy.dues.previous}</Link>
            </Button>
          ) : (
            <Button variant="outline" disabled>
              {copy.dues.previous}
            </Button>
          )}
          <p className="text-muted-foreground text-xs">{copy.dues.page(page, pages)}</p>
          {page < pages ? (
            <Button asChild variant="outline">
              <Link href={duesUrl(q, filter, page + 1)}>{copy.dues.next}</Link>
            </Button>
          ) : (
            <Button variant="outline" disabled>
              {copy.dues.next}
            </Button>
          )}
        </nav>
      ) : null}
    </div>
  );
}
