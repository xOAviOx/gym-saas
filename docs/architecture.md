# Architecture

## Request flow

1. `proxy.ts` runs on every request except static assets and machine-to-machine routes. It refreshes the Supabase session cookie and verifies the user with Supabase Auth (`getUser`), so a still-valid token for a deleted account counts as signed out. Signed-out users go to `/sign-in?next=…` and signed-in users are sent away from the auth pages; both redirects keep any refreshed or cleared session cookies.
2. Pages are Server Components. They call `requireOrg()` (`lib/auth/session.ts`), which resolves the active gym from `profiles.active_org_id` and verifies it against the caller's active `team_members` rows. A user without a gym is sent to `/onboarding`. A page restricted to certain roles returns 404 for other roles so it is not discoverable.
3. Every mutation is a Server Action in `features/<feature>/actions.ts` wrapped in `runAction()`:
   authenticate → resolve active org from the session → authorize role → parse with the shared zod schema → write (RPC for multi-step, table write for single-step) → audit → `revalidatePath`.
   The client never supplies an `org_id`; it is always taken from the session.
4. Actions return `ActionResult<T>` (`ok` or a typed error with optional field errors). `applyActionResult()` maps field errors back into react-hook-form and shows a toast for the rest.

## Database

- Postgres with row-level security on every table. The base policy is `org_id in (select my_org_ids())`; privileged tables (expenses, organization settings) further require owner or manager. Invoices, invoice_items, payments, payment_claims, collection_requests, organization_secrets, check_ins, kiosk_devices, message_logs, message_templates, team_members and audit_logs have no direct write policies and change only through SQL functions. Payments are never updated or deleted; a trigger allows only clearing `collected_by` when a team member is removed. Organization secrets are readable by owners and managers only.
- Multi-step writes (create gym, create membership, record payment, confirm claim, check-in, …) are `security definer` functions. Each checks the caller's role with `assert_org_role`, performs the whole change in one transaction and writes its own audit row.
- Member, plan and membership writes have no direct authenticated insert/update policies. `create_member`, `update_member`, `save_plan`, `enroll_member` and the lifecycle/import RPCs are the audited write paths. `create_member` and enrollment use request UUIDs for safe retries; member creation, its optional membership, its invoice and its audit rows commit or roll back together.
- The `member_directory` view is `security_invoker`, so RLS applies to its members, memberships, plans and invoices. `list_members` scopes the gym, validates filters and paging, searches literal substrings, and orders dues/expiry first. Its overview counts and balance are computed over the same search matches before the selected status filter and pagination. Live totals exclude deleted records; deleted counts, browsing and restore require owner or manager.
- Membership read paths compute status using the current IST date, including elapsed freezes, rather than relying on the maintenance job to have updated a cached status. Renewal defaults follow the latest eligible inclusive end date; exhausted/expired coverage renews from today.
- All date logic uses Asia/Kolkata on the server (`ist_today()`), money is `numeric(10,2)` in SQL and integer paise in TypeScript (`lib/money.ts`).
- Generated types (`lib/supabase/database.types.ts`) are the contract between SQL and TypeScript; CI fails when they drift.

## Supabase clients

| Client                   | Where                                                                                                                                                               | Key                                 |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `lib/supabase/server.ts` | Server Components and Server Actions                                                                                                                                | anon + cookie session (RLS applies) |
| `lib/supabase/client.ts` | Client Components (auth UI only)                                                                                                                                    | anon                                |
| `lib/supabase/proxy.ts`  | `proxy.ts`                                                                                                                                                          | anon                                |
| `lib/supabase/admin.ts`  | webhooks, cron, portal, pay-link and card routes after token validation, Cashfree and WhatsApp credential decryption, WhatsApp sends, invite acceptance, kiosk mode | service role                        |

The service role key never reaches a page or a client bundle.

## Member imports and photos

Spreadsheet parsing is lazy-loaded in the browser through the maintained SheetJS distribution. Files are limited to 5 MB, 500 member rows and 40 columns. The user chooses a worksheet, maps columns, reviews invalid/duplicate rows, then confirms. Both server actions use the shared member schemas; confirmation re-reads active plans and duplicate phones before the atomic import RPC. Messaging consent defaults to false, and historical payments are never inferred from a spreadsheet.

Member photos use the private `uploads` bucket under `{org}/members/{member}/{uuid}`. The Server Action checks size, MIME type and file signatures, updates the member through the audited RPC, and returns short-lived signed URLs for display.

## Member workflow context

Directory actions use the existing audited enrollment flow, not a second mutation path. Quick renewal prefers the member's current plan only while that plan remains available. The server still validates the plan, role, price and dates. Upcoming memberships show their start date; exhausted session memberships do not show a misleading days-left countdown.

Recent activity combines recorded member creation, membership creation, payments/reversals and the profile's 90-day check-in window. Events sort by their actual timestamp and display the six most recent entries in IST. This is a compact activity feed, not a complete audit log.

## Billing and payments

- Membership RPCs create the invoices. GST is inclusive: `lib/gst.ts` splits the total into taxable value and CGST/SGST at half the gym's rate each, in paise. Invoice numbers are sequential per gym and financial year (`<PREFIX>/26-27/0001`) and are never reused. Invoices are voided with a reason, never deleted, and only when no net payment remains.
- `record_payment` takes a request UUID, so a retried submit returns the first payment. It refuses amounts above the balance, accepts a UTR only for UPI (exactly 12 digits) and rejects a UTR already used in the gym. A reversal adds a negative payment linked to the original. Recording a payment, confirming a claim or voiding the invoice cancels its open Cashfree link, because the link amount would no longer match the balance.
- Pay links (`/p/pay/<token>`) carry an HMAC-SHA256 token signed with a key derived from `PORTAL_TOKEN_SECRET`, bound to one invoice and valid for 30 days. After verifying the token, the page and its PDF route read only that invoice through the service role. Claim, checkout and status requests are rate-limited per client. Members submit UPI claims through `submit_payment_claim`, which only the service role can call, at most three per invoice per IST day. Staff confirm a claim (which records a UPI payment) or reject it with a reason.
- Cashfree keys are checked with Cashfree before `save_cashfree_credentials` stores them. The secret key is encrypted with AES-256-GCM using `SECRETS_ENCRYPTION_KEY` and never appears in audit rows. An invoice has at most one live Cashfree link. Webhooks at `/api/webhooks/cashfree` are verified with the gym's secret (base64 HMAC-SHA256 of timestamp + raw body) and logged in `gateway_events`. The payment itself is always re-read from the Cashfree API before `record_gateway_payment` (service role only, idempotent per Cashfree payment id) records it. **Check payment status** on an invoice runs the same reconciliation.
- PDFs are generated on the server with `pdf-lib` (`lib/pdf/invoice-pdf.ts`): a one-page tax invoice when GST is enabled, otherwise a receipt, and a void document for voided invoices.

## Attendance and kiosk

- `check_in_member` is the only way a signed-in team member creates a check-in. It looks the member up inside the caller's gyms only, so another gym's member looks the same as a missing one. The shared `apply_check_in` core sets the flag (expired > expiring > dues pending), returns the earlier check-in as `duplicate` for a second scan within five minutes (no extra session is used), and consumes a session on session-based plans.
- When **Block expired members** is on (`organizations.settings.block_expired_checkin`), an expired member gets `blocked`. Owners and managers can let them in directly. Staff and the kiosk need the kiosk PIN, which SQL verifies. Every override writes a `check_in.override` audit row.
- The kiosk PIN hash lives in `organization_kiosk`, which has no policies, because every team member can read `organizations` and a 4-6 digit bcrypt hash is easy to brute-force offline. `verify_kiosk_pin` never raises on a wrong PIN, so the failure counter commits; five wrong tries lock the PIN for five minutes. Saving the PIN again clears a lockout. Removing it turns off every kiosk, because none could be exited.
- Member QR codes are `GDM1.<payload>.<signature>` (`lib/attendance/qr-token.ts`): the member id and a QR version, signed with HMAC-SHA256 under a purpose-specific key derived from `PORTAL_TOKEN_SECRET`. They do not expire. `reset_member_qr` bumps `members.qr_version`, which stops the old code and its card link. The scanner also accepts a scanned `/p/card/<token>` URL. The public card page shows the code after verifying the token and version through the service role.
- The scanner uses the browser `BarcodeDetector` where available and falls back to `jsQR` on canvas frames.
- Kiosk pairing: an owner or manager on the front-desk device calls `create_kiosk_device` (needs a PIN, at most 10 live devices). The device gets a random 32-byte token in an httpOnly `gd_kiosk` cookie; only its SHA-256 is stored. The user session is then signed out, so the tablet never holds staff credentials. `/kiosk` is public in the proxy; kiosk actions resolve the device from the cookie and call `kiosk_check_in` / `kiosk_exit`, which only the service role can execute. Kiosk check-ins are rate-limited per device (60 a minute, 10 PIN attempts per 5 minutes), and the kiosk shows only the member's first name and photo.
- Exiting kiosk mode needs the PIN and revokes the device. Owners and managers can also turn a device off from attendance settings; its next request shows the unpaired screen.

## Messaging and the daily job

- Messages are WhatsApp texts for members with `consent_messaging`: membership expiring and expired, dues overdue (with a pay link), payment receipts, welcome (with the check-in card link) and birthday wishes, in English or Hindi (`members.preferred_language`). The app renders every body (`features/messaging/render.ts`), because it signs the pay and card links, and stores it with `prepare_message`. That function checks consent and that the invoice and payment belong to the same member and gym. `message_logs` has no direct write policies.
- Unique indexes keep one reminder per member per day, one birthday wish per day, one receipt per payment and one welcome per member, so a retried payment or a rerun of the job returns the existing message. Staff sessions may prepare only receipts and welcomes; reminders and birthday wishes come from the daily job.
- Receipts and welcome messages are prepared after the payment or member is saved (`features/messaging/hooks.ts`). These hooks never throw: a message problem must not look like a failed payment.
- Per-gym text overrides live in `message_templates`; a missing row means the default in `lib/copy.ts`. Placeholders are `{name}`-style and each kind accepts only its own (`lib/messaging/templates.ts`). Settings (kinds, reminder days, default language, provider) are keys in `organizations.settings`, saved through `save_messaging_settings`.
- **Manual provider**: messages wait in Messages; **Send on WhatsApp** opens `wa.me` with the text and calls `mark_message_sent`. **Skip** calls `skip_message`.
- **WhatsApp Cloud API provider**: the phone number ID and an access token are checked with Meta (`GET /<phone-number-id>`) before `save_whatsapp_credentials` stores them. The token is AES-256-GCM ciphertext bound to the gym (`whatsapp:<org id>`), and only the service role decrypts it. Business-started WhatsApp messages must use approved templates, so the API sends `gymdesk_<kind>` with the default text's placeholders as positional parameters; edited text applies to manual sends. `begin_api_send` claims a message for 10 minutes (refusing it if consent was withdrawn), so the daily job and a staff retry send it at most once; `record_message_result` stores the WhatsApp message id or a staff-facing error key. Removing the connection moves waiting messages back to manual sending.
- `/api/cron/daily` runs at 04:30 UTC (10:00 IST, `vercel.json`) with `Authorization: Bearer <CRON_SECRET>`, compared in constant time. It refreshes statuses, runs maintenance, marks prepared messages older than three days as skipped, then asks `daily_message_candidates` who is due today (at most one reminder per member: expired before expiring before dues; no expiry reminder when a later membership is booked) and prepares and sends them. Every step is safe to repeat, and the route answers 500 if any step failed. Staff can run the same preparation for their gym from Messages.

## Text and formatting

All user-facing strings live in `lib/copy.ts`. Money is formatted with `Intl` for `en-IN` (`₹1,25,000`), dates as `12 Mar 2026`, relative dates as `3 days left` / `5 days overdue`.

Use `FormItem hasDescription` when a field renders `FormDescription`. Controls then reference existing help text and validation messages without generating dangling `aria-describedby` IDs.

## Security headers

`next.config.ts` sets a Content-Security-Policy, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` and a Permissions-Policy that allows the camera only for the QR scanner. HSTS with preload and the `upgrade-insecure-requests` directive are sent only in production builds whose `NEXT_PUBLIC_APP_URL` is HTTPS, so a local `pnpm start` over HTTP keeps working.
