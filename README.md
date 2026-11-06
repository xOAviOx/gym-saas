# GymDesk

India-first gym management for owners, managers and staff: members and memberships, fees collected by direct UPI or Cashfree, GST invoices and receipts, WhatsApp reminders, QR attendance with a kiosk mode, and a read-only member portal. Members never log in.

## Stack

- Next.js 16 (App Router, Server Components, Server Actions), TypeScript strict
- Tailwind CSS v4, shadcn/ui, Phosphor icons (`components/icons.tsx`), Geist with tabular numbers and Instrument Serif headings
- Supabase (Postgres, Auth, Storage) with row-level security; all multi-step writes are SQL functions called over RPC
- Vercel (Mumbai) with Vercel Cron for nightly maintenance and 10:00 IST reminders
- react-hook-form + zod (the same schemas validate on the client and the server)
- Vitest (unit + RLS isolation), Playwright (smoke flows), GitHub Actions

## Local development

Prerequisites: Node 22+, pnpm 11+, Docker Desktop (for the local Supabase stack).

```powershell
pnpm install
pnpm db:start                       # starts or resumes the local Supabase stack
pnpm exec supabase migration up --local # applies new migrations without deleting data
pnpm exec supabase status -o env    # prints the local URL and keys
Copy-Item .env.example .env.local   # fill in the values; see docs/local-setup.md
pnpm dev                            # http://localhost:3000
```

Local services: API `http://127.0.0.1:54321`, Studio `http://127.0.0.1:54323`, Mailpit (outgoing email) `http://127.0.0.1:54324`.

Full walkthrough, including how to generate the secrets and what to do after changing SQL: [docs/local-setup.md](docs/local-setup.md).

## Scripts

| Script           | What it does                                                        |
| ---------------- | ------------------------------------------------------------------- |
| `pnpm dev`       | Next.js dev server                                                  |
| `pnpm build`     | Production build                                                    |
| `pnpm lint`      | ESLint                                                              |
| `pnpm typecheck` | `tsc --noEmit`                                                      |
| `pnpm test`      | Unit tests: members, billing, pay links, Cashfree, QR, messaging    |
| `pnpm test:rls`  | Tenant isolation, roles, atomic writes, billing, check-in, messages |
| `pnpm test:e2e`  | Playwright smoke flows (arrives in M6)                              |
| `pnpm db:start`  | Start or resume the local Supabase stack                            |
| `pnpm db:reset`  | Drop and recreate the local database from migrations + seed         |
| `pnpm db:types`  | Regenerate `lib/supabase/database.types.ts` from the local database |
| `pnpm db:push`   | Apply migrations to the linked hosted project                       |
| `pnpm format`    | Prettier                                                            |

## Project structure

```
app/                 routes: (auth), (app), onboarding, auth/callback, auth/confirm
components/ui        shadcn/ui primitives
components/<feature> feature UI
features/<feature>   actions.ts (Server Actions), queries.ts, schema.ts (zod)
lib/                 copy.ts (all user-facing text), money, gst, upi, dates, phone, errors, env, payments, pdf, supabase clients, auth
supabase/migrations  schema, functions, RLS, dashboard, members, audited writes, billing, attendance and messaging
tests/unit           Vitest unit tests
tests/rls            Vitest isolation tests (need local Supabase)
docs/                setup and architecture notes
```

## Environment variables

See `.env.example`. Every variable is validated at boot (`lib/env.ts`); the app refuses to start with a missing or malformed value.

## Milestones

| Milestone | Scope                                                                                 | Status     |
| --------- | ------------------------------------------------------------------------------------- | ---------- |
| M0        | Scaffold, tooling, CI, design tokens, shell, auth, gym creation, team roles, RLS, env | Done       |
| M1        | Plans, members CRUD, memberships, member detail, Excel import                         | Done       |
| M2        | Invoices, GST, numbering, payments, direct UPI, claims, Cashfree, PDF receipts, Dues  | Validating |
| M3        | Attendance, QR, kiosk                                                                 | Validating |
| M4        | Reminders, WhatsApp providers, templates                                              | Validating |
| M5        | Today dashboard, Reports, Expenses, CSV                                               | Validating |
| M6        | Portal, Settings, invites, audit viewer, export/delete, PWA, seed, tests, docs        |            |

M1 adds search-scoped membership counts and dues, contextual member actions, two-step member creation, private photos, notes, recent activity, renewal/freeze controls, 30-day restore, plan management, and guided spreadsheet import with server-validated duplicate detection. Memberships create unpaid invoices; collection and payment reconciliation arrive in M2.

See [docs/m1-testing.md](docs/m1-testing.md) for setup, validation results and the acceptance checklist. [Competitive research](docs/competitive-research.md) records the observed workflows, source/license limits and original M1 improvements. GYM-One was excluded at the user's request.

M2 adds the Dues screen, invoice detail with the GST breakdown, counter payments with safe retries, reversals and voids, direct UPI QR codes, signed per-invoice pay links where members submit a 12-digit UTR claim, claim review, Cashfree payment links with webhook and manual reconciliation, per-gym payment settings with encrypted Cashfree keys, and one-page PDF tax invoices and receipts.

See [docs/m2-testing.md](docs/m2-testing.md) for setup, validation results, the Cashfree sandbox test and the acceptance checklist.

M3 adds the Attendance screen (desk search, camera QR scanning, hourly and 7-day charts, a day-by-day list), signed member check-in QR codes with a shareable card page, a PIN-protected kiosk mode for a front-desk tablet, and attendance settings (block expired members, kiosk PIN, paired devices). It also moves the whole app to the minimalist design system: warm monochrome palette, Geist and Instrument Serif, Phosphor icons and flat 1px borders.

See [docs/m3-testing.md](docs/m3-testing.md) for setup, validation results and the acceptance checklist.

M4 adds the Messages screen (a queue to send and a history), WhatsApp messages for consenting members (membership expiring and expired, dues overdue with a pay link, payment receipts, welcome with the check-in card, birthday wishes) in English or Hindi, editable message text per gym, messaging settings (which messages, reminder days, default language, how messages are sent), and the daily job at `/api/cron/daily` that runs at 10:00 IST. Staff send messages from WhatsApp with one tap, or the gym connects the WhatsApp Cloud API with an encrypted token and approved templates, and messages go out automatically with failures left in the queue.

See [docs/m4-testing.md](docs/m4-testing.md) for setup, the WhatsApp Cloud API setup, validation results and the acceptance checklist.

M5 adds member photo capture during creation, linked Today KPIs, reports for collections, expenses, attendance and overdue members, audited expense tracking, and private CSV exports of members, invoices and payments. Reports support IST months and Indian financial years.

See [docs/m5-testing.md](docs/m5-testing.md) for validation and the remaining device checklist.
