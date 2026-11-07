# Future Plan

What to build next in GymDesk, in order. Read `ABOUT_PROJECT.md` first for invariants and conventions — they apply to every item below. Update this file as work lands, and move completed items into `PROGRESS.md`.

## M3 — Attendance, QR, kiosk (committed as `c7d2f3d`, validating)

Done: `check_in_member` RPC (no direct writes), five-minute duplicate window, session consumption, block-expired with owner/manager or PIN override, signed member QR codes with `qr_version` revocation and `/p/card/<token>` page, paired kiosk devices with service-role-only functions, attendance screen and settings. See `docs/m3-testing.md`.

Still open:

- Device testing: camera scanning on a real phone and tablet, kiosk on the front-desk tablet, axe scans.

## M4 — Reminders, WhatsApp providers, templates (committed, validating)

Done: consent-only WhatsApp messages (expiring, expired, dues with pay link, receipt, welcome with card link, birthday) in English and Hindi; `prepare_message` as the only write path with one-message-per-event unique indexes; manual `wa.me` queue; WhatsApp Cloud API with verified, encrypted per-gym tokens and approved `gymdesk_<kind>` templates; per-gym message text; messaging settings; `/api/cron/daily` at 10:00 IST. See `docs/m4-testing.md`.

Still open:

- Browser walkthrough at 390/1280 px and axe scans of Messages and messaging settings.
- A live Cloud API send with approved English and Hindi templates, and Vercel Cron on a deployment.
- Delivery and read receipts need a Meta webhook (`delivered` status exists but nothing sets it yet). Consider it in M6 with the other public endpoints.
- Members who reply STOP are not detected automatically; staff turn off consent on the profile.

## M5 — Today dashboard, Reports, Expenses, CSV (validating)

Done: linked Today KPIs; month and financial-year reports for net collections, payment methods, plans, staff, attendance and overdue members; audited owner/manager expense CRUD; private CSV exports for members, invoices and payments; camera/file photo selection during member creation. See `docs/m5-testing.md`.

Still open: mobile and accessibility walkthroughs, a real camera capture on phone/tablet, and larger-data export checks.

## M6 — Portal, Settings, invites, audit viewer, export/delete, PWA, seed, tests, docs (implemented, validating)

Done: revocable 30-day member portal links and read-only page; gym details, GSTIN/rate and invoice prefix settings; seven-day email-bound team invites and role/active controls; owner audit viewer; owner-only paged member JSON export and guarded personal-data erasure; installable PWA shell with offline fallback; opt-in local demo seed; Playwright smoke suite. See `docs/m6-testing.md`.

Still open: public HTTPS deployment and member links, real-device PWA installation, larger export and full-record erasure checks. Valid portal and invite flows passed in isolated local Playwright tests. The offline shell does not record check-ins while disconnected.

## Carried-over validation debt

- [ ] Live Cashfree sandbox payment test with real sandbox keys (procedure in `docs/m2-testing.md`).
- [ ] Webhook delivery end-to-end against a public HTTPS URL.
- [ ] axe accessibility scans of the M2 screens.
- [ ] Resolve or re-check the dev-only `minimatch` moderate advisory (GHSA-g3hv-75wg-m249) — safe to carry while it stays dev-only.
- [ ] M3 device checks: camera scanning on a real phone and tablet, kiosk on the front-desk tablet, axe scans (checklist in `docs/m3-testing.md`).
- [ ] M4 checks: browser walkthrough, live WhatsApp Cloud API send with approved templates, Vercel Cron on a deployment, axe scans (checklist in `docs/m4-testing.md`).
- [ ] M5 checks: mobile and accessibility walkthroughs, real device photo capture, and larger-data exports (checklist in `docs/m5-testing.md`).

## Working rules for any agent picking this up

1. Read `docs/architecture.md` end to end before writing code. If your change touches SQL, follow the migration naming pattern `YYYYMMDDNNNNNN_name.sql` and regenerate types with `pnpm db:types`.
2. Run the full gate before considering work done: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:rls`, `pnpm format:check`, `pnpm build`. Fix failures, do not skip them.
3. New user-facing text goes in `lib/copy.ts`. New money math goes through `lib/money.ts`/`lib/gst.ts` in paise. New dates go through the IST helpers.
4. Every milestone lands as one commit in the `M<n>: <summary>` style (see git history), together with a `docs/m<n>-testing.md` validation note, and updates to this file, `PROGRESS.md` and `README.md`.
5. Never run `pnpm db:reset` on data anyone cares about. Never commit `.env.local` or print secrets.
