import { createHash } from 'node:crypto';
import { resultErr, resultOk, domiaError, moduleId, brandId, AUDIT_REPORT_LABEL, AUDIT_SNAPSHOT_LABEL } from '@domia/contracts';
import type {
  ArtifactId, AuditReport, AuditScore, AuditService, Dimension, DimensionCoverage, DimensionInfo,
  Finding, FindingDraft, Logger, ModuleResult, RunId, SweepSummary, Tracer,
} from '@domia/contracts';
import { sweep as runSweep, type SweepOptions } from './sweep.js';
import { DIMENSIONS, isDimension } from './dimensions.js';
import { scoreAudit } from './score.js';
import { renderReport } from './report.js';

const AUDIT = moduleId('audit');

interface AuditState {
  readonly findings: Finding[];
  readonly coverage: Map<Dimension, DimensionCoverage>;
}

function stableId(runId: RunId, draft: FindingDraft): string {
  const key = [draft.check, draft.where.url, draft.where.ref ?? '', draft.where.journey ?? '', JSON.stringify(draft.where.matrix ?? {})].join('|');
  return createHash('sha256').update(`${runId}:${key}`).digest('hex').slice(0, 16);
}

export class AuditServiceImpl implements AuditService {
  private readonly runs = new Map<string, AuditState>();

  constructor(private readonly tracer: Tracer, private readonly logger: Logger) {}

  dimensions(): readonly DimensionInfo[] {
    return DIMENSIONS;
  }

  async sweep(runId: RunId, url: string, opts?: SweepOptions): Promise<ModuleResult<SweepSummary>> {
    this.logger.info('audit sweep started', { runId, url, maxPages: opts?.maxPages });
    const result = await runSweep(url, opts ?? {});
    let recorded = 0;
    for (const draft of result.findings) {
      const stored = await this.record(runId, draft);
      if (stored.isErr()) {
        this.logger.warn('audit sweep finding refused', { runId, check: draft.check, reason: stored.error.message });
        continue;
      }
      recorded += 1;
      this.logger.debug('audit finding', { runId, check: draft.check, severity: draft.severity, dimension: draft.dimension });
    }
    for (const claim of result.coverage) {
      const { dimension, ...coverage } = claim;
      const covered = this.cover(runId, dimension, coverage);
      if (covered.isErr()) this.logger.warn('audit coverage refused', { runId, dimension, reason: covered.error.message });
    }
    const dimensions = [...new Set(result.coverage.map((c) => c.dimension))];
    this.logger.info('audit sweep finished', {
      runId, origin: result.origin, recorded, probes: result.probes,
      pages: result.pages.length, templates: result.templates, elapsedMs: result.elapsedMs,
    });
    return resultOk({
      origin: result.origin, recorded, probes: result.probes, pages: result.pages.length,
      templates: result.templates, elapsedMs: result.elapsedMs, dimensions,
    });
  }

  private state(runId: RunId): AuditState {
    const existing = this.runs.get(runId);
    if (existing) return existing;
    const fresh: AuditState = { findings: [], coverage: new Map() };
    this.runs.set(runId, fresh);
    return fresh;
  }

  async record(runId: RunId, draft: FindingDraft): Promise<ModuleResult<Finding>> {
    if (!isDimension(draft.dimension)) {
      return resultErr(domiaError(AUDIT, 'INVALID_ARGS', `unknown dimension '${draft.dimension}' (have: ${DIMENSIONS.map((d) => d.id).join(', ')})`));
    }
    const observed = draft.observed?.trim();
    const supplied = draft.evidenceArtifacts ?? [];
    if (supplied.length === 0 && !observed) {
      return resultErr(domiaError(AUDIT, 'INVALID_ARGS', 'a finding needs evidence: pass evidenceArtifacts, observed, or both'));
    }

    const evidence: ArtifactId[] = [...supplied];
    if (observed) {
      const saved = await this.tracer.saveArtifact(new TextEncoder().encode(observed), {
        kind: 'file', mime: 'text/plain', label: `finding-${draft.check}.txt`, runId,
      });
      if (saved.isErr()) return resultErr(saved.error);
      evidence.push(saved.value.id);
    }

    const state = this.state(runId);
    const id = stableId(runId, draft);
    const already = state.findings.find((f) => f.id === id);
    if (already) return resultOk(already);

    const finding: Finding = {
      ...draft,
      id: brandId<'FindingId'>(id),
      runId,
      recordedAt: new Date().toISOString(),
      evidence,
      standards: draft.standards ?? [],
      reach: draft.reach ?? { affected: 1, sampled: 1 },
    };
    state.findings.push(finding);
    return resultOk(finding);
  }

  cover(runId: RunId, dimension: Dimension, coverage: DimensionCoverage): ModuleResult<void> {
    if (!isDimension(dimension)) return resultErr(domiaError(AUDIT, 'INVALID_ARGS', `unknown dimension '${dimension}'`));
    if (coverage.executed < 0 || coverage.applicable < coverage.executed) {
      return resultErr(domiaError(AUDIT, 'INVALID_ARGS', 'coverage must satisfy 0 <= executed <= applicable'));
    }
    this.state(runId).coverage.set(dimension, coverage);
    return resultOk(undefined);
  }

  findings(runId: RunId): readonly Finding[] {
    return this.state(runId).findings;
  }

  score(runId: RunId): AuditScore {
    const state = this.state(runId);
    return scoreAudit(state.findings, Object.fromEntries(state.coverage));
  }

  /**
   * Rehydrate a past audit from the JSON snapshot saved next to its report. Findings live
   * in memory during a run; this is what makes them survive a restart until the store
   * gains migrations and real tables (D38).
   */
  async load(runId: RunId, snapshot: string): Promise<ModuleResult<number>> {
    try {
      const parsed = JSON.parse(snapshot) as { findings?: Finding[]; coverage?: Record<string, DimensionCoverage> };
      const state = this.state(runId);
      state.findings.length = 0;
      state.coverage.clear();
      for (const f of parsed.findings ?? []) state.findings.push(f);
      for (const [dimension, coverage] of Object.entries(parsed.coverage ?? {})) {
        if (isDimension(dimension)) state.coverage.set(dimension, coverage);
      }
      return resultOk(state.findings.length);
    } catch (e) {
      return resultErr(domiaError(AUDIT, 'INVALID_ARGS', `audit snapshot for run '${runId}' is not readable`, { cause: e }));
    }
  }

  private snapshot(runId: RunId): string {
    const state = this.state(runId);
    return JSON.stringify({ findings: state.findings, coverage: Object.fromEntries(state.coverage) });
  }

  async report(runId: RunId, target: string): Promise<ModuleResult<AuditReport>> {
    const state = this.state(runId);
    const score = this.score(runId);
    const generatedAt = new Date().toISOString();
    const markdown = renderReport({ runId, target, generatedAt, score, findings: state.findings });
    const saved = await this.tracer.saveArtifact(new TextEncoder().encode(markdown), {
      kind: 'file', mime: 'text/markdown', label: AUDIT_REPORT_LABEL, runId,
    });
    if (saved.isErr()) return resultErr(saved.error);
    const snapshot = await this.tracer.saveArtifact(new TextEncoder().encode(this.snapshot(runId)), {
      kind: 'file', mime: 'application/json', label: AUDIT_SNAPSHOT_LABEL, runId,
    });
    if (snapshot.isErr()) this.logger.warn('audit snapshot not saved', { runId, reason: snapshot.error.message });
    return resultOk({ runId, target, generatedAt, score, markdown, artifact: saved.value });
  }
}
