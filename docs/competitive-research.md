# Product research and GymDesk decisions

Research date: 30 October 2026. This is a bounded comparison, not a production certification of another product.

## Evidence and limits

| Reference                                                | What was inspected                                                                                                                                                                  | What it establishes                                                                                                                                                                                                           |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [GymForce](https://gymforce.in/)                         | Rendered public home page, plus public [member management](https://gymforce.in/features/gym-member-management/) and [billing](https://gymforce.in/features/billing-payments/) pages | The public presentation connects member context, renewals, dues and daily actions. Advertised automation, integrations and business results were not tested.                                                                  |
| [Kasratbook / GymForce](https://kasratbook.com/GymForce) | The requested URL in a real browser; the public [home page](https://kasratbook.com/)                                                                                                | The requested workspace redirects to sign-in. The public site advertises an action center, member CRM and collections. Authenticated workflows remain unknown. No account was created.                                        |
| [MyGymDesk](https://mygymdesk.com/)                      | Rendered home page and public [product page](https://mygymdesk.com/product/gym-management-software)                                                                                 | Membership countdowns, clear reporting periods and a front-desk activity feed are useful presentation concepts. The site explicitly labels the product screens and numbers as illustrative sample data, not customer results. |
| [MotionGym](https://github.com/cristianmarint/MotionGym) | Read-only source at `70fcd00b4409697fb9441f7047c35130aae53b98`                                                                                                                      | Source-level directory, profile, invoice and monthly renewal behavior. The application was not installed or run.                                                                                                              |
| [GYM-One](https://github.com/mayerbalintdev/GYM-One)     | Public URL reachability only                                                                                                                                                        | Clone timed out without a valid checkout. The user chose to continue without this source. Features, implementation and license were not assessed.                                                                             |

### REA runtime records

Public navigation used the assigned Factory browser pane. REA then passively inspected each page through that same pane:

- GymForce: `ev_54abf0dd9a8014939d8ab066d53b801cc1fbfea4476e233bea7faf7a3e589036`.
- Kasratbook sign-in redirect: `ev_dd48e93573818261a2704dcb99c1ef1ebd3d742b89f7c9985c0af1d1857b49e0`.
- MyGymDesk: `ev_30a08958b2a9d648f405617bb37bbbba02e4598e6445524fdd679890f5c2a9ef`.

These records establish public-page state, not logged-in functionality. Capture was origin-scoped, attach-limited and policy-filtered. Earlier network activity, private storage values, request bodies, authentication and backend behavior were not captured. A passive capture does not establish that REA performed the preceding navigation.

REA's controlled browser scenario rejected the assigned WebSocket endpoint, despite passive inspection supporting it. No protected discovery endpoint was used and no browser/client configuration was changed to bypass that limitation.

### MotionGym source findings

MotionGym is a Laravel 5.8 / Voyager application. Its README calls it pre-alpha, rather than production-ready:
[composer.json:10–16](https://github.com/cristianmarint/MotionGym/blob/70fcd00b4409697fb9441f7047c35130aae53b98/composer.json#L10-L16),
[README.md:58–60](https://github.com/cristianmarint/MotionGym/blob/70fcd00b4409697fb9441f7047c35130aae53b98/README.md#L58-L60).

- Its directory provides search, pagination, result totals and permission-gated CRUD controls:
  [browse.blade.php:10–105](https://github.com/cristianmarint/MotionGym/blob/70fcd00b4409697fb9441f7047c35130aae53b98/resources/views/vendor/voyager/people/browse.blade.php#L10-L105).
- Its renewal helper advances monthly coverage and creates an invoice, but the inspected helper does not wrap the saves in an atomic, idempotent transaction:
  [Helpers.php:183–236](https://github.com/cristianmarint/MotionGym/blob/70fcd00b4409697fb9441f7047c35130aae53b98/app/Http/Helpers.php#L183-L236).
- Its current-month “income” widget sums invoices. That must not be mistaken for confirmed cash collections:
  [CurrentMonthIncomeDimmer.php:25–39](https://github.com/cristianmarint/MotionGym/blob/70fcd00b4409697fb9441f7047c35130aae53b98/app/Widgets/CurrentMonthIncomeDimmer.php#L25-L39).
- No member spreadsheet import, attendance/check-in flow, membership freeze engine or custom chronological activity timeline was found in the inspected application routes, controllers, views, models, schema and tests. This is a bounded source-search result, not proof about uninspected deployments or plugins.

MotionGym uses the [MIT license](https://github.com/cristianmarint/MotionGym/blob/70fcd00b4409697fb9441f7047c35130aae53b98/LICENSE#L1-L21), copyright 2019 Cristian Marin. Copying substantial software would require retaining its notice; bundled assets need separate review. GymDesk incorporates no competitor code, logos, images or assets. The other products' public pages are references, not licenses to reuse their content.

## Chosen M1 refinements

The design direction stays practical: Inter, light neutral surfaces, emerald actions, semantic status colors and mobile-first 44 px controls.

1. **Actionable member overview.** Real, search-scoped counts for expiring memberships, expired memberships and outstanding dues. Every summary opens the matching filter. Counts are computed before pagination, under the caller's tenant and role, without counting deleted members as live.
2. **Faster renewal.** A directory shortcut opens the existing renewal dialog. It prefers the member's current plan only when that plan is still available. Existing IST start-date defaults, strict validation, audited RPC writes and idempotency remain authoritative.
3. **Explain membership state.** Show upcoming starts, remaining validity and exhausted sessions accurately; a frozen membership must not display a misleading running countdown. Add direct filters for upcoming memberships and members without a plan.
4. **Useful member context.** An original recent-activity feed combines recorded member creation, memberships, payments and the existing 90-day check-in window. It is not the complete audit log, and never invents activity.
5. **Guided import.** Make file → mapping → review progress explicit, let staff focus on skipped rows, and support a fresh file after completion. Existing duplicate checks, explicit consent, limits and unpaid-invoice semantics stay unchanged.

## Later milestones, not silent scope expansion

| Milestone | Relevant lesson                                     | GymDesk boundary                                                                                                 |
| --------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| M2        | Make dues and verification actionable               | Separate billed amounts from collected cash; staff-confirmed direct UPI and verified Razorpay events only.       |
| M3        | Tie attendance to valid membership                  | QR/kiosk and session consumption, not biometric collection.                                                      |
| M4        | Contextual follow-up                                | Consent, approved schedules, deduplication and provider delivery state; never assume marketing automation works. |
| M5        | Metric-to-action navigation and dated trends        | Real aggregates, clear periods and operational queues; no illustrative numbers or invented AI insights.          |
| M6        | Easier member self-service and safer administration | Existing hashed-token portal, role boundaries, audit and deletion requirements.                                  |

Classes, payroll, inventory/POS, workout/diet generation, AI assistants, multi-branch expansion, member logins and biometrics are not added by this research.
