# Audit — engineering design

The strategy and market case are in [AUDIT.md](./AUDIT.md). This is the build: what we
evaluate, how each check is detected, which engine does it, what we must write
ourselves, how findings become a score and a fix, and how it all runs industrially
inside Domia.

Design rules inherited from the repo: the agent owns task structure (no hardcoded audit
pipeline), behaviour lives in personas and skills, `Result` at boundaries, evidence for
every claim, no mocks in tests.

---

## 1. The product model

Nine nouns. Everything else is derived.

| Noun | What it is | Where it lives |
|---|---|---|
| `AuditProfile` | Which dimensions, which journeys, which matrix (locales × themes × viewports × network), budget ceiling | case asset + settings |
| `AuditRun` | One execution of a profile against a target — a normal Domia run with the auditor persona | `runs` + `audits` |
| `Check` | The smallest verifiable question ("does `/llms.txt` exist and parse?") | code (deterministic) or skill (agentic) |
| `Finding` | A failed or degraded check, with evidence | `findings` |
| `Evidence` | Screenshot, video segment, HAR slice, DOM snapshot, trace span, transcript | artifacts (already content-addressed) |
| `Remediation` | What to change, where, suggested patch, effort, impact | on the finding |
| `Score` | Per dimension + overall, with coverage and confidence split | `scores` |
| `Baseline` | The accepted state of a target at a point in time | `audits` (flagged) |
| `Report` | Rendered deliverable: markdown / HTML / JSON / ACR-VPAT skeleton | artifact |

**An audit is a run.** Not a new engine: the auditor persona drives the same loop, calls
audit belt tools, spawns a sub-run per dimension or journey, and finishes with a report.
That is the whole integration story — everything else is tools, storage and rendering.

---

## 2. Detection tiers — the cost discipline

Every check is assigned a tier. Tiers run in order; a tier only runs where the previous
one left a question open. This is what keeps an industrial audit affordable.

| Tier | What it is | Cost | Confidence | Examples |
|---|---|---|---|---|
| **T0 — fetch** | HTTP + parse, no browser | ~free | `verified` | `/llms.txt`, robots, sitemap, headers, TLS, hreflang graph |
| **T1 — engine** | A rules engine on a rendered page | cents | `verified` | axe-core, Lighthouse, nuclei, lychee |
| **T2 — differential** | The same page under a changed condition, compared mechanically | cents | `verified` | theme matrix, locale matrix, network-fault states, visual diff |
| **T3 — agentic** | The model drives, reads, and judges | tokens | `probable` / `needs-human` | journey completion, "is this error message understandable", dark patterns, claim consistency |

T3 is where our moat is, so it must never be spent on what T0 answers. The auditor
persona is instructed accordingly, and the budget ceiling is enforced per dimension.

---

## 3. The dimension catalogue

Twelve dimensions. For each: what we check, what we reuse, what we build, and the tier.

### D1 — Performance & Web Vitals
Not just the landing page: vitals **per journey step**, which nothing off-the-shelf does
because nothing else can log in and check out.

| Check | Tier | Reuse | Build |
|---|---|---|---|
| LCP / INP / CLS / TTFB, lab | T1 | Lighthouse, sitespeed.io | journey-step harness (measure after each agent action) |
| Field data where available | T0 | CrUX API | — |
| Site-wide sampling | T1 | Unlighthouse | template-cluster sampler (§7) |
| Weight budgets, third-party cost, render-blocking | T1 | Lighthouse | third-party attribution → vendor names |
| Regression vs baseline | T2 | — | metric differ + significance guard |
| Carbon per view | T1 | CO2.js | — |

### D2 — Accessibility & assistive semantics
The rules engine is commodity; the value is everything above the 29.5% automatable line.

| Check | Tier | Reuse | Build |
|---|---|---|---|
| WCAG rule violations per page/state | T1 | axe-core (in-page), IBM Equal Access as second opinion | disagreement flagger between engines |
| Contrast in **both themes** and forced-colors | T2 | axe (re-run per theme) | theme driver (§D3) |
| Keyboard-only journey completion | T3 | — | keyboard journey skill + focus-order recorder |
| Focus visibility, focus traps, skip links | T2/T3 | — | focus tracer (tab through, screenshot each stop) |
| Screen-reader narrative quality (does the a11y tree tell a coherent story?) | T3 | — | tree-to-narrative prompt + judgement |
| Visual order vs DOM order | T2 | — | geometry-vs-tree comparator |
| Live regions, dynamic state announcements | T3 | — | mutation watcher + judgement |
| Media alternatives (captions, transcripts) | T0/T3 | — | presence probe + adequacy judgement |
| ACR/VPAT mapping | — | — | EN 301 549 ↔ WCAG matrix renderer |

### D3 — Theme & visual integrity
The user asked for "theme": this is where light/dark, brand and layout correctness live.

| Check | Tier | Reuse | Build |
|---|---|---|---|
| Light/dark parity — every page rendered in both | T2 | — | **theme driver** (`prefers-color-scheme` emulation + in-app toggle discovery) |
| Contrast regressions introduced by dark mode | T2 | axe | per-theme diff of violations |
| Responsive matrix (mobile/tablet/desktop, zoom 200%, 320px reflow) | T2 | Playwright device emulation | matrix runner + reflow assertions |
| `prefers-reduced-motion`, `forced-colors` respected | T2 | — | media-emulation probes |
| Visual regression vs baseline | T2 | pixelmatch / odiff / BackstopJS | baseline store + noise filter (anti-alias, fonts, carousels) |
| Design-token consistency (stray colours, font sizes, spacing off-scale) | T2 | — | computed-style census → outlier report |
| Overflow / truncation / overlap (esp. long locales) | T2 | — | geometry auditor (bounding-box collision + clipped text) |

Grounding fact: low-contrast text is on **83.9%** of the top million home pages (WebAIM
2026, up from 79.1%) — the dumbest checks still find the most.

### D4 — Language, i18n & content quality

| Check | Tier | Reuse | Build |
|---|---|---|---|
| `lang` attributes, per-element language changes | T1 | axe | — |
| hreflang graph: reciprocity, self-reference, x-default, canonical conflicts | T0 | hreflang validators | graph consistency checker |
| Translation completeness (untranslated strings left in source language) | T2 | — | **locale differ**: text-node census per locale + source-string equality detection |
| Mojibake, encoding, wrong quotes/dates/numbers/currency for locale | T2 | — | locale formatter probes |
| RTL correctness (mirroring, icons, text direction) | T2 | — | RTL matrix + geometry auditor |
| Reading level, jargon, sentence length | T3 | textstat-style metrics | readability + judgement |
| Cross-page contradictions (price on `/pricing` ≠ `/plans`, stale dates, dead promises) | T3 | — | **claim-consistency pass** (extract claims → compare) |
| Broken links, orphan pages | T1 | lychee | — |

### D5 — State transitions & resilience
The dimension nobody automates, because it needs an actor and fault injection.

| Check | Tier | Reuse | Build |
|---|---|---|---|
| Loading / empty / error / partial states reachable and legible | T2/T3 | — | **fault injector** (route interception: 500s, timeouts, empty payloads) + state prober |
| Slow network & offline behaviour | T2 | CDP `Network.emulateNetworkConditions` | network-profile matrix |
| Form validation: required, format, server-side error surfacing, error focus | T3 | — | form fuzzer (valid / invalid / boundary / injection-safe strings) |
| Double submit, back button, refresh mid-flow, deep link into step N | T3 | — | flow-invariant skill |
| Session expiry and re-auth mid-journey | T3 | captured logins (F7) | expiry simulator (clear cookies mid-run) |
| Idempotency (did refresh charge twice?) | T3 | — | side-effect watcher on network |
| Race/latency artifacts (double-click, rapid nav) | T2 | — | stress prober |
| Permission-denied and 404/500 pages usable | T2 | — | error-page prober |

### D6 — Classic SEO

| Check | Tier | Reuse | Build |
|---|---|---|---|
| robots.txt, sitemap validity/coverage, status codes, redirect chains | T0 | — | crawl-graph builder |
| Canonicals, duplicates, parameter handling, pagination | T0/T1 | — | canonical graph checker |
| Titles/meta/OG/Twitter, heading structure | T1 | Lighthouse SEO | template-level dedup (one finding per template, not per URL) |
| Structured data validity + coverage by page type | T1 | schema validators | type-coverage matrix |
| Internal linking / depth / orphans | T0 | — | link-graph metrics |
| Rendered-vs-source parity (does SSR match CSR?) | T2 | — | dual-fetch differ |
| Core Web Vitals as ranking input | — | see D1 | — |

### D7 — Agentic SEO & AI visibility
This is the dimension no incumbent can do properly, because the honest test is *send an
agent*.

| Check | Tier | Reuse | Build |
|---|---|---|---|
| `/llms.txt` (+ `llms-full.txt`) exists, parses, links resolve, content matches site | T0 | — | llms.txt linter |
| `ai.txt`, `robots.txt` Content-Signal declarations | T0 | — | policy parser |
| `.well-known/` set (security.txt, agent-card, API catalog RFC 9727, OAuth PRM RFC 9728, MCP server card) | T0 | — | well-known sweeper |
| WebMCP tools declared, callable, honest (do they do what they say?) | T0/T3 | Lighthouse 13.3 agentic audit | **WebMCP prober** (discover → call → verify) |
| A11y-tree quality *as an agent affordance* (are actions reachable by role+name?) | T2 | — | affordance scorer |
| **Empirical agent task completion** — top N revenue tasks attempted by a real model | T3 | **Domia itself** | task harness + failure taxonomy |
| Answer-extractability (can a model answer the top 20 buyer questions from the page alone?) | T3 | — | QA-extraction probe |
| AI visibility / citation share across engines | T3 | model APIs with search grounding | sampler with Wilson confidence intervals |

Adoption context that makes this sellable: 78% of sites have robots.txt but **only 4%
declare AI preferences**, and fewer than 15 sites worldwide ship MCP server cards.

### D8 — Machine-readable surface (the "files that should exist")
Kept separate from D7 because it is the cheapest, most concrete deliverable — a
one-page table a client can act on the same afternoon.

`robots.txt` · `sitemap.xml` (+ index, lastmod sanity) · `llms.txt` / `llms-full.txt` ·
`ai.txt` · `.well-known/security.txt` · `.well-known/agent-card.json` ·
`.well-known/api-catalog` · `.well-known/oauth-protected-resource` ·
`.well-known/mcp.json` · `manifest.webmanifest` · `favicon`/icon set · RSS/Atom ·
`humans.txt` · `ads.txt`/`app-ads.txt` (if ads) · `.well-known/change-password` ·
`.well-known/apple-app-site-association` / `assetlinks.json` (if apps) · `openapi.json`
(if API) · privacy, terms, accessibility statement, contact pages.

All T0. We build one sweeper plus per-file linters; every miss carries a generated
starter file as its remediation.

### D9 — Privacy, consent & trackers
See AUDIT.md §4.2 for why it sells. Mechanically: drive the banner three ways
(*accept* / *reject* / *ignore*) × locales, and diff cookies, storage, and network.

| Check | Tier | Reuse | Build |
|---|---|---|---|
| Trackers firing before consent | T2 | tracker lists (EasyPrivacy, DDG Tracker Radar), Blacklight method | consent triad runner + request classifier |
| Reject-all actually blocks | T2 | — | same runner, reject arm |
| Reject harder than accept (clicks, depth, contrast) | T2/T3 | — | banner geometry + interaction cost |
| Cookie inventory vs declared policy | T0/T3 | — | policy-vs-reality differ |
| Fingerprinting surface (canvas/font/WebGL probes) | T2 | Blacklight method | API-call instrumentation |
| Data leakage in URLs/referrers, session replay tools | T2 | — | request inspector |

### D10 — Security & hygiene
Split in two: **passive** (always on, needs no permission — we only look at what the
site sends us) and **active** (only with written authorisation recorded in the profile).

Passive:

| Check | Tier | Reuse | Build |
|---|---|---|---|
| Security headers: CSP, HSTS (+preload), X-Frame-Options/frame-ancestors, Referrer-Policy, Permissions-Policy, COOP/COEP/CORP | T0 | — | header grader with per-header rationale |
| CSP *strength*, not just presence: `unsafe-inline`, `unsafe-eval`, wildcards, missing `object-src`, nonce/hash usage | T0 | — | CSP analyser |
| Cookie flags: Secure, HttpOnly, SameSite, scope, lifetime | T0/T2 | — | cookie grader (shares the D9 collector) |
| TLS: version, ciphers, chain, expiry, OCSP stapling, mixed content | T0 | testssl.sh (separate process, GPL) | verdict normaliser |
| Third-party script inventory + SRI coverage (supply chain) | T1 | — | script census + integrity checker |
| Known-vulnerable client libraries, framework versions | T1 | retire.js, nuclei templates | version fingerprinter |
| Exposed source maps, secrets/keys in bundles, verbose stack traces | T1 | — | bundle + error-page scanner |
| Exposed paths: `.git/`, `.env`, `/debug`, admin panels, directory listing | T0 | nuclei | path prober (rate-limited, GET-only) |
| Email auth for the domain: SPF, DKIM, DMARC policy strength | T0 | — | DNS record grader |
| Subdomain takeover risk (dangling CNAMEs) | T0 | — | CNAME/host resolver |
| CORS policy: wildcard with credentials, reflected origins | T0 | — | preflight prober |

Active (authorisation gate — refuse to run without a recorded scope):

| Check | Tier | Reuse | Build |
|---|---|---|---|
| Baseline vulnerability sweep | T1 | OWASP ZAP baseline, nuclei | scope guard + rate governor |
| Auth surface: login rate limiting, password policy, 2FA availability, session fixation, logout invalidation, session expiry | T3 | — | auth-behaviour skill (uses captured logins) |
| Open redirects, IDOR-ish object references on the journeys we already drive | T3 | — | journey-adjacent probes |
| File-upload handling (type/size enforcement) | T3 | — | upload prober |

The agent never invents an exploit. Active checks are a fixed catalogue with a written
scope; anything beyond it is reported as "recommend a penetration test", not attempted.

### D11 — Journey completion, friction & dark patterns

| Check | Tier | Reuse | Build |
|---|---|---|---|
| Can the journey be completed at all (per persona: keyboard, mobile, slow net, agent) | T3 | — | journey harness |
| Steps / fields / time to complete vs benchmark | T3 | — | interaction cost meter |
| Error recovery quality (can a user get unstuck?) | T3 | — | recovery prober |
| Cancellation vs subscription asymmetry | T3 | — | asymmetry meter |
| Confirmshaming, pre-checked boxes, fake urgency/scarcity | T3 | — | pattern taxonomy + judgement |
| Trust signals (contact, refunds, ownership) | T0/T3 | — | trust sweep |

### D12 — Networking & delivery
Separate from D1: performance is *what the user experiences*, networking is *how the
bytes get there*. Different fixes, different owner (ops/CDN, not front-end).

| Check | Tier | Reuse | Build |
|---|---|---|---|
| DNS: resolution time, A/AAAA presence (IPv6!), CNAME chain depth, TTL sanity, DNSSEC | T0 | dig / dnsx | DNS grader |
| Protocol: HTTP/2 vs HTTP/3 (QUIC), ALPN, connection reuse and coalescing, head-of-line behaviour | T0/T2 | curl, nghttp | protocol prober |
| TLS handshake cost, session resumption, 0-RTT | T0 | testssl.sh | handshake timing |
| CDN/edge: cache HIT/MISS ratio by asset class, PoP identity, origin shielding, stale-while-revalidate use | T2 | — | **HAR analyser** (cache header + response header census) |
| Caching correctness: `Cache-Control` per asset class, immutable + hashed filenames, ETag/Last-Modified consistency, accidental `no-store` on static assets | T2 | — | caching grader |
| Compression: brotli/zstd/gzip coverage, uncompressed text payloads, over-compressed images, modern formats (AVIF/WebP) | T2 | — | payload census |
| Critical path: request count, redirect chains (incl. on assets), blocking resources, third-party domain count, connection setup cost | T2 | Lighthouse (partial) | waterfall/critical-path analyser |
| Resource hints: `preconnect`/`preload`/`dns-prefetch` present, correct, and **used** (unused preloads are a cost, not a win) | T2 | — | hint verifier |
| Font delivery: `font-display`, subsetting, self-host vs third-party, FOIT/FOUT | T2 | — | font auditor |
| Reliability of the API surface the journeys use: timeouts, retries, error rates, rate-limit headers | T3 | — | endpoint watcher (rides the journey runs) |
| Streaming health: SSE/WebSocket keepalive, reconnect behaviour | T3 | — | long-connection prober |
| bfcache eligibility, service-worker correctness, offline behaviour | T2 | Chrome bfcache reasons via CDP | eligibility prober |
| Geographic latency spread (TTFB by region) | T0 | multi-vantage: self-hosted WebPageTest agents or a public probe API | vantage runner — **single-vantage by default; multi-region is an add-on that needs infrastructure, and the report says which vantage it used** |

---

## 4. Findings, scores and fixes

### 4.1 Finding

```ts
interface Finding {
  id: FindingId;
  auditId: AuditId;
  dimension: Dimension;              // D1..D12
  check: string;                     // stable id, e.g. 'a11y.contrast.dark-theme'
  severity: 'blocker' | 'serious' | 'moderate' | 'minor';
  confidence: 'verified' | 'probable' | 'needs-human';
  source: 'fetch' | 'axe' | 'lighthouse' | 'nuclei' | 'differential' | 'agent' | 'human';
  standards: readonly string[];      // 'WCAG 2.2 SC 1.4.3', 'EN 301 549 9.1.4.3', 'GDPR Art 6'
  where: { url: string; template?: string; ref?: string; journey?: string; step?: number;
           matrix?: { theme?: string; locale?: string; viewport?: string; network?: string } };
  reach: { affected: number; sampled: number };
  evidence: readonly ArtifactRef[];  // never empty
  remediation: Remediation;
  firstSeen: string; lastSeen: string;
  status: 'open' | 'fixed' | 'accepted-risk' | 'false-positive';
}
```

Two invariants, enforced in code and in tests:
1. **No finding without evidence.** An empty `evidence` array fails validation.
2. **`confidence` never blends.** A model judgement is `probable` at best. Reports show
   the three buckets separately, always.

### 4.2 Score

Deterministic, explainable, no magic:

```
weight(f)      = sev(f) × conf(f) × reachFactor(f)
  sev          = blocker 40 | serious 15 | moderate 5 | minor 1
  conf         = verified 1.0 | probable 0.6 | needs-human 0.3
  reachFactor  = 0.25 + 0.75 × (affected / sampled)

penalty(dim)   = Σ weight(f) for f in dim
score(dim)     = round(100 × exp(−penalty(dim) / K(dim)))        # K calibrated per dimension
score(dim)     = min(score(dim), 49) if any verified blocker      # a blocker cannot pass
site score     = Σ profileWeight(dim) × score(dim)
grade          = A ≥90 · B ≥80 · C ≥70 · D ≥60 · F <60
```

Reported next to every score, never folded into it:
- **coverage** — checks executed / checks applicable (a 95 at 40% coverage is not a 95);
- **confidence split** — how much of the penalty came from `verified` vs `probable`;
- **matrix** — which themes/locales/viewports/networks were actually exercised.

**Every dimension carries its own score, and the per-dimension score is the primary
number** — the site score is a convenience roll-up, never shown alone. Each dimension
reports:

| Field | Meaning |
|---|---|
| `score` 0–100 + grade | the penalty model above, per dimension |
| `coverage` | checks executed / applicable, per dimension (a dimension we could not reach reports 0% coverage and *no* score, never a flattering default) |
| `split` | penalty attributable to `verified` / `probable` / `needs-human` |
| `counts` | findings by severity |
| `topFixes` | the three fix packs that would move this dimension most |
| `delta` | change vs the baseline audit, per dimension |

Rendered as a table in the markdown/HTML report, a `dimensions[]` array in the JSON
export, a row per dimension in `domia audit show`, and a card grid with sparklines in the
desktop app. A dimension with `coverage: 0` renders as "not assessed" — a missing score
is information, not something to paper over with a default.

Profile weights for the roll-up differ by site type (e-commerce weights journey, consent
and networking higher; a documentation site weights agentic SEO and language higher), and
the weights used are printed in the report header.

`K(dim)` is *calibrated*, not invented: a golden corpus of ~50 sites (known-good,
known-bad, and mid) is scored and the constants tuned so the distribution matches expert
judgement. Calibration is a task with a test, not a constant someone guessed.

### 4.3 Remediation

```ts
interface Remediation {
  summary: string;                       // "Give the dark-theme surface token a 4.5:1 pair"
  patch?: { file?: string; snippet: string; language: string };
  effort: 'S' | 'M' | 'L';               // <1h | <1d | >1d
  impact: 'high' | 'medium' | 'low';     // from severity × reach × dimension weight
  verification: string;                  // how to prove it is fixed
  repro?: RunId;                         // replayable run that demonstrates the finding
}
```

Fixes ship as **fix packs**: findings grouped by root cause (one token, one component,
one template) and ordered by impact/effort, so the client gets "these 6 changes remove
41% of the penalty" instead of 300 rows. Where a repo is connected (github MCP mount),
a pack can become a PR; the repro run is the acceptance test.

---

## 5. How this maps onto Domia

### 5.1 The package `@domia/audit` (A0 landed)

Built now — the vocabulary and the maths, nothing else:

```
packages/audit/src/
  module.ts       registers EP.AuditService + EP.MetaTool; requires trace only
  service.ts      per-run findings, evidence persistence, dedup by stable id
  handler.ts      the belt: dimensions | finding | coverage | score | report
  draft.ts        zod output → strict contracts (exactOptionalPropertyTypes)
  dimensions.ts   D1–D12 with penalty scale k and default weight
  score.ts        pure, unit-tested, calibratable
  report.ts       markdown: score table, findings by dimension, "not assessed"
prompts/personas/auditor.md
```

Arriving with the later slices:

```
  checks/         one file per check family; pure functions over inputs
  probes/         page scripts (axe injection, censuses, WebMCP discovery)
  runners/        lighthouse | nuclei | lychee | testssl adapters → Finding[]
  matrix.ts       theme × locale × viewport × network expansion
  sampler.ts      template clustering + budget-aware URL selection
  store/          audits | findings | scores | baselines (after migrations)
  report/         html | json | ACR-VPAT | EN 301 549 matrix
prompts/skills/{a11y-journey,state-transitions,consent-triad,agent-readiness,i18n-sweep}/SKILL.md
```

### 5.2 Belt tools the agent gets

`audit.map` (crawl + cluster + pick a sample) · `audit.probe` (in-page script) ·
`audit.scan` (out-of-band engine) · `audit.matrix` (re-run a check across the matrix) ·
`audit.finding` (record) · `audit.score` · `audit.report`.

The persona decides *when*; the tools decide *how*. No hardcoded audit pipeline — same
non-negotiable as everywhere else in this repo.

### 5.3 Capabilities we must add to `@domia/tools`

These are not audit-specific; they are missing browser controls that auditing exposes:

| New tool | Backed by | Also useful for |
|---|---|---|
| `browser.emulate` (colour scheme, reduced motion, forced colors, locale, timezone, device) | CDP `Emulation.*` | any locale/theme-sensitive task |
| `browser.network` (throttle profile, offline) | CDP `Network.emulateNetworkConditions` | resilience testing |
| `browser.intercept` (fail/delay/rewrite matching requests) | Playwright routing | fault injection, mocking |
| `browser.har` (export the network log as an artifact) | playwright-mcp diagnostics | privacy forensics, debugging |

Each lands behind the existing `ToolBinding` seam with capability gating, so a driver
that cannot do it simply does not offer it.

### 5.4 Storage — and the prerequisite we already flagged

New tables: `audits`, `findings`, `scores`, `baselines`. The store has **no migration
system** (`CREATE TABLE IF NOT EXISTS`, no `user_version`). Adding audit tables is the
forcing function: **schema migrations are a hard prerequisite for phase 2** and get their
own D-item, before any user has data worth losing.

### 5.5 Everything else already exists

Runs, sub-runs (a lane per dimension), iterate (crawl → prioritise → deep-dive),
artifacts + spans + exchange tape (evidence), replay (reproduce a finding), scheduler
(monitoring), memory (site knowledge across audits), skills (methodology as an asset),
MCP mounts (any external scanner), `domia mcp` (sell audits as a tool to other agents),
captured logins + headed handoff (authenticated journeys, human clears a CAPTCHA).

### 5.6 Surfaces

- **CLI**: `domia audit <target> --profile <p>` (prints the per-dimension score table),
  `audit show`, `audit diff <a> <b>`, `audit export --format html|json|acr`.
- **API**: `audits.*` namespace (start, get, findings, score, diff, export).
- **UI**: audit dashboard (one card per dimension: score, grade, coverage, delta, trend
  sparkline), findings triage (filter by dimension /
  severity / confidence, mark false-positive → feeds calibration), evidence viewer
  (screenshot + video + HAR next to the finding), fix-pack view.
- **Scheduled**: profile + cron → diff against baseline → alert on new blockers.

---

## 6. Industrial concerns

**Determinism.** Pin engine versions, device/viewport/locale matrix, network profiles,
and model + temperature per audit; record them in the report header. Same profile +
same site = comparable numbers. Where the model is involved, sample N times and report a
confidence interval rather than a single volatile value.

**Sampling.** Cluster URLs by DOM template signature (structural hash of the skeleton),
audit `k` per cluster, and roll findings up to the template. This is what turns a
100k-page site into a 400-page audit that is still defensible — and it makes the finding
count meaningful ("this affects 12 templates covering 78% of traffic").

**Budgets.** Every audit carries a token + wall-clock ceiling per dimension. T0/T1 run to
completion; T3 is spent where T0–T2 left a question. Cost per audit is measured in
phase 0 and printed in the report footer; pricing follows measurement, not the reverse.

**Throughput.** Sub-runs give parallel lanes; per-host rate limits and robots respect are
enforced in the sampler, not left to the agent.

**Quality control of the auditor itself.**
- A **golden corpus**: fixture sites with deliberately planted defects and an expected
  finding set. Regression on precision/recall per check.
- **False-positive loop**: triage marks feed back into check tuning and `K` calibration.
- **Flake metric**: the same audit run twice on an unchanged site must produce the same
  findings; instability is a bug in a check, tracked like any other.

**Tenancy & privacy.** Evidence from authenticated journeys contains PII: test accounts
only where possible, redaction on capture, retention as a setting, per-client isolation
of artifacts.

**Authorisation.** Security scanning and load-generating checks run only with written
scope. The profile carries the authorisation record; without it those checks are not
offered.

---

## 7. Build order

Each slice is demo-able, in the repo's tracer-bullet style.

| Slice | Build | Demo gate |
|---|---|---|
| **A0 Skeleton** ✅ | `@domia/audit`: dimensions, findings with mandatory evidence, deterministic scoring, markdown report, auditor persona, `domia audit <url>` | landed — live run against example.com recorded evidenced findings and printed the per-dimension table; the axe probe and the rest of the checks are A1+ |
| **A1 Files & SEO** ✅ | T0 sweeper: expected files, passive security headers, served-HTML SEO/language/delivery checks, starter-file remediations, `--sweep-only` | landed — 15 verified findings on a real site in ~200ms with no model; clean-fixture precision test in CI |
| **A2 Score & report** ◐ | `score.ts`, dedup, coverage, JSON export done; HTML report and template rollup remain | two runs of the same site score identically |
| **A3 Matrix** | `browser.emulate`/`network`/`intercept`, theme + locale + viewport matrix, visual diff | dark-mode contrast regression caught that a single-theme scan misses |
| **A4 Journeys** | journey harness, keyboard pass, authenticated flows, state-transition faults | audit of a login-gated checkout, with a forced-500 error state |
| **A5 Forensics** | consent triad, tracker classification, HAR evidence, dark-pattern meters | pre-consent tracker proven with video + HAR |
| **A6 Industrial** | migrations, `audits`/`findings` tables, sampler + clustering, api + UI, golden corpus | 5k-page site audited under budget, findings triaged in the UI |
| **A7 Recurring** | scheduler profiles, baselines, diffs, alerts, agent-readiness score, ACR export | "3 new blockers since Tuesday", with the replayable run |

A0–A2 is a sellable *report*. A3–A5 is the *differentiation*. A6–A7 is the *business*.

---

## 8. What we deliberately do not build

Accessibility overlays (liability magnet, and they do not fix anything). A crawler that
competes with Screaming Frog on breadth. A GEO dashboard business. Our line stays:
**evidence-backed findings, with fixes, on journeys nobody else can reach.**

---

## 9. Decisions needed before A0

1. **First vertical** — e-commerce (consent + checkout + agentic commerce) or public
   sector (EAA/ADA deadlines, procurement money)? It changes which dimensions ship first.
2. **Buyer** — agencies white-labelling us, or end clients direct? Changes the report
   surface (branding, multi-tenant) and the pricing model.
3. **Score publication** — do we ever publish scores publicly (leaderboards drive
   inbound, and also lawsuits)?
4. **Human sign-off** — do we sell "audit + expert sign-off" (higher price, needs a
   partner network) or tooling only?
5. **Repo access tier** — is PR-generating remediation part of the product, or a
   consulting upsell?

---

## Sources

[WebAIM Million 2026 contrast finding](https://percy.io/blog/open-source-visual-regression-testing-tools) ·
[visual regression OSS landscape](https://bug0.com/knowledge-base/open-source-visual-regression-testing-tools) ·
[dark-mode accessibility](https://www.accessibilitychecker.org/blog/dark-mode-accessibility/) ·
[agent-readiness standards](https://hard2bit.com/en/blog/ai-agent-readiness-scanner/) ·
[.well-known for agents](https://verityscore.io/en/blog/well-known-agent-ready/) ·
[llms.txt guide](https://limy.ai/blog/llms.txt-in-2026-the-full-guide) ·
[ARD vs llms.txt vs AGENTS.md](https://www.synscribe.com/blog/ard-vs-llms-txt-vs-agents-md-comparison) ·
[State of WebMCP](https://www.spronta.com/blog/state-of-webmcp-july-2026/) ·
[GEO metrics to track](https://searchengineland.com/geo-metrics-to-track-476642) ·
[measuring visibility in AI search](https://arxiv.org/pdf/2604.07585) ·
[GEO landscape 2026](https://martechseries.com/predictive-ai/ai-platforms-machine-learning/generative-engine-optimization-goes-mainstream-the-2026-ai-visibility-landscape/) ·
[Deque automated coverage](https://www.deque.com/automated-accessibility-coverage-report/)
