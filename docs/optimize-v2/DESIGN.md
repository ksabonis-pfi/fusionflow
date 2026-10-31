# Optimizations V2: design

V2 replaces the current Optimize module (impact assessments, tech stack, roadmap, utilization
snapshots) with the Customer Optimization Program built as two standalone apps (Zoom and
RingCentral). Those apps are being folded into CloudConnect; their original author has handed
them over and stopped development.

## Goals

- One Optimizations module for both platforms, on CloudConnect auth, customers and roles.
- Shared scoring engine; platform-specific data collection behind a provider adapter.
- V1 data stays in place, read-only, until V1 is retired. V1 features are not carried forward.
- Customers already running in the standalone apps move over with their run history.

## What the program does

PF staff connect read-only to a customer's UC/CC tenant with credentials the customer creates
for us, pull usage, configuration and quality data, and score it into an 11-layer scorecard.
Findings and an "increase your score" plan come out of the scorecard, then customer-facing
reports (Executive, Outcomes, Growth plan, product deep dives) and an `.xlsx` workbook. Three
questionnaires cover pre-SOW scoping, post-SOW readiness/baseline, and the recurring
optimization review. Runs repeat on a schedule so score and value can be tracked over time.

Nothing in the program uses an LLM; all scoring is deterministic rules.

## Data model

V2 hangs off the existing `optimize_accounts` row (one per customer, `customer_id` UNIQUE),
so a customer is enrolled once and can have a connection per platform.

| Table | Purpose |
|---|---|
| `opt2_connections` | One per account per platform (`zoom` / `ringcentral`). Encrypted credentials, non-secret credential hints, window, timezone, cost assumptions, manual KPI inputs, schedule. |
| `opt2_runs` | One assessment. Headline numbers denormalized for lists; full result in R2. |
| `opt2_run_kpis` | One row per KPI per run, for trends. |
| `opt2_questionnaire_responses` | One per account, platform and instrument. |

Full run results (scorecard, findings, product reports, raw data) go to R2 at
`optimize-v2/{accountId}/{runId}/result.json`, not into D1 rows.

### Credentials

- Encrypted with AES-GCM under a new worker secret, `OPTIMIZE_ENC_KEY`. Keys from the
  standalone apps are never reused.
- Stored as one encrypted JSON blob per connection, so each provider keeps its own shape
  (Zoom: account id, client id, secret; RingCentral: client id, secret, JWT, environment).
- Credentials are re-entered fresh when customers migrate; old encrypted values are not copied.

## Server layout

```
src/server/services/optimizeV2/
  engine/          scoring, grading, indices, findings ranking: provider-neutral
  providers/
    zoom/          API client, collectors, KPI and layer definitions, recommendation text
    ringcentral/   same, for RingCentral and RingCX
  store.ts         D1 + R2 persistence, credential encryption
src/server/routes/optimizeV2.ts    mounted at /api/optimize-v2
```

- The two platforms use different layer taxonomies (same ids 0–10, different meanings), so each
  provider supplies its own layer and KPI definitions. The engine works over whatever the
  provider defines; there is no forced shared taxonomy.
- KPI config is normalized on load to one shape: `{key, label, layer, product, unit, dir, target, source}`.
- Each provider's API client keeps a per-run request budget. Calls are read-only; the
  RingCentral client refuses any write other than its two analytics query POSTs.
- Access uses the existing Optimize roles: read for internal roles, edit for admin, SA, CSM and PM.

## Client

- V2 lives at `/optimize-v2` and is staging-only until cutover. V1 stays at `/optimize`.
- The standalone apps' vanilla-JS screens are rewritten as React pages. Report and export
  content modules and the `.docx`/`.pptx`/`.pdf`/`.xlsx` builders are lifted as plain TS.

## Phases

Each phase ships to staging as its own PR.

1. **Zoom engine and runs**: connect a Zoom tenant, run an assessment, view the scorecard and findings.
2. **RingCentral adapter**: same flow for RingCentral and RingCX.
3. **Questionnaires**: the three instruments with autosave and scope filtering.
4. **Reports and exports**: Executive, Outcomes, Growth plan, product reports, workbook.
5. **Schedules and trends**: monthly re-runs from the existing daily cron, score history.
6. **Migration and cutover**: import run history for customers already in the standalone apps,
   re-enter their credentials, make V2 the Optimizations module, retire V1 and the standalone apps.

## Provider notes

**Zoom** (phase 1). Collectors are kept as JavaScript, identical to the standalone app apart
from one import. Scoring, findings and the KPI registry are TypeScript on the shared
`engine/` helpers. Two bugs inherited from the original were fixed deliberately (review of
#758): negated config states ("Not configured") counted as aligned, and a 0 on a 0-target
KPI showed "On Target" while scoring 0%.

After the first real-tenant runs (a Zoom Phone-only customer, #760):
- **Feature adoption** counts a workload only when it returned real activity (users, phone
  users, rooms, contact-center agents, virtual-agent sessions, webinars, ZRA deals or
  conversations). The original counted any area whose API calls didn't error, so a
  phone-only tenant was credited with Contact Center, Virtual Agent and ZRA. The
  denominator is still all 7 workloads: breadth of Zoom in use, i.e. room to grow.
- **Account-settings failures** are reported. The collector swallowed them, so a missing
  granular scope left the config audit empty while the coverage tab showed settings as
  reached. It now shows Zoom's error, which names the scope needed.

**RingCentral** (phase 2). The engine (client, collectors, KPI derivation, scoring, findings)
and its JSON config are kept as JavaScript, identical to the standalone app apart from
config import paths. `providers/ringcentral/assess.ts` replaces the original's
`assessCustomer()` without its database and decryption, and `normalize.ts` maps the
engine's native result onto the shared scorecard shape. The native result is stored too,
for the RingCentral reports.

Three bugs inherited from the original were fixed deliberately (review of #759): RingCX
requests bypassed the request budget (on a large contact-center tenant the original reported
17 calls while making 124 against a budget of 80); the config audit judged failed inventory
reads as real configuration (unreadable extensions scored "aligned"); and license
utilization mixed populations (80 enabled + 20 not-activated users read 67%, not 80%).

**Run budget.** Both standalone apps capped API calls per run (Zoom 48, RingCentral 80) to
fit Cloudflare's free-plan subrequest limit. CloudConnect is on the paid plan, so both run
with 200. Raising the cap exposed loops bounded only by budget, now bounded explicitly:
Zoom samples at most 25 rooms for utilization; RingCentral runs the per-phone E911 check
only for estates of up to 75 hard phones and per-queue membership only up to 100 queues
(both figures are published only when complete, so a partial sweep bought nothing).
RingCX runs last and uses whatever budget remains, reporting truncation.

The two engines are **not** identical despite the RingCentral one's comment: for a
lower-is-better KPI with a 0 target, Zoom awards full attainment and RingCentral awards
none; RingCentral also has neutral (unscored) KPIs and "blocked" KPIs that are excluded
from layer scores. Each engine keeps its own rules; reconcile deliberately if needed.

## Open items

- Which V1 customers (if any) get a migration effort into V2: under discussion.
- After cutover, customers whose credentials sat in the standalone RingCentral app should
  revoke and reissue them.
