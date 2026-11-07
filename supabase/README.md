# AGOS shared workspace database

The application uses the AGOS Supabase project, separate from School Attendance and Mathverse. `schema.sql` initializes a **new** database; `reference-data.sql` seeds the 62 Calapan barangays with the official 2024 census reference data. Operational requests, stocks, teams, reservations and deliveries start empty.

Apply these files in order:

1. `schema.sql`.
2. `reference-data.sql`.
3. On the fresh empty workspace, `verify-workflow.sql` to exercise the report-to-receipt sequence and its rejection paths. The verification script wraps all synthetic records and helpers in `BEGIN` / `ROLLBACK`; they are never retained as operational records. It refuses to run after real operational records exist.

After verification, confirm that reports, resources, teams and deliveries remain empty and that the 62 reference barangays remain present. Future schema changes should use explicit migrations: re-running `CREATE TABLE IF NOT EXISTS` is not a substitute for upgrading existing constraints.

## Connection and data ownership

The browser uses only the project URL and a publishable key in `src/config/supabase.ts`. Optional `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` variables override the checked-in public project configuration. Never put a secret/service-role key or database password in frontend code. Operational records are loaded from the database; local storage holds only role, barangay and team preferences. A failed write is reported and followed by a fresh snapshot so the user can check what was actually recorded before retrying.

`public.agos_snapshot()` returns reference data, operational state, the settings revision and the latest 500 audit entries. The full audit remains stored in `agos_audit`. Refreshing tabs never replaces newer state with a lower-revision snapshot.

## No sign-in, by project choice

AGOS is an intentionally **open shared workspace**. The three roles and selected barangay/team are declared workflow context, not verified identity or access control. Anyone with access to the app can choose any role and barangay. The server checks this declared context to prevent accidental use of the wrong workflow, but it cannot prove the caller is an LGU official or barangay representative.

All public-schema tables have RLS enabled and aggregate-data SELECT policies. Anonymous and authenticated roles have **no direct INSERT, UPDATE or DELETE grants**. Changes go through the bounded `public.agos_mutate(command, payload, context, expected_revision)` RPC. Its `SECURITY DEFINER` execution is intentional for this public no-sign-in workflow; it has an empty search path, strict command/input validation and no arbitrary SQL or whole-state replacement operation. Internal helpers live in a non-exposed schema with execution revoked from public roles. The automatic-RLS trigger function's unnecessary public EXECUTE grant is revoked separately.

Two Supabase security advisories intentionally remain for this one bounded API:

| Advisory | Reviewed exception |
| --- | --- |
| [Public Can Execute SECURITY DEFINER Function — lint 0028](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable) | `anon` can call `public.agos_mutate`, which is how this explicitly no-sign-in workspace records its validated aggregate workflows. |
| [Signed-In Users Can Execute SECURITY DEFINER Function — lint 0029](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) | `authenticated` has the same bounded API grant, with no extra authority beyond the intentionally public workflow. The application creates no authentication sessions. |

These exceptions do not justify exposing any additional privileged function, direct table writes, personal data or trusted-role authorization. Changing to a restricted deployment would require a separate identity/access design rather than hiding a dropdown.

Only aggregate counts and public operational details belong here. Do not enter resident names, household identity records, private phone numbers, passwords or medical details. The decision trail records the chosen workflow context, never an authenticated official identity.

## Planning and stock rules

- Scope: safe water for **drinking and food preparation**; bathing, laundry and other hygiene uses are excluded.
- Initial application-selected allowances are 3 L for drinking plus 3 L for food preparation, totalling 6 L/person/day. Both components are editable with a recorded reason. These are contextual planning assumptions, not a universal WHO-prescribed ration. Source and limitation details are in `docs/REFERENCE_DATA.md`.
- Demand uses **reported affected people**, the requested assistance period and reported locally available water. Census population is reference context, never an inferred shortage.
- Each barangay can have only one active report covering any given planning date. Adjacent non-overlapping periods are allowed. Corrections preserve the previous review explanation in the immutable audit trail.
- Verified demand, actual delivered liters and active commitments determine remaining uncommitted need. Every mutation locks the settings row. Application writes include the current expected revision; the database rejects a supplied revision that no longer matches before modifying records.
- Fair recommendations use exact integer quotient/remainder arithmetic, proportional to remaining need, with UUID tie-breaking. Manual changes require an explanation. Approval rechecks verification, stock, budget and remaining need inside the transaction.
- Physical stock includes reserved water. Approval reserves without consuming it. Confirmation consumes the actual delivered amount exactly once; unused partial/failed/cancelled reservations are released.
- Pending allocations can be split into at most 50 trips without changing their source totals. Assigned volume cannot exceed the chosen team's vehicle capacity. In-transit trips must be reconciled rather than cancelled.
- Barangay receipt quantities may differ from the team's reported actual, up to the assigned volume. Differences require notes and remain visible for coordinator follow-up. A receipt does **not** silently rewrite the team's actual delivery or physical stock. Each receipt is recorded once.
- A supply location can be archived only when empty and unreserved. Teams with assigned/in-transit trips cannot be deactivated or reduced below those trips' capacity.

All stock entries should describe water appropriate for the intended drinking/food-preparation use. The software records human reports and decisions; it does not test water quality or certify a source.

## Verification recorded 8 November 2026

- The live AGOS database passed **all 70 checks** in `verify-workflow.sql`, including anonymous read/write grants, role/context mistakes, overlapping request periods, correction history, stock bounds, baseline rounding, stale revisions, proportional overrides, multi-trip reservations, vehicle capacity, full/partial/failed delivery, duplicate confirmation, receipt discrepancies, cancellation and per-barangay allocation history.
- The verification transaction rolled back its synthetic operational records and temporary helpers.
- The local automated suite passed **46 tests** across planning, business rules, reference scope, exports and shared-state synchronization.
- Supabase performance advisors returned **no findings**. Security advisors returned only the two reviewed `agos_mutate` execution exceptions listed above.
