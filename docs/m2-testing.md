# M2: invoices, payments, UPI, claims, Cashfree and Dues

## Setup

Use a local test gym. Sandbox Cashfree payments are test money, but GymDesk records them like real payments, so never connect sandbox keys to a gym with real members.

```powershell
pnpm install
pnpm db:start
pnpm exec supabase migration up --local
pnpm db:types
pnpm dev
```

M2 adds four migrations: `20261101000008_cashfree_enums.sql`, `20261101000009_billing.sql`, `20261101000010_secrets_audit_fix.sql` and `20261101000011_payment_collector_removal.sql`. They are additive. Existing members, invoices and payments are kept. Do not run `pnpm db:reset` on a database whose data you want to keep.

M2 adds no environment variables. It uses the existing values in `.env.local`:

| Variable                 | M2 use                                                                                         |
| ------------------------ | ---------------------------------------------------------------------------------------------- |
| `PORTAL_TOKEN_SECRET`    | Signs the per-invoice pay links (`/p/pay/<token>`, valid 30 days) and keys public rate limits. |
| `SECRETS_ENCRYPTION_KEY` | Encrypts each gym's Cashfree secret key (AES-256-GCM). Changing it makes saved keys unusable.  |
| `NEXT_PUBLIC_APP_URL`    | Origin of pay links and the Cashfree webhook URL.                                              |

With an `http://` app URL (local), Cashfree is not given webhook or return URLs, because it accepts only HTTPS. Use **Check payment status** on the invoice to record a sandbox payment. On an HTTPS deployment, webhooks record payments automatically.

## Automated checks

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm test:rls
pnpm format:check
pnpm build
pnpm audit --audit-level high
```

Unit coverage adds GST-inclusive splits, FY invoice numbers, amount in words, pay-link signing (tampering, expiry, non-canonical tokens), Cashfree request headers, webhook signature checks and payload parsing, secret encryption, billing schemas (12-digit UTR, amounts, reasons, Cashfree keys) and one-page PDF rendering for tax invoices, receipts and void documents.

The database tests add idempotent counter payments, request conflicts, balance limits, UTR rules and duplicate UTRs; cross-gym and role checks for payments, reversals and voids; claim submission (service role only), confirmation, rejection, the daily claim limit and automatic confirmation when staff record the same UTR; one live Cashfree link per invoice, lapsed and cancelled link replacement, server-only gateway recording that is idempotent per Cashfree payment; payment settings and credentials limited to owners and managers, with the ciphertext kept out of the audit log; Dues scoping, filters, claims-first ordering and hidden deleted members; removing a team member who collected payments; and anonymous access.

## Recorded validation

Validation used the local Supabase stack, a temporary GST-registered test gym and the production Next.js build. The test gym, its users and the QA files were deleted afterwards.

| Check                                       | Result                                                                                                                                         |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm lint`, `pnpm typecheck`, `pnpm build` | Passed                                                                                                                                         |
| `pnpm test`                                 | 137 tests passed                                                                                                                               |
| `pnpm test:rls`                             | 32 tests passed                                                                                                                                |
| `pnpm format:check`                         | Passed                                                                                                                                         |
| `pnpm audit --audit-level high`             | Passed. The dev-only `minimatch` advisory from M1 (GHSA-g3hv-75wg-m249, moderate) remains                                                      |
| Generated database types                    | Matched the applied schema                                                                                                                     |
| Browser workflows (scripted Chromium)       | Owner, anonymous member and staff flows at 360/390 px, plus the main screens at 1280 px. See the checklist below. No failed requests or errors |
| PDFs                                        | Tax invoice (open, with UPI QR), paid receipt with a reversal, and void document checked for GSTIN, place of supply, SAC, CGST/SGST and totals |

Issues found and fixed during validation:

- Saving any gym credential failed (`malformed array literal`) because the secrets audit trigger built its change list incorrectly. Fixed in `20261101000010_secrets_audit_fix.sql`.
- A team member who had recorded a payment could not be removed, and their account could not be deleted, because clearing `payments.collected_by` was blocked by the payment immutability trigger. Clearing the collector is now the only change that trigger allows. Fixed in `20261101000011_payment_collector_removal.sql`.
- A production build served over plain HTTP (`pnpm start` locally) told the browser to upgrade requests to HTTPS, which broke links such as **Download PDF**. The `upgrade-insecure-requests` directive and HSTS are now sent only when `NEXT_PUBLIC_APP_URL` is HTTPS.
- Invoice pages and PDFs showed the membership period twice. The line item already carries the billed period, so the extra line was removed.

Not yet run: a live Cashfree sandbox payment (needs your sandbox keys), webhook delivery (needs a public HTTPS URL), axe scans of the M2 screens, and the Playwright suite planned for M6.

## Cashfree sandbox test

1. In the Cashfree merchant dashboard, switch to **Test** mode and open **Developers → API keys**. Copy the App ID and secret key.
2. In GymDesk, open **More → Payment settings → Connect Cashfree**. Choose **Sandbox (test)**, paste both keys and select **Save and verify**. GymDesk checks the keys with Cashfree before saving them. The secret is never shown again.
3. Optionally set **Default way to collect** to **Cashfree link**.
4. Open an unpaid invoice and select **Create Cashfree link**. Use **Open link** and pay with the test UPI ID `testsuccess@gocash`. Use `testfailure@gocash` to see a failed payment.
5. Back on the invoice, select **Check payment status**. The payment must appear once, with method Cashfree, and the link must show **Paid**. Repeating the check must not add a second payment.
6. Create a link on another invoice, then record a counter payment that changes the balance. The open link must be cancelled, with a notice.
7. On the member's pay link, **Pay online** must open Cashfree checkout for the balance. After paying, return to the pay page; it updates after the payment is recorded.
8. Try **Disconnect Cashfree** while a link is open. It must ask you to cancel open links first.

## UI acceptance checklist

### Dues

1. The **Pending dues** tile on Today opens **Dues** and shows the open invoice count.
2. Dues lists open invoices of live members, oldest due date first. Invoices with claims to review are always on top.
3. The **Outstanding** and **Overdue** cards and the **All**, **Overdue**, **Due today**, **Upcoming** and **Claims to review** filters show counts for the current search. Search works by name, phone, member code and invoice number.
4. Deleted members' invoices do not appear. Voided and paid invoices leave the list.

### Invoice and GST

1. Open an invoice from Dues or from the member profile (**Pending dues** or the **Payments** tab).
2. With GST enabled, verify the plan price, discount, taxable value and the CGST/SGST split at half the gym's GST rate each. The total is GST-inclusive: a ₹1,050 plan at 5% shows ₹1,000 taxable value and ₹25 + ₹25.
3. Invoice numbers are sequential per gym and financial year, for example `ITF/26-27/0004`, and are never reused.
4. **Download PDF** opens a tax invoice with GSTIN, place of supply, SAC 999723, amount in words, payments received and the balance. Without GST, it is a receipt with no tax lines.

### Record, reverse and void

1. **Record payment** opens a bottom sheet on mobile. The amount defaults to the balance and cannot exceed it. Choose cash, UPI, card or bank transfer. A UTR is allowed only for UPI and must be exactly 12 digits. The date can be today or up to 90 days back.
2. A part payment makes the invoice **Partially paid**. Recording the rest makes it **Paid**. A repeated submit must not record twice.
3. The same UTR cannot be recorded twice in one gym.
4. Owners and managers can **Reverse** a payment with a reason. The original stays on record, a negative reversal is added and the balance reopens. A payment cannot be reversed twice. Staff do not see **Reverse**.
5. **Void invoice** (owner or manager) needs a reason and is refused while payments remain; reverse them first. A void invoice keeps its number, shows the reason, has no balance and closes open links and claims.

### Direct UPI and pay links

1. **Show UPI QR** shows a QR for the balance, payable to the gym's UPI ID and payee name. It is hidden when no UPI ID is set.
2. **Share pay link** shows a link valid for 30 days, a **Copy link** button, and **Send on WhatsApp** only when the member gave messaging consent.
3. Open the link in a private window (no sign-in). It shows the gym, the invoice, the amount due, a UPI QR and **Pay in UPI app** button, and a **Download receipt** link. **Pay online** appears only when Cashfree is connected.
4. Submit a claim with a short UTR: it is refused. Submit a 12-digit UTR and an amount up to the balance. The page shows **Waiting for the gym**. Reusing a UTR is refused. A member can send at most three claims per invoice per day.
5. A changed or expired link shows that the link has expired. A void invoice shows that it was cancelled.

### Claims review

1. Claims appear on top of Dues with a **claims to review** badge and on the invoice under **Payment claims**, with UTR, amount, time and note.
2. **Confirm** records a UPI payment with that UTR and date. Only confirm after the money is visible in the bank or UPI app.
3. **Reject** needs a reason. The member's page shows **Not accepted** with the reason, or **Confirmed** and **Paid in full**.
4. If staff record a UPI payment with the same UTR as a pending claim, the claim is confirmed automatically.

### Payment settings and roles

1. **More → Payment settings** is available to owners and managers only. Staff do not see the link, and the page does not show them the form.
2. Save a UPI ID and payee name. Both are needed together. **Direct UPI** as the default needs a UPI ID; **Cashfree link** needs Cashfree connected.
3. The webhook URL is shown with a copy button. On a local HTTP setup, a note explains that webhooks need HTTPS.
4. Staff can record payments and confirm or reject claims, but cannot reverse, void, or change payment settings.

### Responsive checks

Repeat the Dues, invoice, record payment and pay page flows at 360 px and at a desktop width. Verify that there is no horizontal page scrolling, controls are at least 44 px tall, and bottom sheets scroll and close with Escape.
