# M5 validation

M5 covers the Today dashboard, reports, expenses, CSV exports, and photo selection during member creation. Local Supabase migrations `20261106000015_reports_expenses.sql` and `20261106000016_report_profile_access.sql` were applied without resetting the database. Generated database types were refreshed.

## Implemented

- Today links its collection, dues, expiry, attendance and member KPIs to their screens.
- Reports are restricted to owners and managers. An IST month or April–March financial year shows net collections, breakdowns by method/plan/staff, attendance including zero days or months, and overdue members.
- Expenses are owner/manager only. Creation, editing and deletion go through audited SQL functions; direct table writes have no RLS policies.
- CSV downloads for members, invoices and payments read the signed-in gym through RLS, page through all rows, quote CSV fields and guard spreadsheet formula prefixes. Money is in INR with two decimals; dates and times are displayed in IST.
- New member creation offers camera capture and file selection, previews the choice, and uploads to the private member photo bucket after the member is created. If upload fails, the member remains created and the profile can be used to retry.

## Validation

- `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, and `pnpm build` passed. Unit tests: 174 passed. RLS tests: 47 passed.
- The M5 RLS test checks that staff and other gyms cannot write expenses or read reports, direct expense writes fail, expense changes are audited, and report net equals collections minus expenses.
- Browser walkthrough on an owner session: Reports and Expenses render at the local app URL; all three CSV links produced files with the expected headers. Temporary downloads were removed after checking them.

## Remaining acceptance checks

- Walk through Reports and Expenses at 390 px and 1280 px, including expense create/edit/delete and empty states; run axe scans.
- Capture a member photo on a real phone or tablet, choose a photo from the device, and verify both appear on the member profile.
- Export a gym with more than 500 rows per CSV type to verify pagination and spreadsheet import in Excel or LibreOffice.
