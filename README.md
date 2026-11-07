# AGOS Philippines

AGOS coordinates safe water for **drinking and food preparation** across Calapan City’s 62 barangays. Bathing, laundry, irrigation and general household water use are outside the allocation plan.

The application uses Vue 3, TypeScript, Vite, Pinia, Leaflet/OpenStreetMap, Chart.js and a Supabase Postgres database. Operations are saved to the shared database, not browser storage. Browser storage holds only the selected workspace role, barangay and delivery team.

## Run

Requires Node.js 22.12 or newer.

~~~sh
npm ci
npm run dev
npm test
npm run build
~~~

The development server prints its local address. Production output is in `dist/`. The PWA stores the application and reference map data for reading offline; recording an operation requires a database connection. OpenStreetMap street tiles require connectivity.

The public AGOS project URL and browser-safe publishable key are configured in `src/config/supabase.ts`. Optional overrides are documented in `.env.example`. Never place a database password, secret key or service-role key in frontend code or VITE environment variables.

## Database setup

The AGOS project is separate from School Attendance and Mathverse:

- Project: `fdwyjxgsvyfxqhwuaeuw`
- Organization: AGOS Philippines
- Region: Singapore

Apply `supabase/schema.sql`, then `supabase/reference-data.sql` using a project administrator. The reference import checks all 62 unique PSGC records and official population/household totals. It creates no shortage reports, resources, teams, reservations or deliveries.

The schema exposes `agos_snapshot()` for the current workspace and `agos_mutate()` for bounded, validated operations. Anonymous clients cannot directly insert, update or delete tables. All tables have row-level security. A locked singleton settings row serializes mutations; expected revisions reject stale actions before stock changes are made. The application refreshes after an operation and periodically while visible.

## Workspace roles

Open the avatar in the upper-right corner to choose:

- **LGU Coordinator:** citywide requests, reviews, resources, teams, allocation, dispatch, receipts and analytics.
- **Barangay Representative:** choose a barangay in the profile; submit and correct its requests, view incoming assistance, and confirm quantities received.
- **Delivery Personnel:** choose an operating team in the profile; start assigned trips and record full, partial or failed outcomes.

There is **no sign-in**, as requested. Role selection is declared workflow context, not a security boundary or verified identity. Anyone who can reach this public shared workspace can select its roles and record the permitted operations. Store aggregate operational information only; do not enter residents’ names, contact details, private addresses or other personal records. The operation history records the selected context, not a verified individual identity.

## Operating flow

1. A barangay representative reports actual affected people and households, available potable water, the assistance start date, requested planning days, observed shortage duration and situation.
2. An LGU coordinator reviews the request and records a verification, correction request or rejection with an explanation.
3. The coordinator records actual potable stock and operating teams with vehicle capacities.
4. The allocation engine proposes proportional whole-liter shares of verified unmet need, subject to stock and a dispatch budget. Modifying a recommended share requires an explanation.
5. Approval creates reservations and pending trips in the same database transaction. Large allocations can be split into vehicle-sized pending trips while preserving the total reservation.
6. The coordinator assigns a team, vehicle and schedule. The selected delivery team starts the trip and records its actual outcome.
7. Completion consumes only the recorded actual liters, once. Partial/failed outcomes release unused reservations; cancellations release reservations without consuming stock.
8. The barangay records the actual quantity received independently. A difference from the team’s delivery record is retained for coordinator follow-up; it does not silently rewrite stock.
9. Review scoped requests, deliveries, CSV exports and the operation history. Resolve a request once active commitments have been finalized or cancelled.

## Planning basis

The initial editable allowances are:

- Drinking: **3 L/person/day**
- Food preparation: **3 L/person/day**
- Total: **6 L/person/day**

This is an **AGOS planning assumption**, not a universal WHO requirement or a medical prescription. WHO Technical Note 9 distinguishes survival intake (drinking plus water in food), 2.5–3 L/day, from water used for basic cooking, 3–6 L/day. The selected components must be adapted to actual conditions. Food moisture is not an additional component. Bathing and other non-food household uses are excluded.

For each reported assistance period:

~~~text
net requested liters =
  max(0, affected people × (drinking + food preparation) × planning days
         − available local potable liters/day × planning days)

unmet need = max(0, net requested liters − actual assistance delivered)

eligible allocation need = max(0, unmet need − active commitments)
~~~

Only reported affected people enter demand calculations. Census population is not automatically treated as affected. Overlapping active planning periods for the same barangay are rejected to avoid duplicate requests. Scarce water is shared proportionally, with deterministic largest-remainder whole-liter rounding. Elevated urgency is visible for human review and does not secretly change the formula.

## Real reference data

All 62 barangays have official PSGC identifiers and 2024 census counts, with a reference date of **July 1, 2024**:

- Total population: **148,558**
- Household population: **148,031**
- Households: **37,833**

Sources, dates, licenses, boundary provenance and calculation limits are documented in [REFERENCE_DATA.md](docs/REFERENCE_DATA.md). Machine-readable reference data and source metadata are under `public/data/`. Boundary centroids are indicative barangay label points, not surveyed delivery locations or household addresses.

Public sources did not establish current shortages, emergency water stock or live delivery assignments. Those operational records begin empty and must be entered from actual observations.

## Verification

`npm test` covers business rules and allocation/reconciliation invariants. `npm run build` includes strict TypeScript checks. Supabase integration tests run in a transaction that is rolled back, leaving no synthetic operational records in the live database.

A role dropdown cannot provide access control. Before use that requires restricted staff operations or personal information, the access model must be changed. This version deliberately implements the requested open shared workflow.
