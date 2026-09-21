# Website auditing — what we can sell that scanners cannot produce

Research + build plan for the `audit` plugin. Branch `AuditwEBSITES`.
Sources are listed at the bottom; everything factual here is dated July 2026.

---

## 1. The one-sentence thesis

Every existing audit tool **inspects pages**. Domia **completes tasks**, behind
logins, across journeys, and records court-grade evidence while doing it — so we can
sell the 60–70% of an audit that scanners structurally cannot reach, at a price
between "free scanner" and "$25k consultancy".

---

## 2. Why classic tools hit a ceiling

| Limit | Consequence | What it means for a buyer |
|---|---|---|
| Only ~29.5% of WCAG 2.2 success criteria are fully automatable (10.3% partly, 60.2% manual). Automated engines catch 20–40% of real issues; axe-core ~57% *by volume* because a few criteria dominate counts | A "0 violations" scan is not a compliant site | Buyers who trust a scanner are exposed anyway |
| Scanners test **pages**, not **journeys** | Checkout, booking, application forms, multi-step wizards are untested | The revenue-critical paths are the untested ones |
| Scanners are unauthenticated | Everything behind login — account settings, dashboards, order history — is invisible | For SaaS/e-commerce that is most of the product |
| Rules cannot judge **semantics** | "Is this error message understandable?", "does the screen-reader narrative make sense?", "is the visual order the DOM order?" are unanswerable | Exactly the criteria auditors bill hours for |
| Rules cannot **interact to prove a legal fact** | Consent violations require clicking *Reject all* and observing what still fires; dark patterns require *attempting to cancel* | The legally actionable findings need an actor, not a parser |
| Output is a list, not evidence | Regulators, courts and insurers want proof, timestamps, reproduction | A CSV of selectors is not defensible |

The market has already priced this gap: manual/expert audits run **$100–250 per page**,
**$2k–7k** for a small site, **$7k–25k** mid-market, **$50k+** enterprise — because a
human has to do the other 60%.

---

## 3. The window (why now, and why it closes)

- **European Accessibility Act** applied 28 June 2025. Enforcement is arriving now:
  first French lawsuits Nov 2025; Dutch audits planned spring 2026 with non-reporters
  prioritised; June 2026 the Carrefour ruling ordered site *and* app accessible within
  six months under daily penalties. Authorities can order audits and name offenders.
- **ADA Title II** (US) — WCAG 2.1 AA for state/local government; the ≥50k-population
  deadline sat at 24 April 2026 with extensions pushing smaller entities to 2027.
  Vendors do not absorb the liability; the entity stays responsible.
- **Cookie/consent enforcement is mature and mechanical.** CNIL precedent: placing
  cookies before consent is a **per-session** violation, and making refusal harder than
  acceptance is a violation. ~73% of consent tools fail to actually block third-party
  trackers before "Accept". This is a *behavioural* fact — you must drive the banner to
  prove it.
- **Digital Fairness Act** proposal expected Q4 2026 targeting dark patterns, plus
  Consumer Rights Directive changes applying from 19 June 2026. Cancellation flows,
  confirmshaming, pre-checked boxes become measurable liabilities.
- **Agentic web** — Lighthouse 13.3 (May 2026) added an *Agentic Browsing* audit
  (llms.txt, WebMCP, a11y-tree quality); Chrome shipped WebMCP early preview (146) with
  an origin trial through 156; Firefox Q3 2026, Safari expected Q4. Adobe tracked a
  4,700% YoY jump in generative-AI traffic to US shopping sites, +393% in Q1 2026.
  Every brand will soon ask: *can an agent actually buy from us?* Nobody can answer that
  with a scanner — you answer it by **sending an agent**.

---

## 4. What we sell

Five products, all built from the same run engine.

### 4.1 Task-based conformance audit (EAA / EN 301 549 / WCAG 2.2 / ADA)
Not "pages scanned" but "journeys attempted": *sign up, log in, search, add to cart,
pay, change password, cancel*. Each journey run keyboard-only, then with the a11y tree
as the only channel. Deliverable: findings mapped to success criteria, each with a
screenshot/video/trace, plus an **ACR/VPAT-ready** conformance table and an explicit
"machine-verified vs model-judged vs needs-human" split.
**Sells against:** a $7k–25k manual audit that takes 3 weeks and covers 20 pages.

### 4.2 Consent & tracker forensics
Drive the banner three ways — *accept*, *reject*, *ignore* — from N locales, and diff
what actually fires: network requests, cookies, localStorage, fingerprinting calls.
Deliverable: per-vendor table of "fired before consent", with HAR + video evidence and
a per-session violation count in the regulator's own framing.
**Sells against:** CMP dashboards that report their own configuration, not reality.

### 4.3 Dark-pattern / Digital Fairness readiness
Measured, not opined: steps-to-cancel vs steps-to-subscribe, pre-checked boxes, reject
button visual weight vs accept, nagging repetition, urgency claims that do not change
when you reload. Evidence-backed, DFA/CRD/DSA-25 framed.
**Sells against:** nothing automated exists — this is currently pure consultancy.

### 4.4 Agent-readiness audit ("can an AI agent buy from you?")
We *are* the agent. Run the top five revenue tasks with a real model, report where it
fails and why (ambiguous labels, invisible state, CAPTCHA walls, hidden errors,
DOM-only affordances), plus the standards layer: llms.txt, WebMCP tools, structured
data, robots/Content-Signal, a11y-tree quality.
**Sells against:** checklists. Ours is empirical: a recorded agent transcript.

### 4.5 Continuous compliance monitoring (the recurring revenue)
The same audits on a schedule, diffed. Alert on *new* violations after a deploy, with
the exact run that proves it and a replayable reproduction.
**Sells against:** annual audits that are stale the day after they ship.

---

## 5. Why Domia specifically can build this (and a scanner vendor cannot)

| Capability we already shipped | What it unlocks for auditing |
|---|---|
| Captured logins (`case.captureAuth`, `authStateFile`, F7) | Audits behind authentication — the untested majority |
| Headed flip + `context.handoff` (F7) | A human clears a CAPTCHA/2FA mid-audit, agent resumes; audits don't die on a challenge |
| Sub-runs (`spawn_subrun`/`await_subruns`) | One journey per child run, in parallel lanes |
| `iterate` | Multi-pass audits: crawl → prioritise → deep-dive |
| Trace spans + artifacts (video, Playwright trace, console, network) + exchange tape | **Evidence by construction** — every finding has provenance |
| Replay from tape | Reproduce a finding on demand; prove regression or fix |
| Scheduler (R5) | Monitoring retainers without new machinery |
| Memory (R3) | Site-specific knowledge compounds across audits ("the cookie banner needs two rejects") |
| Skills (R4, SKILL.md + recording) | Methodology as an asset: a recorded audit becomes a repeatable, sellable procedure |
| MCP mounts (E1) | Any scanner that speaks MCP becomes a tool with zero Domia code |
| `domia mcp` (E6) | Sell the audit itself as a tool other agents call |

The moat is **evidence + journeys**, not rules. Rules are commodity (axe-core is free);
the audit *narrative* backed by reproducible proof is what buyers pay for today.

---

## 6. Which open-source tools we integrate (and how)

Three integration classes, in order of cost to build:

**A. In-page, through tools we already have.** The agent injects a script with
`browser.evaluate` and reads results back. No new process, keeps session + auth.
- **axe-core** (MPL-2.0, file-level copyleft — unmodified use is fine) — the rule engine.
- **IBM Equal Access** (Apache-2.0) — second opinion, different rule set, useful for
  disagreement flags.
- Structured-data / llms.txt / WebMCP probes — a few lines of page script each.

**B. Out-of-band processes, through the shell provider.** Normalised into our `Finding`
shape by the plugin.
- **Lighthouse** (Apache-2.0) — performance, SEO, best practices, and the 13.3 *Agentic
  Browsing* category. **Unlighthouse** (MIT) for site-wide sampling.
- **Pa11y** — HTML_CodeSniffer ruleset (confirm licence before shipping).
- **Nuclei** / **OWASP ZAP baseline** — security posture, headers, known CVEs.
- **lychee** — broken links. **testssl.sh** (GPL — keep it a separate process, never
  linked). **CO2.js** — carbon per page view, a cheap add-on section.
- **Tracker lists** (EasyPrivacy, DuckDuckGo Tracker Radar) as data, plus the
  **OpenWPM/Blacklight** methodology for what to instrument.

**C. MCP mounts.** Anything already speaking MCP (crawl4ai, firecrawl, a security
server) mounts onto the audit case with no code — that seam is already built.

What we do **not** copy: the overlay-widget business. Overlays are a legal liability
magnet; our sell is diagnosis + evidence + remediation guidance.

---

## 7. Architecture — the `audit` plugin

Plugins load through the same `ModuleHost` as built-ins, so no core changes are needed
for phase 0.

```
packages/plugins/audit/
  domia-plugin.json          name, version, entry
  src/module.ts              registers EP.MetaTool (+ EP.ToolProvider in phase 1)
  src/findings.ts            Finding shape, dedup, severity, standard mapping
  src/probes/                page scripts: axe, structured data, llms.txt, webmcp, consent
  src/runners/               lighthouse | nuclei | lychee | testssl wrappers → Finding[]
  src/report/                markdown | json | ACR-VPAT skeleton | EN 301 549 matrix
  prompts/personas/auditor.md
  prompts/skills/{wcag-journey,consent-forensics,agent-readiness}/SKILL.md
```

**The Finding shape is the product.** Everything normalises into it:

```ts
interface Finding {
  id: string;
  category: 'a11y' | 'privacy' | 'dark-pattern' | 'agent-readiness' | 'perf' | 'security' | 'seo';
  severity: 'blocker' | 'serious' | 'moderate' | 'minor';
  standards: readonly string[];        // 'WCAG 2.2 SC 1.4.3', 'EN 301 549 9.1.4.3', 'GDPR Art 6'
  where: { url: string; ref?: string; journey?: string; step?: number };
  evidence: readonly ArtifactRef[];    // screenshot, video segment, HAR slice, trace span
  source: 'axe' | 'lighthouse' | 'nuclei' | 'network' | 'agent-judgement' | 'human';
  confidence: 'verified' | 'probable' | 'needs-human';
  remediation?: string;
}
```

`source` + `confidence` are non-negotiable: a machine-verified contrast failure and a
model's opinion about a confusing error message **never merge into one number**. That
honesty is both the legal safety and the reason an expert will trust the report.

**Agent-facing tools** (belt tools, so the agent decides when to use them):
`audit.finding` (record one), `audit.probe` (run an in-page probe),
`audit.scan` (run an out-of-band scanner), `audit.report` (assemble + persist).
Methodology lives in the auditor persona and the skills — not in code, per the
non-negotiables.

---

## 8. Build plan

| Phase | Deliverable | Proof it works |
|---|---|---|
| **0 — spike** | `audit` plugin with `audit.finding` + `audit.report`, auditor persona, axe probe, `domia audit <url>` | One URL in → markdown report out, every finding carrying a screenshot artifact |
| **1 — journeys** | Journey skills (`wcag-journey`), authenticated audits via captured logins, sub-run per journey, keyboard-only pass | An audit of a login-gated flow that a scanner cannot reach |
| **2 — forensics** | Consent triad (accept/reject/ignore) with network diffing, dark-pattern measurements, per-locale runs | A pre-consent tracker caught with HAR + video evidence |
| **3 — scanners** | Lighthouse/Unlighthouse/Nuclei/lychee runners normalised into `Finding`, dedup against axe | One report, many engines, no duplicate rows |
| **4 — deliverables** | ACR/VPAT skeleton, EN 301 549 matrix, evidence pack export, client-ready HTML | A report a compliance officer accepts |
| **5 — recurring** | Scheduled re-audits, diffs, regression replay, agent-readiness score | "3 new blockers since your Tuesday deploy", with the run that proves it |

Phase 0–2 is where the differentiation lives; 3 is commodity work that makes the report
complete; 4 is what makes it *sellable*; 5 is what makes it *a business*.

---

## 9. Risks, honestly

- **Model judgement in legal-adjacent claims.** Mitigation: every finding needs an
  evidence artifact; we report findings and conformance *mapping*, never "you are
  compliant"; `needs-human` is a first-class outcome, and the report says how much of it
  there is.
- **Cost per audit.** A deep journey audit is many turns of vision + snapshots. Measure
  tokens/page and tokens/journey in phase 0 before pricing anything.
- **Authorisation.** Only audit sites the client owns or has authorised in writing —
  scope agreement, rate limits, no bypassing anti-bot defences. Security scanning
  (Nuclei/ZAP) is *only* on written authorisation.
- **Licences.** MPL-2.0 (axe) is file-level and fine; GPL tools (testssl) stay separate
  processes; verify Pa11y and OpenWPM before shipping anything that redistributes them.
- **Evidence contains PII.** Screenshots/HAR from authenticated journeys must be
  redacted or scoped to test accounts; retention has to be a setting, not an accident.
- **The ceiling applies to us too.** We push past 30–40% because we act and judge, but
  a full WCAG conformance claim still needs a human sign-off. Sell that as the model:
  Domia does the 80%, an expert signs the last mile.

---

## Sources

Accessibility automation ceiling: [Deque automated coverage](https://www.deque.com/automated-accessibility-coverage-report/) ·
[axe/Evinced and the WCAG ceiling](https://testeragents.com/accessibility-testing-ai/) ·
[what axe and Lighthouse miss](https://www.davidmello.com/software-testing/test-automation/playwright-accessibility-testing-axe-lighthouse-limitations)
EAA enforcement: [Pivotal Accessibility](https://www.pivotalaccessibility.com/2025/09/eaa-enforcement-in-europe-following-the-june-2025-deadline/) ·
[EAA 2026: what changed](https://corpowid.ai/blog/the-european-accessibility-act-is-now-being-enforced-heres-what-changed-in-2026) ·
[Level Access EAA guide](https://www.levelaccess.com/compliance-overview/european-accessibility-act-eaa/)
ADA Title II: [Jackson Lewis on the DOJ extension](https://www.jacksonlewis.com/insights/doj-extends-public-entities-compliance-deadline-ada-related-website-accessibility-hhss-may-2026-deadline-still-looms) ·
[Title II timeline](https://blog.usablenet.com/title-ii-compliance-deadline-2026)
Consent enforcement: [GDPR cookie fines 2026](https://www.polarisaudit.com/blog/gdpr-cookie-fines-2026) ·
[cookie consent fines 2025–2026](https://kukie.io/blog/cookie-consent-fines-2025-2026) ·
[cookie audit tooling](https://www.trackingplan.com/blog/cookies-audit-tools)
Dark patterns: [Osborne Clarke on the Digital Fairness Act](https://www.osborneclarke.com/insights/digital-fairness-act-unpacked-dark-patterns) ·
[EP briefing on regulating dark patterns](https://www.europarl.europa.eu/RegData/etudes/ATAG/2025/767191/EPRS_ATA(2025)767191_EN.pdf)
Agentic web: [State of WebMCP, July 2026](https://www.spronta.com/blog/state-of-webmcp-july-2026/) ·
[Chrome ships WebMCP preview](https://venturebeat.com/infrastructure/google-chrome-ships-webmcp-in-early-preview-turning-every-website-into-a) ·
[AI agent readiness standards](https://hard2bit.com/en/blog/ai-agent-readiness-scanner/) ·
[agentic commerce readiness](https://aiadvantageagency.com/agentic-commerce-readiness-checklist/)
Pricing: [Accessible.org pricing](https://accessible.org/pricing/) ·
[audit cost breakdown](https://accessible.org/cost-website-accessibility-audit/) ·
[DigitalA11Y cost guide](https://www.digitala11y.com/how-much-does-a-web-accessibility-audit-cost/)
Competitors: [accessibility vendor landscape](https://testparty.ai/blog/accessibility-audit-remediation-vendors) ·
[digital accessibility market](https://testparty.ai/blog/digital-accessibility-software-market)
OSS tooling: [Unlighthouse](https://unlighthouse.dev/) · [Lighthouse](https://github.com/GoogleChrome/lighthouse) ·
[axe-core](https://github.com/dequelabs/axe-core) · [OpenWPM](https://github.com/openwpm/OpenWPM) ·
[Blacklight methodology](https://themarkup.org/blacklight/2020/09/22/how-we-built-a-real-time-privacy-inspector)
