# M3: attendance, member QR codes and kiosk mode

## Setup

```powershell
pnpm install
pnpm db:start
pnpm exec supabase migration up --local
pnpm db:types
pnpm dev
```

M3 adds one migration, `20261103000012_attendance.sql`. It keeps existing check-ins and members. It moves any saved kiosk PIN hash from `organizations` into the new `organization_kiosk` table and drops `organizations.kiosk_pin_hash`. Do not run `pnpm db:reset` on a database whose data you want to keep.

M3 adds no environment variables. `PORTAL_TOKEN_SECRET` also signs member check-in QR codes, so changing it makes every printed or shared code stop working. `NEXT_PUBLIC_APP_URL` is the origin of member card links (`/p/card/<token>`).

The camera works only on `localhost` or over HTTPS. To test scanning from a phone on your network, serve the app over HTTPS (for example with a tunnel). The Permissions-Policy header allows the camera on the app's own origin only.

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

Unit coverage adds member QR tokens (round trip, version binding, other secrets, tampering, non-canonical spellings, card-link extraction), kiosk device tokens, parsing of check-in results, kiosk keypad lookup (member code or phone), hourly buckets and the attendance schemas.

The database tests add: the PIN hash is unreadable to every team member and direct check-in inserts are refused; one check-in per five minutes; another gym's member is reported as not found; owners override a block directly while staff need the right PIN; the five-try lockout and how saving the PIN clears it; settings, PIN status and pairing limited to owners and managers; kiosk functions callable only by the service role, with the device recorded on the check-in, another gym's members refused and PIN-only overrides; exit with the PIN revoking the device; removing the PIN turning off every kiosk; member QR resets inside the gym only; and anonymous access.

## Recorded validation

Validation used the local Supabase stack and the production Next.js build.

6 November follow-up: the member QR download had an SVG payload with a `.png` filename, which macOS Preview rejected. The authenticated download route now serves a 1024 px PNG with `image/png` and an attachment filename. A unit test checks its PNG signature and dimensions. A fresh browser download completed, and macOS `sips` recognized the saved file as PNG; a signed-out request redirects to sign-in. The on-screen QR remains SVG.

| Check                                       | Result                                                                                                                                                      |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm lint`, `pnpm typecheck`, `pnpm build` | Passed                                                                                                                                                      |
| `pnpm test`                                 | 156 tests passed                                                                                                                                            |
| `pnpm test:rls`                             | 41 tests passed                                                                                                                                             |
| `pnpm format:check`                         | Passed                                                                                                                                                      |
| `pnpm audit --audit-level high`             | Passed. The dev-only `minimatch` advisory (GHSA-g3hv-75wg-m249, moderate) remains                                                                           |
| Generated database types                    | Regenerated after the migration                                                                                                                             |
| HTTP smoke test (production build)          | `/kiosk` without a device shows the unpaired screen, an invalid card link shows the invalid card message, and `/attendance` signed out redirects to sign-in |

Issue found and fixed during validation: `check_in_member`, `reset_member_qr` and `revoke_kiosk_device` answered `forbidden` for another gym's id, which confirmed that the id exists. They now look ids up inside the caller's gyms and answer not found.

Not yet run: the browser walkthrough below (desk, scanner, kiosk and settings at 390 px and 1280 px), camera scanning on a real phone and tablet, axe scans, and the Playwright suite planned for M6.

## UI acceptance checklist

### Attendance screen

1. **Attendance** shows today's check-ins with totals (check-ins, members, needs attention, by QR), a by-hour chart and a 7-day chart. Use the arrows or the date picker to view another day; a future date falls back to today.
2. On today's view, every team member sees the check-in desk. Search by name, phone or member code (at least 2 characters). **Check in** adds the member to the list and shows a result card with the flag (expiring, expired or dues).
3. Checking in the same member again within five minutes shows **already checked in at** with the first time, and adds no row and uses no session.
4. **Scan QR** opens the camera. A member's QR or card link checks them in. A code from another gym or a replaced code is refused with a clear message. If the camera is blocked or missing, the scanner says so and offers **Retry camera**.
5. The list shows the method (Desk or QR), a **Kiosk** tag for kiosk check-ins and a **Let in** tag for overrides. Deleted members appear as **Deleted member**.

### Blocked members

1. In **More → Attendance settings**, turn on **Block expired members**.
2. Check in a member with no active membership. The **Membership has expired** dialog offers **Open profile** and **Let in anyway**.
3. As an owner or manager, **Let in anyway** checks them in at once.
4. As staff, it asks for the kiosk PIN. A wrong PIN says **Wrong PIN**. Five wrong PINs lock it for five minutes. The right PIN checks the member in. Every override appears in the audit log.

### Member profile

1. The member profile shows **Check in** and **Check-in QR** next to Call and WhatsApp.
2. **Check-in QR** shows the code with the member code, **Download** (PNG), **Copy link** for the card page, and **Send on WhatsApp** only when the member gave messaging consent.
3. Open the card link in a private window. It shows the gym, the QR code, the member's name and code, with no sign-in.
4. **Replace code** asks for confirmation, then shows a new code. The old code and the old card link stop working at once.

### Kiosk mode

1. **More → Attendance settings**: set a kiosk PIN (4-6 digits, entered twice).
2. On the front-desk tablet, sign in as an owner or manager, open **Attendance** and select **Kiosk mode**. Name the device and select **Start kiosk**. The tablet signs out and opens the kiosk.
3. The kiosk shows the gym name and time and opens the camera. A member's QR code shows a welcome with their first name and photo, days or sessions left, and dues or expiry notes. The screen resets after a few seconds.
4. **Type number instead** opens a keypad. Entering the phone number or member code (for example `42` or `M42`) checks the member in. An unknown number says to ask the front desk.
5. With blocking on, an expired member sees **Please see the front desk**. **Staff: let in with PIN** checks them in with the PIN.
6. **Exit kiosk** needs the PIN and returns the tablet to sign in. Going to any app page from the kiosk requires signing in.
7. In attendance settings, the device appears under **Kiosk devices** with when it was started and last used. **Turn off** stops it; the tablet shows **This device is not a kiosk** on its next check-in. **Remove PIN** turns off every kiosk.

### Roles

1. Staff can check members in, scan codes and replace a member's code, but cannot change attendance settings or start kiosk mode, and do not see the attendance settings link.
2. Another gym's members, devices and settings are never visible.

### Responsive checks

Repeat the desk, scanner, member QR and kiosk flows at 390 px and at a desktop or tablet width. Verify that there is no horizontal page scrolling, controls are at least 44 px tall, dialogs scroll and close with Escape, and the kiosk keypad and PIN pad are usable by touch.
