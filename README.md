# GymDesk

India-first gym management for owners, managers and staff: members and memberships, fees collected by direct UPI or Razorpay, GST invoices and receipts, WhatsApp reminders, QR attendance with a kiosk mode, and a read-only member portal. Members never log in.

## Stack

- Next.js 16 (App Router, Server Components, Server Actions), TypeScript strict
- Tailwind CSS v4, shadcn/ui, lucide-react, Inter with tabular numbers
- Supabase (Postgres, Auth, Storage) with row-level security; all multi-step writes are SQL functions called over RPC
- Vercel (Mumbai) with Vercel Cron for nightly maintenance and 10:00 IST reminders
- react-hook-form + zod (the same schemas validate on the client and the server)
- Vitest (unit + RLS isolation), Playwright (smoke flows), GitHub Actions

## Local development

Prerequisites: Node 22+, pnpm 11+, Docker Desktop (for the local Supabase stack).

```powershell
pnpm install
pnpm db:start                       # starts Supabase locally and applies supabase/migrations + seed
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
| `pnpm test`      | Unit tests (money, GST, UPI, phone, dates, prefix suggestion)       |
| `pnpm test:rls`  | Tenant isolation tests against the running local Supabase           |
| `pnpm test:e2e`  | Playwright smoke flows (arrives in M6)                              |
| `pnpm db:start`  | Start local Supabase and apply migrations                           |
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
lib/                 copy.ts (all user-facing text), money, gst, upi, dates, phone, errors, env, supabase clients, auth
supabase/migrations  schema, functions, RLS, dashboard
tests/unit           Vitest unit tests
tests/rls            Vitest isolation tests (need local Supabase)
docs/                setup and architecture notes
```

## Environment variables

See `.env.example`. Every variable is validated at boot (`lib/env.ts`); the app refuses to start with a missing or malformed value.

## Milestones

| Milestone | Scope                                                                                 | Status |
| --------- | ------------------------------------------------------------------------------------- | ------ |
| M0        | Scaffold, tooling, CI, design tokens, shell, auth, gym creation, team roles, RLS, env | Done   |
| M1        | Plans, members CRUD, memberships, member detail, Excel import                         | Next   |
| M2        | Invoices, GST, numbering, payments, direct UPI, claims, Razorpay, PDF receipts, Dues  |        |
| M3        | Attendance, QR, kiosk                                                                 |        |
| M4        | Reminders, WhatsApp providers, templates                                              |        |
| M5        | Today dashboard, Reports, Expenses, CSV                                               |        |
| M6        | Portal, Settings, invites, audit viewer, export/delete, PWA, seed, tests, docs        |        |
