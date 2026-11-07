# M6 validation

M6 adds private member links, gym and team settings, an owner audit viewer, owner-only member data export and erasure, an installable PWA shell, an opt-in local demo seed, and Playwright smoke tests. Local migration `20261106000017_m6_access.sql` was applied without resetting data and generated database types were refreshed.

## Implemented

- A member portal link is a random 256-bit token. Only a purpose-bound SHA-256 hash is stored. Links expire after 30 days and can be revoked. The public page shows only the linked member's memberships, invoices and ten recent check-ins. It uses a separate token from the permanent check-in QR. Invoice buttons create their own 30-day pay links.
- Gym settings edit the profile, invoice prefix, GSTIN and rate. The organization audit trigger records changes.
- Team settings issue seven-day email-bound invitations. The invite landing preserves the target through sign-in, sign-up and email confirmation. Existing audited SQL functions change team roles and active status.
- Invitation and portal-token direct writes are closed. New role-checked SQL functions issue and revoke links and write audit rows without token hashes.
- Audit history is owner-only and paged 50 at a time. Member JSON export is owner-only, paged in batches of 500, and downloaded with private no-store headers. Permanent erasure requires an already deleted member in both the UI and SQL and removes the current private photo before anonymizing data.
- The manifest has 192/512 PNG icons and a service worker. It caches only the offline page and icon, never private pages or check-ins. Check-ins still require connectivity.
- `pnpm seed:demo <local-gym-uuid>` adds twelve example members and two plans to an explicitly selected local gym. It refuses a non-local Supabase URL and does not run automatically.

## Checks

- `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:rls`, `pnpm test:e2e`, `pnpm format:check`, and `pnpm build` pass.
- Unit tests cover token shape/hash. RLS tests cover blocked direct token/invitation writes, gym isolation, audited issue/revoke, and the live-member erasure guard.
- Playwright checks signed-out redirects, invalid and revoked portal links, an owner creating and opening a valid link, member JSON download, an invited user accepting a seven-day link, and the install manifest. Each authenticated test creates and removes its own local gym and accounts.
- The signed-in owner pages for Gym settings, Team and Audit history rendered in the local browser.

## Still to validate

- Repeat the tested invitation, valid portal link and revocation flows on a public HTTPS deployment. The local `NEXT_PUBLIC_APP_URL` is `localhost`; links sent to phones will not reach this computer.
- Test installation and offline fallback on a real phone/tablet. The offline shell does not queue attendance or payment writes.
- Test large member JSON exports and erasure of a member with every related record type and a photo.
- Complete carried-over real-device, accessibility, Cashfree and WhatsApp provider checks listed in `FUTURE_PLAN.md`.
