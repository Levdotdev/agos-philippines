# Calapan reference data for AGOS

Prepared 6 November 2026. These are community reference records, not current water-shortage reports.

## Ready to import

- `public/data/barangays.json`: array of all 62 barangays, joined by the official 10-digit PSGC code. Includes names, census population, household population, actual household counts, and map label coordinates.
- `public/data/calapan-census-2024.csv`: the census/PSGC facts without coordinates.
- `public/data/calapan-barangays.geojson`: all 62 open boundary polygons with census fields attached.
- `public/data/sources.json`: field provenance, years, source links, licenses, limitations, and the configurable emergency-water planning baseline.
- `public/data/validation-report.json`: completeness, totals, coordinate containment and source-file hashes.
- `docs/boundary-MIT-LICENSE.txt` (also provided under `public/data/`): retain when distributing the converted map file. Underlying boundary attribution must also be retained.

## Census facts

The official **2024 Census of Population (POPCEN)** reference time is **12:01 a.m., 1 July 2024**. Release dates are not the date of the observations.

| Measure | Sum across 62 barangays |
| --- | ---: |
| Total population | 148,558 persons |
| Household population | 148,031 persons |
| Number of households | 37,833 households |

Counts were transcribed from **Table 3, printed pages 3–4** of the Philippine Statistics Authority Oriental Mindoro release, then cross-checked against the PSGC population listing and the city totals. No household counts were estimated from average household size. Household population excludes people in institutional living quarters; it must not be confused with total population.

Primary sources:

1. [PSA PSGC: City of Calapan, official barangay names/codes and 2024 population](https://psa.gov.ph/classification/psgc/barangays/1705205000). The page lists **62 barangays**. It labels its directory list as of 31 July 2025, although its publication sidebar is newer. Urban/rural labels here are the directory's classification, not a new field assessment.
2. [PSA: Household Population, Number of Households, and Average Household Size: Calapan City, Oriental Mindoro, 2024](https://rssomimaropa.psa.gov.ph/content/household-population-number-households-and-average-household-size-calapan-city-oriental), released **21 September 2026**, reference **2026-SR-118**.
3. [PSA release PDF, Table 3](https://rssomimaropa.psa.gov.ph/system/files/attachment-dir/Household%20Population%2C%20Number%20of%20Households%2C%20and%20Average%20Household%20Size%20Calapan%20City%2C%20Oriental%20Mindoro%2C%202024.pdf). Some footer references alternate between 2025 and 2026; the landing page release date/reference above is authoritative for this pack. All numeric totals reconcile exactly.

The PSA website footer states **CC BY 4.0**, unless otherwise noted. Credit the Philippine Statistics Authority and retain reference date and source links when displaying these data. The web extraction truncates one PSGC name to `Sto. Ni`; `Sto. Niño` is taken from the full official household table. Preserve accents in UTF-8.

## Map geometry and point meaning

Map conversion source: [James Faeldon's Philippines Administrative Boundaries JSON Maps](https://github.com/faeldon/philippines-json-maps), release metadata **v1.1.0**, **PSGC 2026-3q**, built **25 October 2026**. The exact Calapan file is only about 44 KB and contains all 62 barangays, with 62 exact PSGC code matches.

[Immutable map file at source commit 2b823013d15b6d9cb89944ef53a78dccc36c24f7](https://raw.githubusercontent.com/faeldon/philippines-json-maps/2b823013d15b6d9cb89944ef53a78dccc36c24f7/latest/geojson/municities/medres/bgysubmuns-municity-1705205000.0.01.json).

Underlying boundaries are from **NAMRIA and PSA via [OCHA Philippines COD-AB](https://data.humdata.org/dataset/cod-ab-phl)**, using the **6 November 2023** boundary release with PSGC codes updated by the map maintainer. The 2026 PSGC metadata is not a claim that a new ground survey took place in 2026. Coordinates use WGS84 / EPSG:4326. The medium file retains about 1% of the original vertices.

Each latitude/longitude in the JSON is a calculated area-weighted **barangay-area centroid**, checked to lie inside its own simplified source polygon. These are **map label points**, not verified delivery points, water sources, household locations or barangay hall addresses. Collect an actual drop-off point for each report or delivery. These polygons are indicative context; do not use them for legal delimitation or precise navigation.

Required attribution: **Administrative boundaries: NAMRIA and PSA, via OCHA Philippines COD-AB; map conversion by James Faeldon (MIT).** The map conversion repository is MIT; the underlying geometry is **[CC BY 3.0 IGO](https://creativecommons.org/licenses/by/3.0/igo/)**. Source and license files are retained alongside this pack.

The official GeoRisk PSA June-2016 boundary service was also inspected but its Calapan geometry query timed out. It is **not** the geometry used here.

## Water planning baseline

AGOS's scope is **drinking and food preparation only**. It excludes **bathing, personal hygiene, laundry and sanitation water**.

Use a configurable application starting point of **3 litres for drinking + 3 litres for food preparation = 6 litres per affected person per day**. This is **an AGOS service-planning assumption**, not measured Calapan demand, a legal entitlement, a medical prescription, a universal WHO requirement, or evidence of a shortage. The separate components should remain editable.

Primary evidence:

- [WHO Technical Note 9, *How much water is needed in emergencies*, updated July 2013](https://www.who.int/docs/default-source/wash-documents/wash-in-emergencies/technical-notes-on-wash-in-emergencies/who-tn-09-how-much-water-is-needed.pdf), **Table 9.1, printed p.9.2 / PDF page 2**: the survival-intake category is **2.5–3 litres/person/day**, including drinking **and water contained in food**, and depends on climate and individual physiology. Basic cooking is a **separate 3–6 litres/person/day** category, depending on food type and social/cultural norms.
- [Sphere Handbook 2018](https://spherestandards.org/wp-content/uploads/Sphere-Handbook-2018-EN.pdf), **WASH Standard 2.1 table, printed p.107 / PDF page 132**, and **Appendix 3, printed p.145 / PDF page 170**, gives the same intake and cooking ranges.

The selected drinking allowance uses 3 litres as a planning choice informed by the upper end of the intake range. It does **not** claim WHO prescribes 3 litres of beverages for everyone, since the source intake figure already includes food moisture. The extra 3 litres is water **used for preparing food**, not a second allocation for food moisture. **Do not add food moisture again.** WHO and Sphere do not define a universal combined 6-litre standard. Planners should adjust the components for heat, activity, health needs and the food being prepared, with human review.

The broader **15 litres/person/day** emergency domestic-water benchmark includes hygiene and is **not the default for this app**.

Suggested calculation: **reported affected people × (selected drinking litres/person/day + selected food-preparation litres/person/day) × requested days**, adjusted for verified usable water already available. Do not infer the number of affected people, need, urgency, allocation priority or successful service from census population alone.

## Operational records

Start shortage reports, available supply, allocation decisions, delivery jobs and completion records **empty**. No verified live operational data for every barangay was found. Users must enter real reports and verified resource availability; do not present invented water stocks or shortages as real.

## Validation

All 62 codes are unique. Every census row joins to exactly one map feature. All three census totals match the official city totals. All exported coordinates lie inside their own source geometry. The build script uses only the stored reference facts and downloaded public map file; the validation report records hashes of the downloaded original map and transcribed census CSV. The immutable map download link above makes the original geometry retrievable for provenance checks.
