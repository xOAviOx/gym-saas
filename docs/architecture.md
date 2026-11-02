# Architecture

## Request flow

1. `proxy.ts` runs on every request except static assets and machine-to-machine routes. It refreshes the Supabase session cookie and verifies the user with Supabase Auth (`getUser`), so a still-valid token for a deleted account counts as signed out. Signed-out users go to `/sign-in?next=…` and signed-in users are sent away from the auth pages; both redirects keep any refreshed or cleared session cookies.
2. Pages are Server Components. They call `requireOrg()` (`lib/auth/session.ts`), which resolves the active gym from `profiles.active_org_id` and verifies it against the caller's active `team_members` rows. A user without a gym is sent to `/onboarding`. A page restricted to certain roles returns 404 for other roles so it is not discoverable.
3. Every mutation is a Server Action in `features/<feature>/actions.ts` wrapped in `runAction()`:
   authenticate → resolve active org from the session → authorize role → parse with the shared zod schema → write (RPC for multi-step, table write for single-step) → audit → `revalidatePath`.
   The client never supplies an `org_id`; it is always taken from the session.
4. Actions return `ActionResult<T>` (`ok` or a typed error with optional field errors). `applyActionResult()` maps field errors back into react-hook-form and shows a toast for the rest.

## Database

- Postgres with row-level security on every table. The base policy is `org_id in (select my_org_ids())`; privileged tables (expenses, organization settings) further require owner or manager; payments can be inserted by every role but never updated or deleted; invoices, invoice_items, payment_claims, team_members and audit_logs have no direct write policies and change only through SQL functions.
- Multi-step writes (create gym, create membership, record payment, confirm claim, check-in, …) are `security definer` functions. Each checks the caller's role with `assert_org_role`, performs the whole change in one transaction and writes its own audit row.
- Member, plan and membership writes have no direct authenticated insert/update policies. `create_member`, `update_member`, `save_plan`, `enroll_member` and the lifecycle/import RPCs are the audited write paths. `create_member` and enrollment use request UUIDs for safe retries; member creation, its optional membership, its invoice and its audit rows commit or roll back together.
- The `member_directory` view is `security_invoker`, so RLS applies to its members, memberships, plans and invoices. `list_members` scopes the gym, validates filters and paging, searches literal substrings, and orders dues/expiry first. Its overview counts and balance are computed over the same search matches before the selected status filter and pagination. Live totals exclude deleted records; deleted counts, browsing and restore require owner or manager.
- Membership read paths compute status using the current IST date, including elapsed freezes, rather than relying on the maintenance job to have updated a cached status. Renewal defaults follow the latest eligible inclusive end date; exhausted/expired coverage renews from today.
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

## Member imports and photos

Spreadsheet parsing is lazy-loaded in the browser through the maintained SheetJS distribution. Files are limited to 5 MB, 500 member rows and 40 columns. The user chooses a worksheet, maps columns, reviews invalid/duplicate rows, then confirms. Both server actions use the shared member schemas; confirmation re-reads active plans and duplicate phones before the atomic import RPC. Messaging consent defaults to false, and historical payments are never inferred from a spreadsheet.

Member photos use the private `uploads` bucket under `{org}/members/{member}/{uuid}`. The Server Action checks size, MIME type and file signatures, updates the member through the audited RPC, and returns short-lived signed URLs for display.

## Member workflow context

Directory actions use the existing audited enrollment flow, not a second mutation path. Quick renewal prefers the member's current plan only while that plan remains available. The server still validates the plan, role, price and dates. Upcoming memberships show their start date; exhausted session memberships do not show a misleading days-left countdown.

Recent activity combines recorded member creation, membership creation, payments/reversals and the profile's 90-day check-in window. Events sort by their actual timestamp and display the six most recent entries in IST. This is a compact activity feed, not a complete audit log.

## Text and formatting

All user-facing strings live in `lib/copy.ts`. Money is formatted with `Intl` for `en-IN` (`₹1,25,000`), dates as `12 Mar 2026`, relative dates as `3 days left` / `5 days overdue`.

Use `FormItem hasDescription` when a field renders `FormDescription`. Controls then reference existing help text and validation messages without generating dangling `aria-describedby` IDs.

## Security headers

`next.config.ts` sets a Content-Security-Policy, HSTS with preload, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` and a Permissions-Policy that allows the camera only for the QR scanner.
