# GymDesk productionisation plan

Updated 8 November 2026.

GymDesk is a feature-complete MVP after M6. The remaining work is production hardening, hosted integration testing, device validation, operations, legal readiness and commercial packaging.

## Zero-cost pilot path

GymDesk can start at ₹0 per month for a small controlled pilot by using the repository's Oracle Always Free, Supabase Free, DuckDNS, Caddy, R2 and GitHub Actions deployment. Follow [docs/free-production.md](docs/free-production.md) for the exact setup, quotas, backup procedure and release gate. This is a zero-cash stack, not a free uptime or support SLA.

### Practical cost paths

| Stage             |                  Expected recurring cost | What it is suitable for                                      |
| ----------------- | ---------------------------------------: | ------------------------------------------------------------ |
| Local/demo        |                        $0 infrastructure | Development and private demos only                           |
| Staging           |         Often $0–$25/month plus a domain | Testing with fake or non-sensitive data                      |
| First small pilot | ₹0 while inside every provider allowance | One or a few real gyms with monitoring and encrypted backups |
| Growing SaaS      |     Usage-based and support costs on top | Multiple paying gyms and production traffic                  |

The zero-cost path uses free services with explicit limits. Supabase Free can pause inactive projects and has no automatic backups, which is why this repository adds encrypted daily R2 backups. Oracle Always Free capacity is not guaranteed and idle VMs may be reclaimed. Upgrade when the capacity guardrails in the free-production guide are reached or clients require an SLA.

Cashfree and WhatsApp add variable costs. Cashfree pricing depends on payment method, offer, contract and transaction volume; gateway charges are taken from payments rather than being a fixed GymDesk hosting bill. WhatsApp Business Platform messages outside the customer-service window use approved templates and are subject to Meta's current pricing. Domain registration, transactional email, monitoring, support and legal/accounting work are separate costs.

Official pricing and policy pages:

- [Oracle Always Free](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm)
- [Supabase pricing](https://supabase.com/pricing)
- [Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing/)
- [Cashfree payment gateway charges](https://www.cashfree.com/payment-gateway-charges/)
- [WhatsApp Business messaging policy](https://business.whatsapp.com/policy/preview)

Do not connect production credentials or real member data until the hosted environment and backup plan are ready.

## Release targets

### Pilot-ready

- One real gym can use members, memberships, invoices, UPI/Cashfree payments, attendance, kiosk, photos and manual WhatsApp links.
- The app runs on a public HTTPS domain with production Supabase.
- Payment, webhook, cron and authentication flows have been tested against hosted services.
- At least one Android phone, iPhone and front-desk tablet have completed the critical workflows.
- A named person owns support, incident response and data export/deletion requests.

### Broad-sale ready

- Pilot issues are closed and two or more gyms have completed a trial period.
- Backups have been restored in a test, monitoring is active and on-call ownership is documented.
- Privacy, terms, consent, retention and deletion policies are reviewed for the markets served.
- GymDesk has a pricing, invoicing and account-suspension process.
- A client cannot accidentally see another gym's data; RLS, audit logs and production migration procedures are reviewed before every release.

## Step-by-step checklist

### 1. Decide the operating model

- [ ] Decide whether the first clients are manually onboarded or can self-serve.
- [ ] Decide whether each client gets one shared Supabase project or whether GymDesk is operated as one multi-tenant project. The current schema is multi-tenant; keep one production project unless there is a clear isolation reason to split projects.
- [ ] Choose the product domain and a separate staging domain.
- [ ] Decide where client subscriptions are recorded. GymDesk currently collects gym-member payments; it does not yet bill gym owners for GymDesk subscriptions.
- [ ] Define the first paid plan, trial duration, support channel and cancellation process.

### 2. Create separate environments

- [ ] Use the local Supabase stack for staging while the zero-cost constraint applies.
- [ ] Create one hosted Supabase Free project for production.
- [ ] Create the Oracle Always Free VM and keep staging local until a paid reliability tier is justified.
- [ ] Use different values for `PORTAL_TOKEN_SECRET`, `SECRETS_ENCRYPTION_KEY` and `CRON_SECRET` in every environment.
- [ ] Never copy `.env.local` into GitHub, deployment logs, screenshots or support tickets.
- [ ] Record who can access Oracle, Supabase, Cloudflare, GitHub, Cashfree, Meta and DuckDNS.

### 3. Deploy the database safely

- [ ] Review every migration in `supabase/migrations`.
- [ ] Apply migrations to staging with `pnpm db:push` or the hosted Supabase migration workflow.
- [ ] Generate and compare hosted database types.
- [ ] Verify RLS policies with two gyms, an owner, a manager and staff.
- [ ] Confirm the production Supabase project has backups enabled and a retention period appropriate for client data.
- [ ] Perform one restore rehearsal before importing real members.
- [ ] Set spend caps and database/storage/egress alerts.
- [ ] Do not run `pnpm db:reset` against a hosted or valuable database.

### 4. Configure the production app

Set these variables in the production deployment, using production values:

- [ ] `NEXT_PUBLIC_SUPABASE_URL`
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- [ ] `SUPABASE_SERVICE_ROLE_KEY`
- [ ] `NEXT_PUBLIC_APP_URL` as the final HTTPS origin with no trailing slash
- [ ] `PORTAL_TOKEN_SECRET`
- [ ] `SECRETS_ENCRYPTION_KEY`
- [ ] `CRON_SECRET`

Then:

- [ ] Connect the production domain and verify HTTPS, redirects and certificate renewal.
- [ ] Confirm auth redirect URLs in Supabase match the production and staging origins.
- [ ] Confirm the CSP, HSTS and camera Permissions-Policy are correct on HTTPS.
- [ ] Confirm `/manifest.webmanifest`, `/sw.js`, `/offline` and the install icons work.
- [ ] Confirm the GitHub Actions production cron invokes `/api/cron/daily` at 10:00 IST with `CRON_SECRET`.
- [ ] Confirm error logs do not print tokens, credentials, member phone numbers or payment secrets.

### 5. Configure authentication and access

- [ ] Configure production email delivery for sign-up, confirmation, password reset and invitations.
- [ ] Set the production email sender, reply-to address and SPF/DKIM/DMARC records.
- [ ] Decide whether Google sign-in is offered; if yes, configure the production OAuth client and redirect URL.
- [ ] Test invite acceptance with a second account using the exact invited email.
- [ ] Test deactivating a staff member while an old session exists.
- [ ] Test account recovery and a deleted user session.
- [ ] Review owner transfer, manager permissions, audit visibility and organization deletion.
- [ ] Add a support path for an owner who loses access to the only owner account.

### 6. Finish payment readiness

- [ ] Create a Cashfree sandbox merchant and complete the documented sandbox payment test.
- [ ] Test UPI claim, confirmation, rejection, duplicate UTR, reversal, invoice void and idempotent retry.
- [ ] Expose the Cashfree webhook at the public HTTPS production URL.
- [ ] Verify webhook signatures, replay handling, event logging and payment reconciliation.
- [ ] Test a failed webhook and the manual **Check payment status** fallback.
- [ ] Complete Cashfree production onboarding, KYC and settlement configuration before accepting live money.
- [ ] Verify invoice numbering, GSTIN, place of supply, receipts, PDF downloads and financial-year rollover.
- [ ] Document who handles refunds, reversals, disputes and payment mismatches.

### 7. Finish WhatsApp readiness

- [ ] Create or verify the Meta Business account, WhatsApp Business number and phone number ID.
- [ ] Complete business verification and create the `gymdesk_<kind>` templates in English and Hindi.
- [ ] Test a welcome, receipt, expiry, overdue and birthday message with a consenting test number.
- [ ] Verify the member's consent is recorded before any API send.
- [ ] Add and test the Meta webhook for delivered/read/failed statuses.
- [ ] Add a clear STOP/opt-out process and ensure staff can see and respect it.
- [ ] Test rate limits, failed sends, retry, token rotation and disconnecting the provider.
- [ ] Confirm the WhatsApp policy and local privacy/consent requirements for every client market.

### 8. Validate real devices and accessibility

- [ ] Test sign-in, member creation, camera photo capture and file photo selection on iPhone Safari.
- [ ] Test the same flows on Android Chrome.
- [ ] Test QR scanning in HTTPS on the front-desk tablet.
- [ ] Pair, use and exit kiosk mode on the actual tablet; test lockout and device revocation.
- [ ] Test member QR download and opening on macOS, Windows, iOS and Android.
- [ ] Test the PWA install and offline fallback on the target tablet.
- [ ] Test 390 px and 1280 px layouts for Today, Members, Attendance, Messages, Reports, Expenses and Settings.
- [ ] Run axe accessibility scans and fix keyboard, focus, label, contrast and screen-reader issues.
- [ ] Test slow networks, camera denial, expired links, invalid QR codes and interrupted uploads.

### 9. Validate data and performance

- [ ] Import a realistic dataset and verify duplicate phone handling.
- [ ] Export more than 500 members, invoices and payments and open the files in Excel or LibreOffice.
- [ ] Export and erase a member with memberships, invoices, payments, check-ins, messages and a photo.
- [ ] Check the largest expected gym against query timings and database indexes.
- [ ] Exercise rate limits on public card, pay, portal, webhook and cron routes.
- [ ] Confirm private storage objects cannot be read without an authenticated session or signed URL.
- [ ] Confirm public links expose only the minimum member data intended for that link.

### 10. Add operating controls

- [ ] Add error monitoring with alerts for 5xx responses, failed cron jobs, failed webhooks and message delivery failures.
- [ ] Add uptime checks for the app, Supabase API, cron endpoint and webhook endpoint.
- [ ] Review Oracle, Supabase, R2, GitHub Actions, WhatsApp and Cashfree usage against the documented guardrails.
- [ ] Define daily backup verification and a monthly restore rehearsal.
- [ ] Define incident severity, who is paged, client communication and recovery steps.
- [ ] Keep an audit trail for organization settings, team access, payments, expenses, deletes and portal links.
- [ ] Review dependency advisories before every release; resolve the carried dev-only `minimatch` advisory or document why it remains acceptable.
- [ ] Keep a release log and rollback procedure for application and database migrations.

### 11. Prepare legal and client materials

- [ ] Publish a privacy policy covering member phone numbers, photos, attendance, invoices and WhatsApp consent.
- [ ] Publish terms of service, acceptable-use rules and a support contact.
- [ ] Define retention, export, restoration and permanent-deletion policy.
- [ ] Obtain the gym's authorization to process member data and document the gym as the responsible data controller where applicable.
- [ ] Document WhatsApp consent wording and opt-out handling.
- [ ] Prepare onboarding instructions, a one-page staff guide and a short kiosk guide.
- [ ] Prepare a data-import template and a migration/support process for replacing an existing system.
- [ ] Define service limits, support hours, response targets and a maintenance window.

### 12. Run a controlled pilot

- [ ] Choose one gym and a small set of consenting members.
- [ ] Back up the existing gym data before import.
- [ ] Run the gym for at least one billing cycle while keeping a manual fallback.
- [ ] Review payment reconciliation, attendance accuracy, message failures, staff permissions and support requests weekly.
- [ ] Fix pilot issues before onboarding a second gym.
- [ ] Only then enable broader sales and self-serve onboarding.

## Final go/no-go gate

Do not call GymDesk production-ready until all of these are true:

- [ ] Public HTTPS deployment is live.
- [ ] Hosted database migrations and restore rehearsal are complete.
- [ ] Cashfree payment and webhook tests pass.
- [ ] WhatsApp consent, templates and delivery handling pass.
- [ ] Real phone/tablet/kiosk tests pass.
- [ ] Accessibility and large-data checks pass.
- [ ] Monitoring, backups, alerts and incident ownership exist.
- [ ] Privacy, terms, support and deletion procedures are published.
- [ ] Pricing and GymDesk subscription collection are decided.
- [ ] A pilot gym has completed a full billing cycle successfully.

## Current status

The repository contains the zero-cost deployment, health endpoint, scheduled maintenance, hourly uptime checks, encrypted off-site backup workflow and client-side photo reduction. The remaining work needs real accounts or people: provision the services, deploy, perform a restore rehearsal, test real devices and live providers, publish legal/support material and complete a controlled pilot.
