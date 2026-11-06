# AGOS Philippines

Smart Water Crisis Response and Resource Allocation System. Vue 3 + TypeScript + Vite + Pinia + Vue Router + Tailwind CSS + Lucide + Leaflet/OpenStreetMap + Chart.js + PWA.

## Run locally

Requires Node.js 22.12+ and npm.

```sh
npm install
npm run dev
```

Open http://localhost:5173/. The server prints another port if 5173 is occupied.

```sh
npm test
npm run build
npm run preview
```

Production preview normally runs at http://localhost:4173/. PWA caching is enabled in the production build, not development. Load production once online before trying offline. OpenStreetMap tiles require connectivity; community details and coordinates remain available without tiles.

## Competition walkthrough

1. Click Reset demo. In the top-right Demo Mode switcher choose Barangay Representative. Choose Bucayao. Open Shortage reports, click New report, enter the simulated situation, and submit.
2. Switch to LGU Coordinator. Open Shortage reports, filter Pending, and Review the new report. Read the location, population, local supply and urgency. Click Verify report.
3. Open Crisis map. The new verified report is included. Click a marker for shortage details; the list below also gives coordinates and delivery status.
4. Open Allocation engine. Explain the one-day planning assumption (15 L/person/day). Change the dispatch budget and observe proportional shares. The budget cannot create supply beyond uncommitted inventory. To change actual available supply, update physical stock in Water resources. Baseline changes require Apply baseline.
5. Approve & reserve water. Manual quantity changes require a recorded reason. Water resources now shows the reservation. Allocation records create pending delivery tasks.
6. Open Delivery operations. Open the new community task, choose Demo delivery team, set vehicle/schedule, and Assign delivery.
7. Switch to Delivery Personnel. Open the assigned task, Start trip, reopen it and confirm actual liters. Completed requires the full assigned quantity. For fewer liters choose Partially Delivered and explain why; Failed requires zero liters and a note.
8. Switch to LGU Coordinator. Overview, Water resources, and Reports & analytics reflect actual delivery, remaining reservations and unmet needs. Export CSV and inspect the decision audit trail.
9. Refresh to demonstrate persistence. Reset demo to repeat.

## Business rules

Unmet need = max(0, population × baseline − local daily water − confirmed assistance). All reports and assistance belong to one simulated planning day. Repeated new reports are independent scenarios; do not submit duplicate reports for the same incident. This prototype does not model multi-day replenishment.

Only verified reports enter recommendations. Active commitments are subtracted before further allocation. Budget is an explicit dispatch-capacity constraint; vehicle routing and automatic tanker capacity scheduling are future work. Urgency is entered and verified, visibly explained, and available for a human override; it does not silently weight population shares.

Scarce supply is distributed proportionally. Whole-liter floors are followed by largest fractional remainders, with report ID as deterministic tie-breaker. Recommendations never exceed need or available supply. Approval checks current inventory and commitments again. Delivery confirmation consumes actual stock and releases unused reservations. Finalized trips cannot be confirmed twice. Important operations work on a cloned state and commit only after validation.

Physical inventory includes reserved stock. Uncommitted = physical stock − active reservations. The seeded completed trip's 3,000 L has already been deducted before the opening stock figures. Confirmation subtracts actual delivered liters once. Partial/failed balances return to the dispatch pool.

## Architecture

- `src/types`: operational models
- `src/data`: independent seed factory
- `src/services/operations.ts`: pure allocation, reservation and reconciliation functions
- `src/services/repository.ts`: storage adapter contract and local implementation
- `src/stores`: Pinia state, validated transactions, role and audit management
- `src/components`: reactive Chart.js charts and Leaflet map
- `src/views`: connected operational screens

The repository interface can be replaced by a Firestore-backed implementation. A production implementation must move authorization and inventory transactions to a trusted backend; changing the client adapter alone is not sufficient.

## Verification and limitations

Ten automated tests cover demand, negative inputs, zero supply, scarcity, deterministic rounding, inventory bounds, verification, duplicate commitment, completed/partial/failed reconciliation, reset, and an end-to-end business sequence. Production build includes TypeScript checking.

Browser automation was unavailable in the execution environment; a manual visual and click-through review is still needed. This is a local competition demo, not production authentication. The demo role switcher is intentionally not security. There is no Firebase configuration, external messaging, actual emergency alert, or paid service.

All operational data is fictional. Barangay names give geographic context; seeded coordinates are illustrative points near Calapan and are not surveyed barangay boundaries. No actual citizen information is needed. The supplied attachment contained only the project brief; the original AGOS logo and PowerPoint were unavailable. The current water-drop mark is a temporary brand asset. There is no production login; Demo Mode provides direct access.
