# Progress

State of GymDesk as of 4 November 2026. Start here to see what is done, what is in flight, and what is known to be unfinished. Pair with `FUTURE_PLAN.md` for what comes next.

## Milestone status

| Milestone | Scope                                                                                 | Status         |
| --------- | ------------------------------------------------------------------------------------- | -------------- |
| M0        | Scaffold, tooling, CI, design tokens, shell, auth, gym creation, team roles, RLS, env | **Done**       |
| M1        | Plans, members CRUD, memberships, member detail, Excel import                         | **Done**       |
| M2        | Invoices, GST, numbering, payments, direct UPI, claims, Cashfree, PDF receipts, Dues  | **Validating** |
| M3        | Attendance, QR, kiosk                                                                 | **Validating** |
| M4        | Reminders, WhatsApp providers, templates                                              | **Validating** |
| M5        | Today dashboard, Reports, Expenses, CSV                                               | Not started    |
| M6        | Portal, Settings, invites, audit viewer, export/delete, PWA, seed, tests, docs        | Not started    |

## Git history

```
M4: WhatsApp reminders, receipts, message templates and daily job
c7d2f3d M3: attendance, QR check-in, kiosk and minimalist restyle
705065d Add agent handoff docs: ABOUT_PROJECT, PROGRESS, FUTURE_PLAN
aa20c72 M2: GST invoices, Cashfree payments, pay links and dues collection
95a6eab M1: members, plans, memberships, directory and Excel import
e71d06d M0: GymDesk foundation: Next.js 16 + Supabase schema/RLS, auth, onboarding, app shell
```

Branch: `main`. One commit per milestone, in the `M<n>: <summary>` style.

## M4 status

M4 is committed as `M4: WhatsApp reminders, receipts, message templates and daily job`:

- Migrations `20261104000013_messaging_enums.sql` and `20261104000014_messaging.sql` (applied locally, types regenerated).
- Messages queue and history, messaging settings, WhatsApp Cloud API connection and the message text editor (`features/messaging/`, `components/messages/`, `lib/messaging/`, `app/(app)/messages`, `app/(app)/settings/messaging`).
- Daily job `/api/cron/daily` with `vercel.json` cron at 04:30 UTC (10:00 IST); `lib/cron-auth.ts`, `lib/concurrency.ts`.
- Receipt and welcome hooks in billing (`recordPayment`, `confirmClaim`, Cashfree reconciliation) and member creation; member message language.

All automated checks pass (see `docs/m4-testing.md`). Still to do before marking M4 done: the browser walkthrough at 390/1280 px, a live WhatsApp Cloud API send with approved templates, Vercel Cron on a deployment, and axe scans.

## What M4 delivers

- WhatsApp messages for consenting members only: membership expiring and expired, dues overdue (with a pay link), payment receipts, welcome (with the check-in card link) and birthday wishes, in English or Hindi per member.
- Messages are rendered by the app and stored through `prepare_message`; direct writes to `message_logs` are closed. Unique indexes keep one reminder per member per day, one receipt per payment and one welcome per member.
- Manual provider: staff tap **Send on WhatsApp** (`wa.me` with the text) or **Skip**. WhatsApp Cloud API provider: token verified with Meta, encrypted per gym, sends approved `gymdesk_<kind>` templates; a 10-minute claim makes each message send at most once; failures stay in the queue with a staff-facing reason and **Retry**.
- Daily job: statuses, maintenance, stale-message expiry (3 days), then today's reminders and birthday wishes (at most one reminder per member per day). Safe to rerun; staff can also prepare today's reminders from Messages.
- Owner/manager-only messaging settings and per-gym message text with placeholder validation.

## M3 status

M3 and the app-wide minimalist restyle are committed together as `M3: attendance, QR check-in, kiosk and minimalist restyle`:

- Migration `20261103000012_attendance.sql` (applied locally, types regenerated).
- Attendance screen, member check-in QR and card page, kiosk mode, attendance settings (`features/attendance/`, `components/attendance/`, `lib/attendance/`).
- Restyle: warm monochrome tokens in `app/globals.css`, Geist + Instrument Serif, Phosphor icons through `components/icons.tsx`. `lucide-react` was removed; `jsqr` and `@phosphor-icons/react` were added.

All automated checks pass (see `docs/m3-testing.md`). Still to do before marking M3 done: the browser walkthrough at 390/1280 px, camera scanning on a real phone and tablet, and axe scans.

## What M3 delivers

- Attendance screen: desk search and check-in, camera QR scanning (BarcodeDetector with a jsQR fallback), hourly and 7-day charts, a day-by-day list with method, kiosk and override tags.
- `check_in_member` is the only check-in write path; a second scan within five minutes is a duplicate. With **Block expired members** on, owners and managers can override, staff need the kiosk PIN.
- Kiosk PIN hash moved to `organization_kiosk` (no policies) with a five-try, five-minute lockout.
- Signed, non-expiring member QR codes bound to `members.qr_version`; **Replace code** stops the old code. Shareable `/p/card/<token>` page.
- Kiosk mode on a paired device (httpOnly device cookie, hashed in the database, service-role-only SQL functions, per-device rate limits); exit needs the PIN; devices can be turned off from settings.

## What M2 delivered (all implemented and validated locally)

- Dues screen with search, filters, claims-first ordering; deleted members hidden from non-managers.
- Invoice detail with GST breakdown; one-page PDF tax invoices, receipts and void documents (`lib/pdf/`).
- Counter payments with request-UUID idempotency (safe retries), reversals and voids with reasons.
- Direct UPI QR codes on invoices and PDFs.
- Signed per-invoice pay links (`/p/pay/<token>`, HMAC-SHA256 via `PORTAL_TOKEN_SECRET`, valid 30 days) where members submit a 12-digit UTR claim; at most 3 claims per invoice per IST day; rate-limited endpoints.
- Claim review: staff confirm (records a UPI payment) or reject with a reason; recording the same UTR manually auto-confirms the claim.
- Cashfree payment links (one live link per invoice), webhook at `/api/webhooks/cashfree` (HMAC verification, re-read from Cashfree API before recording, idempotent per Cashfree payment id), manual **Check payment status** reconciliation, encrypted per-gym credentials (AES-256-GCM), gateway events logged.
- Recording a payment, confirming a claim or voiding an invoice automatically cancels its open Cashfree link.
- Per-gym payment settings (owner/manager only).

## Latest validation run (M2, local Supabase + production build)

| Check                               | Result                                                                                                                                  |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm lint` / `typecheck` / `build` | Passed                                                                                                                                  |
| `pnpm test` (unit)                  | 137 tests passed                                                                                                                        |
| `pnpm test:rls`                     | 32 tests passed                                                                                                                         |
| `pnpm format:check`                 | Passed                                                                                                                                  |
| `pnpm audit --audit-level high`     | Passed (dev-only `minimatch` moderate advisory GHSA-g3hv-75wg-m249 remains)                                                             |
| Generated DB types                  | Matched applied schema                                                                                                                  |
| Browser workflows                   | Owner, anonymous member and staff flows at 360/390 px; main screens at 1280 px; no failed requests or errors                            |
| PDFs                                | Tax invoice (open + with UPI QR), paid receipt with reversal, void document — GSTIN, place of supply, SAC, CGST/SGST and totals checked |

### Issues found and fixed during M2 validation

- Saving any gym credential failed (`malformed array literal`) — secrets audit trigger fixed in `20261101000010_secrets_audit_fix.sql`.
- A team member who recorded payments could not be removed — `payments.collected_by` clearing is now the only allowed change to payments, via `20261101000011_payment_collector_removal.sql`.
- Production build over HTTP broke links due to `upgrade-insecure-requests` — HSTS/CSP upgrade now sent only when `NEXT_PUBLIC_APP_URL` is HTTPS.
- Invoice pages/PDFs showed the membership period twice — extra line removed.

### Not yet run (carried forward)

- Live Cashfree sandbox payment (needs real sandbox keys) — manual procedure documented in `docs/m2-testing.md`.
- Webhook delivery end-to-end (needs a public HTTPS URL).
- axe accessibility scans of the M2 screens.
- The Playwright suite (planned for M6).

## Known gotchas

- WhatsApp Cloud API sends use the approved `gymdesk_<kind>` templates in WhatsApp Manager, not the text edited in GymDesk; edited text applies to manual sends. A missing or unapproved template shows as a failed message.
- `/api/cron/daily` needs `Authorization: Bearer <CRON_SECRET>`; Vercel Cron sends it automatically when `CRON_SECRET` is set in the project.
- The camera (QR scanning) works only on `localhost` or HTTPS.
- Changing `PORTAL_TOKEN_SECRET` invalidates every member check-in QR code as well as pay links.

- `pnpm db:reset` destroys the local database. On a database whose data matters, use `pnpm exec supabase migration up --local` instead.
- Cashfree accepts only HTTPS webhook/return URLs; with a local `http://` app URL, GymDesk omits them and you must use **Check payment status** manually.
- Sandbox Cashfree keys must never be connected to a gym with real members — sandbox payments are recorded like real ones.
- Changing `SECRETS_ENCRYPTION_KEY` makes every saved gym credential (Cashfree and WhatsApp) unusable.
- GYM-One was excluded from competitive research at the user's request; do not add it back.

## Working directory notes

- Windows environment (PowerShell 5.1, no `&&`/`||` in commands).
- Repo lives in OneDrive (`C:\Users\avish\OneDrive\Desktop\gym_management`) — expect slow first file reads and CRLF/LF warnings from git; they are harmless.
- `tsconfig.tsbuildinfo` and `test-results/` are present locally; they are build/test artifacts, not source.
