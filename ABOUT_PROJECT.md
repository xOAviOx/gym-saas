# About GymDesk

India-first gym management for owners, managers and staff. Members and memberships, fees collected by direct UPI or Cashfree, GST invoices and receipts, WhatsApp reminders, QR attendance with a kiosk mode, and a read-only member portal. **Members never log in** — they interact only through pay links and WhatsApp.

This file is the entry point for AI agents (or humans) picking up the codebase. Read this first, then `PROGRESS.md` (where the project stands) and `FUTURE_PLAN.md` (what to build next).

## Stack

| Layer        | Choice                                                                                  |
| ------------ | --------------------------------------------------------------------------------------- |
| Framework    | Next.js 16 (App Router, Server Components, Server Actions), TypeScript strict           |
| UI           | Tailwind CSS v4, shadcn/ui, Phosphor icons, Geist + Instrument Serif headings           |
| Database     | Supabase (Postgres, Auth, Storage) with row-level security on every table               |
| Writes       | All multi-step writes are `security definer` SQL functions called over RPC              |
| Validation   | zod schemas shared between client and server (react-hook-form + `@hookform/resolvers`)  |
| PDF          | `pdf-lib`, generated on the server (`lib/pdf/`)                                         |
| Tests        | Vitest (unit + RLS isolation), Playwright smoke flows                                   |
| CI           | GitHub Actions (`.github/workflows/ci.yml`)                                             |
| Hosting plan | Vercel (Mumbai region) with Vercel Cron for nightly maintenance and 10:00 IST reminders |

## Commands (pnpm, Node 22+, Docker Desktop for Supabase)

```powershell
pnpm install
pnpm db:start                            # start/resume local Supabase stack
pnpm exec supabase migration up --local  # apply new migrations without data loss
pnpm db:types                            # regenerate lib/supabase/database.types.ts
pnpm dev                                 # http://localhost:3000
pnpm lint
pnpm typecheck
pnpm test                                # unit tests
pnpm test:rls                            # RLS isolation tests (need local Supabase)
pnpm format:check
pnpm build
pnpm db:reset                            # DESTROYS and rebuilds local DB — never use on data you want
```

Local Supabase services: API `http://127.0.0.1:54321`, Studio `http://127.0.0.1:54323`, Mailpit `http://127.0.0.1:54324`.

## Project structure

```
app/                 routes: (auth), (app), onboarding, auth/callback, auth/confirm,
                     api/ (webhooks, cron), p/ (public pay links)
components/ui        shadcn/ui primitives
components/<feature> feature UI
features/<feature>   actions.ts (Server Actions), queries.ts, schema.ts (zod)
                     current features: auth, billing, dashboard, members,
                     memberships, organizations, plans
lib/                 copy.ts (ALL user-facing text), money, gst, upi, dates,
                     phone, errors, env, payments, pdf, supabase clients, auth
supabase/migrations  schema, functions, RLS, dashboard, members, audited writes, billing
tests/unit           Vitest unit tests
tests/rls            Vitest isolation tests (need local Supabase)
docs/                setup, architecture and per-milestone validation notes
```

## Documentation map

| File                           | Contents                                                                                    |
| ------------------------------ | ------------------------------------------------------------------------------------------- |
| `README.md`                    | Overview, scripts, milestone table                                                          |
| `docs/architecture.md`         | Request flow, DB design, clients, billing, security headers — read before changing anything |
| `docs/local-setup.md`          | Full local environment walkthrough and secret generation                                    |
| `docs/m1-testing.md`           | M1 setup, validation results, acceptance checklist                                          |
| `docs/m2-testing.md`           | M2 setup, validation results, Cashfree sandbox test, acceptance checklist                   |
| `docs/competitive-research.md` | Observed workflows from competitor research; GYM-One excluded by user request               |

## Environment variables

See `.env.example`. Every variable is validated at boot (`lib/env.ts`) — the app refuses to start with a missing or malformed value. Required:

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server only: webhooks, cron, portal routes, invite acceptance, kiosk PIN check)
- `NEXT_PUBLIC_APP_URL` (public origin, no trailing slash)
- `PORTAL_TOKEN_SECRET` (HMAC for member pay links and invitations)
- `SECRETS_ENCRYPTION_KEY` (AES-256-GCM, exactly 32 bytes base64 — encrypts per-gym Cashfree/WhatsApp credentials; changing it makes saved keys unusable)
- `CRON_SECRET` (bearer token for `/api/cron/daily`)

`.env.local` exists locally and is git-ignored. Never commit it or print secrets.

## Non-negotiable invariants

1. **Never weaken RLS.** Base policy is `org_id in (select my_org_ids())`. Invoices, payments, claims, secrets, team members and audit logs have no direct write policies — they change only through SQL functions.
2. **The client never supplies an `org_id`.** It always comes from the session via `requireOrg()` (`lib/auth/session.ts`).
3. **Every mutation is a Server Action** in `features/<feature>/actions.ts`, wrapped in `runAction()`: authenticate → resolve org → authorize role → zod parse → write (RPC for multi-step) → audit → `revalidatePath`. Actions return `ActionResult<T>`.
4. **Payments are immutable.** No update or delete; corrections are negative reversal payments. Retries are made safe with request UUIDs (idempotent).
5. **Invoices are voided with a reason, never deleted,** and invoice numbers (`<PREFIX>/26-27/0001`) are sequential per gym per financial year, never reused.
6. **Money is integer paise in TypeScript** (`lib/money.ts`), `numeric(10,2)` in SQL, formatted with `Intl` for `en-IN`. **All dates use Asia/Kolkata** on the server (`ist_today()`).
7. **GST is inclusive:** `lib/gst.ts` splits totals into taxable value + CGST/SGST at half the gym's rate each.
8. **All user-facing strings live in `lib/copy.ts`.** No inline copy in components.
9. **The service role key never reaches a page or client bundle.** It is used only in webhooks, cron, portal/pay-link routes after token validation, credential decryption, invite acceptance and (future) kiosk PIN check.
10. **Generated DB types are the contract.** `lib/supabase/database.types.ts` must match the applied schema; CI fails on drift. Run `pnpm db:types` after every SQL change.
11. **Security headers** are set in `next.config.ts` (CSP, X-Frame-Options DENY, nosniff, camera permission only for the QR scanner). HSTS/`upgrade-insecure-requests` are production-HTTPS-only so local `pnpm start` keeps working.
12. **Accessibility:** use `FormItem hasDescription` whenever a field renders `FormDescription`, so controls reference existing help text without dangling `aria-describedby` IDs.

## Conventions

- `proxy.ts` (not `middleware.ts`) runs on every request; it refreshes the session cookie and redirects signed-out users to `/sign-in?next=…`.
- Pages are Server Components; interactive parts are client components using shadcn/ui.
- Forms: react-hook-form + the feature's shared zod schema; server actions re-validate with the same schema.
- Toasts via `sonner`; field errors mapped back into forms with `applyActionResult()`.
- Date display: `12 Mar 2026`, relative dates like `3 days left` / `5 days overdue`.
- Member photos: private `uploads` bucket, path `{org}/members/{member}/{uuid}`, served via short-lived signed URLs.
- Excel import: SheetJS parsed lazily in the browser, 5 MB / 500 rows / 40 columns max, duplicate detection re-checked server-side before the atomic import RPC.
