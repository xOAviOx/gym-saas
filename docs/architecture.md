# Architecture

## Request flow

1. `proxy.ts` runs on every request except static assets and machine-to-machine routes. It refreshes the Supabase session cookie, sends signed-out users to `/sign-in?next=…`, and sends signed-in users away from the auth pages.
2. Pages are Server Components. They call `requireOrg()` (`lib/auth/session.ts`), which resolves the active gym from `profiles.active_org_id` and verifies it against the caller's active `team_members` rows. A user without a gym is sent to `/onboarding`. A page restricted to certain roles returns 404 for other roles so it is not discoverable.
3. Every mutation is a Server Action in `features/<feature>/actions.ts` wrapped in `runAction()`:
   authenticate → resolve active org from the session → authorize role → parse with the shared zod schema → write (RPC for multi-step, table write for single-step) → audit → `revalidatePath`.
   The client never supplies an `org_id`; it is always taken from the session.
4. Actions return `ActionResult<T>` (`ok` or a typed error with optional field errors). `applyActionResult()` maps field errors back into react-hook-form and shows a toast for the rest.

## Database

- Postgres with row-level security on every table. The base policy is `org_id in (select my_org_ids())`; privileged tables (expenses, organization settings) further require owner or manager; payments can be inserted by every role but never updated or deleted; invoices, invoice_items, payment_claims, team_members and audit_logs have no direct write policies and change only through SQL functions.
- Multi-step writes (create gym, create membership, record payment, confirm claim, check-in, …) are `security definer` functions. Each checks the caller's role with `assert_org_role`, performs the whole change in one transaction and writes its own audit row.
- All date logic uses Asia/Kolkata on the server (`ist_today()`), money is `numeric(10,2)` in SQL and integer paise in TypeScript (`lib/money.ts`).
- Generated types (`lib/supabase/database.types.ts`) are the contract between SQL and TypeScript; CI fails when they drift.

## Supabase clients

| Client                   | Where                                                                                    | Key                                 |
| ------------------------ | ---------------------------------------------------------------------------------------- | ----------------------------------- |
| `lib/supabase/server.ts` | Server Components and Server Actions                                                     | anon + cookie session (RLS applies) |
| `lib/supabase/client.ts` | Client Components (auth UI only)                                                         | anon                                |
| `lib/supabase/proxy.ts`  | `proxy.ts`                                                                               | anon                                |
| `lib/supabase/admin.ts`  | webhooks, cron, portal routes after token validation, invite acceptance, kiosk PIN check | service role                        |

The service role key never reaches a page or a client bundle.

## Text and formatting

All user-facing strings live in `lib/copy.ts`. Money is formatted with `Intl` for `en-IN` (`₹1,25,000`), dates as `12 Mar 2026`, relative dates as `3 days left` / `5 days overdue`.

## Security headers

`next.config.ts` sets a Content-Security-Policy, HSTS with preload, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` and a Permissions-Policy that allows the camera only for the QR scanner.
