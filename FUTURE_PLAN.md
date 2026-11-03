# Future Plan

What to build next in GymDesk, in order. Read `ABOUT_PROJECT.md` first for invariants and conventions — they apply to every item below. Update this file as work lands, and move completed items into `PROGRESS.md`.

## Immediate next up: M3 — Attendance, QR, kiosk

The next milestone. Dependencies are already installed and waiting (uncommitted in `package.json`): `jsqr` for browser QR decoding and `@phosphor-icons/react` for the kiosk UI. `app/(app)/attendance/page.tsx` is a placeholder to replace.

Scope:

1. **Check-in storage and RPC.** A `check_in` write path via a `security definer` RPC (consistent with the audited-write pattern; direct table writes are not allowed for staff either). Decide and enforce: one check-in per member per day vs. per visit; how session-based memberships (multi-visit plans) consume a visit. Check-ins must respect membership status (active/expired/frozen) using the same IST-based status computation as the rest of the app, not a cached status.
2. **Member QR codes.** Generate a per-member QR (the `qrcode` package is already a dependency). Decide the payload format (signed token vs. member UUID; tokens should be revocable and not leak the org). Rendering on the member detail page for printing/screenshots.
3. **Kiosk mode.** A public route (likely under a path exempt from the normal session flow, similar to `/p/`) where a tablet at the gym door scans a member QR with the camera (`jsqr`), verifies against the server via the service role after token validation (kiosk PIN check is already an anticipated service-role use), and shows a big success/error screen. Needs: kiosk session activation (PIN or signed link), camera-only CSP permission is already scoped for the QR scanner, rate limiting, and idle-loop back to the scan screen.
4. **Attendance views.** Staff-facing attendance list for a day/date range in the existing app shell, following the Dues screen patterns (search, filters, IST dates).
5. **Cron tie-in.** The nightly maintenance job (`/api/cron/daily`) should handle any attendance-derived status refresh consistent with the membership status rules in `docs/architecture.md`.

Testing expectations: extend `tests/unit` (QR payload signing/verification, visit-consumption rules) and `tests/rls` (kiosk route can only check in, staff scoping, cross-gym isolation). Update `docs/` with an `m3-testing.md` in the existing format.

## M4 — Reminders, WhatsApp providers, templates

- WhatsApp message providers (per-gym credentials encrypted with `SECRETS_ENCRYPTION_KEY`, following the Cashfree credentials pattern: verify before save, never show the secret again, keep ciphertext out of audit rows).
- Payment-due reminders through the 10:00 IST Vercel Cron job; member consent to messaging (`messaging_consent` already exists on members and defaults to false — respect it everywhere).
- Editable message templates per gym with the standard variable interpolation.
- India-specific phone normalization is already in `lib/phone.ts`; keep using it.

## M5 — Today dashboard, Reports, Expenses, CSV

- **Today dashboard**: replace the M0 placeholder with check-ins today, dues collected today, expiring memberships, and other owner KPIs. The `20261030000004_dashboard.sql` migration already exists as a foundation.
- **Reports**: revenue (by method, by plan, by staff), attendance trends, overdue members. IST month/financial-year boundaries.
- **Expenses**: owner/manager-only table (RLS already anticipates this on expenses); simple CRUD with audit rows; feeds net-revenue reports.
- **CSV export** of members, invoices and payments, consistent with the Indian money/date formats.

## M6 — Portal, Settings, invites, audit viewer, export/delete, PWA, seed, tests, docs

- **Member portal**: read-only view behind the existing signed-link/token pattern (`/p/` routes, `PORTAL_TOKEN_SECRET`).
- **Settings**: gym profile, GSTIN/rate, invoice prefix, team management.
- **Invitations**: team invites via HMAC-signed links (anticipated service-role path for invite acceptance); role management on `team_members`.
- **Audit viewer**: staff-facing UI over `audit_logs` (read-only, owner/manager scoped).
- **Member export/delete**: 30-day soft-delete restore already exists from M1; add GDPR-style export and permanent deletion flows.
- **PWA**: installable, offline-tolerant shell; the kiosk mode from M3 is the main PWA surface.
- **Seed data**: a realistic seed script for local development and demos.
- **Playwright suite**: the smoke flows promised by `pnpm test:e2e` (currently unimplemented).
- **Docs**: final pass on README and docs.

## Carried-over validation debt (do these before or during M3)

- [ ] Live Cashfree sandbox payment test with real sandbox keys (procedure in `docs/m2-testing.md`).
- [ ] Webhook delivery end-to-end against a public HTTPS URL.
- [ ] axe accessibility scans of the M2 screens.
- [ ] Resolve or re-check the dev-only `minimatch` moderate advisory (GHSA-g3hv-75wg-m249) — safe to carry while it stays dev-only.
- [ ] Commit the pending `package.json`/`pnpm-lock.yaml` dependency additions (jsqr, phosphor icons) as part of the first M3 commit.

## Working rules for any agent picking this up

1. Read `docs/architecture.md` end to end before writing code. If your change touches SQL, follow the migration naming pattern `YYYYMMDDNNNNNN_name.sql` and regenerate types with `pnpm db:types`.
2. Run the full gate before considering work done: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:rls`, `pnpm format:check`, `pnpm build`. Fix failures, do not skip them.
3. New user-facing text goes in `lib/copy.ts`. New money math goes through `lib/money.ts`/`lib/gst.ts` in paise. New dates go through the IST helpers.
4. Every milestone lands as one commit in the `M<n>: <summary>` style (see git history), together with a `docs/m<n>-testing.md` validation note, and updates to this file, `PROGRESS.md` and `README.md`.
5. Never run `pnpm db:reset` on data anyone cares about. Never commit `.env.local` or print secrets.
