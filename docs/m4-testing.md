# M4: reminders, message templates and WhatsApp delivery

## Setup

```powershell
pnpm install
pnpm db:start
pnpm exec supabase migration up --local
pnpm db:types
pnpm dev
```

M4 adds two migrations. `20261104000013_messaging_enums.sql` adds the `skipped` message status (enum values must be committed before use, so it runs on its own). `20261104000014_messaging.sql` adds `members.preferred_language` (existing members get English), message templates, the WhatsApp connection columns and the messaging functions, and closes direct writes to `message_logs`. Both are additive. Do not run `pnpm db:reset` on a database whose data you want to keep.

M4 uses `CRON_SECRET`, which was already in `.env.example`. Vercel Cron sends it as `Authorization: Bearer <CRON_SECRET>` to `/api/cron/daily` at 04:30 UTC (10:00 IST), as set in `vercel.json`. The WhatsApp access token is encrypted with `SECRETS_ENCRYPTION_KEY`, like the Cashfree secret.

To run the daily job by hand (PowerShell):

```powershell
curl.exe -H "Authorization: Bearer <CRON_SECRET>" http://localhost:3000/api/cron/daily
```

It refreshes membership statuses, runs maintenance, expires prepared messages older than three days, then prepares today's reminders and birthday wishes and sends them for gyms that use the WhatsApp Cloud API. Every step is safe to repeat. The response lists each step's result, and the status is 500 if any step failed.

### WhatsApp Cloud API

Automatic sending needs a Meta WhatsApp Business account, a phone number ID and a permanent System User token with the `whatsapp_business_messaging` permission. In **More → Messaging settings**, connect the number (GymDesk reads the number from Meta before saving), then create each template listed on that page in WhatsApp Manager. Use the exact name (`gymdesk_<kind>`), category and text shown there, in English (`en`) and Hindi (`hi`). WhatsApp only delivers business-started messages that use approved templates, so text edited in GymDesk applies to manual sends only.

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

Unit coverage adds template rendering and placeholder checks (including every built-in English and Hindi default), Meta template text and positional parameters, Hindi and English dates, day-list parsing, reading and round-tripping messaging settings, the settings and template schemas, cron authorization, the WhatsApp Cloud API client with a mocked `fetch` (request shape, errors, timeouts, unexpected responses), Meta error codes mapped to staff-facing keys, and the error text shown in Messages.

The database tests add: one welcome per member and one receipt per payment, only for consenting members of the caller's gym; staff cannot prepare reminders or birthday wishes; marking sent, skipping and claiming an API send exactly once, including the 10-minute claim window; messaging settings, templates and WhatsApp credentials limited to owners and managers, with the token unreadable to staff; daily candidates listed once per day and only for consenting members; and no messaging functions or templates for anonymous users.

## Recorded validation

Validation used the local Supabase stack and the production Next.js build.

| Check                                       | Result                                                                                                                         |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm lint`, `pnpm typecheck`, `pnpm build` | Passed                                                                                                                         |
| `pnpm test`                                 | 174 tests passed                                                                                                               |
| `pnpm test:rls`                             | 46 tests passed                                                                                                                |
| `pnpm format:check`                         | Passed                                                                                                                         |
| `pnpm audit --audit-level high`             | Passed. The dev-only `minimatch` advisory (GHSA-g3hv-75wg-m249, moderate) remains                                              |
| Generated database types                    | Regenerated after the migrations; regenerating again produced an identical file                                                |
| Cron smoke test (production build)          | `/api/cron/daily` answers 401 without or with a wrong secret; with the secret it answers 200 twice in a row with every step ok |
| Page smoke test (production build)          | `/messages` and `/settings/messaging` signed out redirect to sign-in                                                           |

Not yet run: the browser walkthrough below at 390 px and 1280 px, a live send through the WhatsApp Cloud API (needs a Meta business account, a number and approved templates), Vercel Cron on a deployment, axe scans, and the Playwright suite planned for M6.

## UI acceptance checklist

### Member language and consent

1. **New member** has a **Message language** field that defaults to the gym's language in messaging settings. The member profile shows the language and lets you change it.
2. Only members with WhatsApp consent get messages. Turning consent off before a message is sent stops it from being sent through the API.

### Receipts and welcome messages (manual sending)

1. With **Staff send them from WhatsApp** selected, create a member with consent. A toast says the welcome message is waiting in Messages.
2. Record a payment for a consenting member, or confirm a UTR claim. A toast says the receipt is waiting. A Cashfree payment recorded by the webhook or by **Check payment status** also queues a receipt.
3. **Messages → To send** lists both with the member, the kind, the language and the text. **Send on WhatsApp** opens WhatsApp with the text ready and moves the message to **History** as sent by staff. **Skip** moves it to History as skipped.
4. The receipt contains the amount, the invoice number, the balance and a pay link; the welcome contains the member code and the check-in card link.
5. Recording the same payment twice (a retried submit) does not create a second receipt.

### Daily reminders

1. In **More → Messaging settings**, set the reminder days (for example `7, 3, 0` before the end, `1` after expiry, `3, 7` after an invoice due date) and choose which messages to prepare. Invalid lists (more than five numbers, out of range, not whole numbers) show an error.
2. **Today** shows how many messages are waiting, with a link to Messages.
3. In Messages, **Prepare today’s reminders** prepares due reminders and birthday wishes now instead of at 10:00. Selecting it again says there are no new reminders.
4. A member gets at most one reminder a day: expired before expiring before dues. A member whose next membership is already booked gets no expiry reminder. A birthday wish is separate from the reminder.
5. A prepared message nobody sent within three days moves to History as skipped, with **Not sent within 3 days.**

### Templates

1. **Messaging settings → Edit message text** opens the templates with English and Hindi tabs. Each kind lists the placeholders it fills in and shows a preview with sample values.
2. A placeholder that kind cannot fill (for example `{amount}` in a birthday wish) is refused with the placeholder named.
3. **Use default text** returns an edited template to the built-in text. Edited text is used for messages prepared afterwards.

### WhatsApp Cloud API

1. **Connect WhatsApp** checks the phone number ID and token with Meta. A wrong token or a number the token cannot use is refused and nothing is saved. When connected, the page shows the number, the business name and the templates to create.
2. **Send automatically with WhatsApp Cloud API** can be selected only once the number is connected.
3. With approved templates, receipts and welcome messages send right away and the toast says so. Reminders send at 10:00 IST.
4. A failed send stays in **To send** with a reason (for example the template is missing or not approved, the number is not on WhatsApp, the token was rejected). **Retry** sends it again through the API; **Send on WhatsApp** still works by hand. A rejected token stops the rest of that gym's batch.
5. **Disconnect** stops automatic sending and moves waiting messages back to manual sending. Saving, replacing and removing the token appear in the audit log without the token.

### Roles

1. Every team member can see Messages, send, skip, retry and prepare today’s reminders.
2. Only owners and managers see **Messaging settings**, edit templates and connect WhatsApp. Staff never see the token.
3. Another gym's messages, templates and settings are never visible.

### Responsive checks

Repeat the Messages, settings and template flows at 390 px and at a desktop width. Verify that there is no horizontal page scrolling, long message text wraps, controls are at least 44 px tall and dialogs close with Escape.
