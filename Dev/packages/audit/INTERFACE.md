# @domia/audit — Interface Spec

**Purpose.** Website auditing as a *feature*, not a second engine. An audit is a normal
run with the `auditor` persona: the agent plans its own coverage, calls the audit belt
tools, and finishes with a report. This package owns the vocabulary (dimensions,
findings, evidence, scores), the scoring maths, and the report renderer — nothing else.

**Kind.** K1 service (`EP.AuditService`) + belt tools (`EP.MetaTool`).

Design in [AUDIT-DESIGN.md](../../AUDIT-DESIGN.md); the market case in
[AUDIT.md](../../AUDIT.md).

---

## Public interfaces (contracts `audit.ts`)

```ts
export type Dimension =
  | 'performance' | 'accessibility' | 'theme' | 'language' | 'states' | 'seo'
  | 'agentic' | 'files' | 'privacy' | 'security' | 'journey' | 'network';   // D1–D12

export type Confidence = 'verified' | 'probable' | 'needs-human';  // never merged

export interface AuditService {                       // EP.AuditService (one)
  dimensions(): readonly DimensionInfo[];
  record(runId: RunId, draft: FindingDraft): Promise<ModuleResult<Finding>>;  // evidence required
  cover(runId: RunId, dimension: Dimension, coverage: DimensionCoverage): ModuleResult<void>;
  findings(runId: RunId): readonly Finding[];
  score(runId: RunId): AuditScore;                    // per dimension; overall is a roll-up
  report(runId: RunId, target: string): Promise<ModuleResult<AuditReport>>;
}
```

## Belt tools (EP.MetaTool)

| Tool | Purpose |
|---|---|
| `audit.dimensions` | the catalogue, so the agent plans coverage instead of guessing |
| `audit.sweep` | the deterministic T0 pass over an origin — files, headers, served HTML |
| `audit.finding` | record one defect: evidence + severity + confidence + a fix |
| `audit.coverage` | declare executed/applicable per dimension |
| `audit.score` | current per-dimension scores, coverage and confidence split |
| `audit.report` | render markdown, save it as an artifact, return the score |

## Internal classes

| Class / module | File | Responsibility |
|---|---|---|
| `auditModule` | `module.ts` | registers the service + the belt; requires `trace` only |
| `AuditServiceImpl` | `service.ts` | per-run findings, evidence persistence, dedup by stable id, sweep orchestration + logging |
| `sweep` | `sweep.ts` | discovers pages, clusters, samples, runs every check family, merges coverage |
| `discoverPages` | `discover.ts` | sitemap (with index following) or home links; honours robots Disallow; hard page cap |
| `templateSignature` / `clusterBy` | `cluster.ts` | `/blog/:n/:slug` path shape + structural tag hash → one signature per template |
| `rollupByTemplate` | `rollup.ts` | one finding per (check, template) with a reach, not one per URL |
| `probe` | `probe.ts` | one HTTP observation that never throws: a dead endpoint is data |
| check families | `checks/{files,security,page}.ts` | pure functions over a `SweepContext` → findings + coverage |
| tag readers | `checks/html.ts` | small regex readers for head-level facts (documented as such) |
| `AuditMetaHandler` | `handler.ts` | zod schemas, dispatch, agent-facing descriptions |
| draft mappers | `draft.ts` | zod output → strict contracts under `exactOptionalPropertyTypes` |
| `DIMENSIONS` | `dimensions.ts` | D1–D12: title, summary, penalty scale `k`, default weight |
| scoring | `score.ts` | `findingWeight`, `scoreDimension`, `scoreAudit`, `grade` — pure |
| `renderReport` | `report.ts` | markdown: score table, findings by dimension, "not assessed" |

## Design notes

- **No finding without evidence.** `record` refuses a draft with neither
  `evidenceArtifacts` nor `observed`; `observed` is persisted as a text artifact so every
  finding ends up pointing at something durable in the run's artifacts.
- **Confidence never blends.** `verified` (machine/direct observation), `probable`
  (model judgement), `needs-human` (expert must confirm) carry different weights and are
  reported as three separate penalty totals.
- **Unassessed is not a pass.** A dimension with `executed: 0` has *no* score. The CLI and
  the report print "not assessed"; the roll-up ignores it.
- **A verified blocker caps its dimension at 49.** No amount of green elsewhere makes a
  law-breaking or task-breaking defect pass.
- **Scores are deterministic:** `100 · exp(−Σweight / k)`, weight =
  severity × confidence × reach. `k` per dimension is a calibration constant — the golden
  corpus that calibrates it is A6 work, and until then the numbers are comparable to each
  other, not to an industry benchmark.
- **T0 is free and verified.** `sweep` fetches the expected files, the document and its
  headers, then decides in pure functions. Every finding it emits is `verified` with the
  bytes that prove it, and it costs no model tokens — which is why the persona is told to
  run it before spending judgement.
- **Precision over recall in T0.** Two false positives found by auditing a real site are
  now regression-tested: a product name containing a digit (`AmazonS3`) is not a version
  banner, and a document below one packet has nothing to gain from compression.
- **Scale is templates, not URLs.** A 100k-page site has a handful of templates; the
  sweep discovers pages, groups them by structural signature, audits `perTemplate` of
  each (default 2, `maxPages` 12), and rolls findings back up so a shared-header defect is
  one row that says "12 of 12 sampled pages". Fetches are pooled (default 4 at a time)
  and robots `Disallow` for `*` is honoured.
- **Storage is per-run and in memory** in this slice, plus a JSON snapshot artifact
  (`AUDIT_SNAPSHOT_LABEL`) written next to the report so `AuditService.load` can rehydrate
  a past audit after a restart — real tables still wait on migrations. Persisting findings (and diffing
  audits against a baseline) is A6, and it lands *after* the store gets schema
  migrations — the audit tables are exactly the data nobody can afford to lose.

## File manifest

```
audit/
  package.json  INTERFACE.md
  src/
    module.ts  service.ts  handler.ts  draft.ts  probe.ts  sweep.ts
    discover.ts  cluster.ts  rollup.ts
    dimensions.ts  score.ts  report.ts  index.ts
    checks/  files.ts  security.ts  page.ts  html.ts  types.ts
```
