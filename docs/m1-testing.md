# M1: members, plans and memberships

## Setup

Use a local test gym. Do not run acceptance writes against a production gym.

```powershell
pnpm install
pnpm db:start
pnpm exec supabase migration up --local
pnpm dev
```

Open `http://localhost:3000`, sign in, and create or select a gym. Existing local data is preserved. Use the existing `.env.local` from M0; M1 adds no environment variables. Google OAuth is not configured in the local stack.

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

Unit coverage includes date/status selection, renewal defaults, exhausted session plans, elapsed freezes, member/plan schemas, directory actions, timestamp-ordered activity, valid form accessibility references, column mapping, Excel's 1900/1904 date systems, consent and duplicate detection. Database tests cover cross-gym denial, staff permissions, search-scoped overview counts before filters/pagination, deleted-record privacy, atomic creation/import and rollback, concurrent duplicate phones, idempotent enrollment, historical prices, freeze day accounting, restore limits, and rejected direct/anonymous writes.

The database tests create and remove their own test users and gyms. They read keys from the environment or `.env.local`.

## Recorded validation

Validation used the local Supabase stack, an isolated test gym and the production Next.js build, not a production gym.

| Check                                       | Result                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm lint`, `pnpm typecheck`, `pnpm build` | Passed                                                                                                                                                                                                                                                                                                                                                                                |
| `pnpm test`                                 | 112 tests passed, including 19 sign-in redirect and session-cookie regressions                                                                                                                                                                                                                                                                                                        |
| `pnpm test:rls`                             | 23 tests passed                                                                                                                                                                                                                                                                                                                                                                       |
| `pnpm audit --audit-level high`             | Passed. One moderate advisory remains in ESLint's dev-only `minimatch` dependency (GHSA-g3hv-75wg-m249); it is not shipped to the app                                                                                                                                                                                                                                                 |
| Generated database types                    | Matched the applied schema                                                                                                                                                                                                                                                                                                                                                            |
| Authenticated Server Action HTTP checks     | 13 passed using a one-off local harness, not a CI suite                                                                                                                                                                                                                                                                                                                               |
| Browser workflows                           | Signed-out `/today` redirect to sign-in with `next`, sign-in, gym onboarding, Today and Members for a new gym; two-step create; edit/consent persistence; direct renewal with the same plan and queued coverage; exhausted-session start date; no-plan dialog/cancel; search-scoped counts, filters and metric navigation; import preview, skipped-row filter, confirmation and reset |
| Accessibility samples                       | No axe WCAG 2 A/AA violations on the settled directory, profile, import preview and membership dialog                                                                                                                                                                                                                                                                                 |

The open dialog's remaining axe `incomplete` findings were reviewed directly: focus stayed inside for 12 Tab and 12 Shift+Tab presses, Escape closed the dialog and restored trigger focus, and description contrast measured 7.73:1. A separate dangling help-text reference issue was reproduced by two failing SSR tests, fixed, then verified by all five form accessibility regression tests and a real-dialog DOM check.

The embedded browser pane did not support a fixed viewport override. Exact 360 px and full desktop-width visual acceptance remains manual. Google OAuth and the future Playwright suite were not run. These checks do not constitute a complete accessibility certification.

## UI acceptance checklist

### Plans

1. Open **More → Membership plans** as an owner or manager.
2. Create a duration plan with 30 validity days and a price of ₹1,500.
3. Create a session plan with 10 sessions, 60 validity days and a price of ₹2,500. Session count and validity must both be present.
4. Edit a plan and turn off **Available for new memberships**. It must remain in plan management and existing membership history, but disappear from new-membership choices. Existing dates and prices must not change.

### Add and find a member

1. Open **Members → Add member**. Enter a name and an Indian mobile number. Leave messaging consent off. The progress indicator must move from **Member details** to **Membership** before saving.
2. Choose a membership, start date and ₹100 discount. The ₹1,500 plan must show a ₹1,400 total. Save from this second screen.
3. Verify a sequential member code, the selected plan's inclusive dates, active status and ₹1,400 pending dues. With GST enabled, GST is included in the total, not added to it.
4. **WhatsApp** must be disabled without consent. **Call** must use the saved normalized number.
5. Search by part of the name, mobile number and member code. Try the Active, Expiring, Expired, Dues, Frozen, No membership and Upcoming filters.
6. Try adding the same phone with `+91`, spaces or hyphens. It must be refused without leaving an extra member, membership or invoice.
7. Add another member with **No plan yet**. The profile must show a clear no-membership state and no dues.

### Directory overview and actions

1. Search for a known group of test members. Verify **Ending in 7 days**, **Expired** and **Dues to follow up** against their real memberships and unpaid invoices.
2. Click each overview card. The matching filter must open without dropping the search text. Filter counts and the overview cover all search matches, not just the selected filter or current page.
3. Use **Renew** on an expiring/expired member and **Add membership** on a member without a plan. A current plan still available for sale must be preselected; an archived one must not be offered.
4. Verify that upcoming coverage shows its start date, frozen coverage says it is paused, and an exhausted session membership says **All sessions used**, even when its end date is still in the future.
5. **View dues** must open the selected member's dues section, not mark an invoice as paid.

### Edit, notes and photos

1. Open **Edit**. Change contact details, tags and messaging consent; save and reopen to verify persistence. Future birth dates and invalid phone/email values must be rejected.
2. Use the **Notes** tab to save an internal note. Open **Payments** and **Attendance**; a new member has empty states and an empty 90-day heatmap.
3. Open **Contact & details** and upload a JPEG, PNG or WebP under 5 MB. Verify display after refresh, replacement and removal. Other file types and oversized files must be refused. The storage bucket must not be public.
4. Verify **Recent activity** after creation and enrollment. Events must show real timestamps in IST, newest first. The feed displays up to six recorded events; it is not the complete audit log. Payments/reversals and check-ins appear only when those records exist.

### Renew and freeze

1. Renew an active member. The default start must be the day after the latest eligible coverage ends, including any queued renewal. The date remains editable.
2. For an expired or exhausted session membership, the default renewal start must be today in IST.
3. Freeze the current membership from today through a later date. Verify Frozen status, then unfreeze immediately: no unused future freeze days may be added.
4. Schedule a future freeze, then cancel it. The end date must not change. The database tests cover a completed freeze and early resume after two elapsed days.

### Delete and restore

1. As an owner or manager, delete a test member. It must disappear from the live list.
2. Open the **Deleted** filter, view the read-only profile, and restore it within 30 days. Its code and history must remain intact.
3. Staff must not see delete/restore or plan-management controls. The database tests also enforce the 30-day deadline and reject restore if another live member now has that phone.

### Excel import

1. Open **Import members** and download the header-only template.
2. Fill it with one valid new phone, one existing phone, a repeated new phone, and an invalid phone. Optionally include an active plan name and membership start date.
3. Upload `.xlsx`, `.xls` or `.csv`; for a multi-sheet workbook select the intended worksheet. The progress indicator must show **Choose file → Match columns → Review**, with the detected row count during mapping.
4. Verify suggested column mappings. Full name and phone are required, and a file column cannot be mapped twice.
5. Preview. Existing and in-file duplicates must be labelled; invalid rows must show their issues. Switch between **All rows** and **Skipped rows**. Counts must remain correct even when only the first 100 preview rows are displayed. Blank messaging consent means no consent. A plan needs a valid start date and a discount no greater than its price.
6. Confirm. Only ready rows may be imported. The final result must show imported/skipped counts. Revisiting or retrying the same import must not duplicate members.
7. Choose **Choose another file** after success. The file input, mappings and preview must reset without changing the members already imported.

Import creates unpaid membership invoices, not historical payments. Full/partial collection, UPI verification and payment reconciliation belong to M2.

### Responsive and accessibility checks

Repeat the key add/edit/renew/import flows at 360 px and at a desktop width. Verify no page-level horizontal scrolling, 44 px touch targets, a sticky mobile primary action, keyboard-accessible tabs, labelled controls, and bottom-sheet dialogs that can scroll and close without trapping focus.

For accessibility scans, wait until opening animations finish or the closed dialog has left the DOM. Scanning the fading exit state produces transient contrast findings. Check keyboard focus and any axe `incomplete` findings manually; zero automated violations is not a complete accessibility certification.
