import type { ArtifactId, ArtifactRef, Brand, ModuleResult, RunId } from './index.js';

export type FindingId = Brand<string, 'FindingId'>;

/** Artifact labels the audit writes, so any consumer can find them without guessing. */
export const AUDIT_SNAPSHOT_LABEL = 'audit-findings.json';
export const AUDIT_REPORT_LABEL = 'audit-report.md';

/**
 * D1–D12 of AUDIT-DESIGN.md. Ids are stable wire values: reports, baselines and
 * stored findings from older audits must keep resolving.
 */
export type Dimension =
  | 'performance' | 'accessibility' | 'theme' | 'language' | 'states' | 'seo'
  | 'agentic' | 'files' | 'privacy' | 'security' | 'journey' | 'network';

export type Severity = 'blocker' | 'serious' | 'moderate' | 'minor';
/** Machine verification and model judgement never merge into one number. */
export type Confidence = 'verified' | 'probable' | 'needs-human';
export type FindingSource = 'fetch' | 'axe' | 'lighthouse' | 'nuclei' | 'differential' | 'agent' | 'human';
export type Effort = 'S' | 'M' | 'L';
export type Impact = 'high' | 'medium' | 'low';

export interface DimensionInfo {
  readonly id: Dimension;
  readonly title: string;
  readonly summary: string;
  /** Penalty scale: how much accumulated weight halves the score. Calibrated, not guessed. */
  readonly k: number;
  readonly defaultWeight: number;
}

export interface Remediation {
  readonly summary: string;
  readonly effort: Effort;
  readonly impact: Impact;
  readonly verification: string;
  readonly patch?: { readonly language: string; readonly snippet: string; readonly file?: string };
}

export interface FindingWhere {
  readonly url: string;
  readonly ref?: string;
  readonly template?: string;
  readonly journey?: string;
  readonly step?: number;
  readonly matrix?: Readonly<Record<string, string>>;
}

export interface Reach {
  readonly affected: number;
  readonly sampled: number;
}

export interface FindingDraft {
  readonly dimension: Dimension;
  readonly check: string;
  readonly title: string;
  readonly detail: string;
  readonly severity: Severity;
  readonly confidence: Confidence;
  readonly source: FindingSource;
  readonly standards?: readonly string[];
  readonly where: FindingWhere;
  readonly reach?: Reach;
  readonly remediation: Remediation;
  /** Artifacts already captured (screenshots, HAR, video) that prove this finding. */
  readonly evidenceArtifacts?: readonly ArtifactId[];
  /** Verbatim observation — persisted as a text artifact so no finding is unevidenced. */
  readonly observed?: string;
}

export interface Finding extends FindingDraft {
  readonly id: FindingId;
  readonly runId: RunId;
  readonly recordedAt: string;
  readonly evidence: readonly ArtifactId[];
  readonly standards: readonly string[];
  readonly reach: Reach;
}

export interface DimensionCoverage {
  readonly executed: number;
  readonly applicable: number;
  readonly notes?: string;
}

export interface ConfidenceSplit {
  readonly verified: number;
  readonly probable: number;
  readonly needsHuman: number;
}

export interface DimensionScore {
  readonly dimension: Dimension;
  readonly title: string;
  /** Absent when coverage is zero: "not assessed" is information, not a default pass. */
  readonly score?: number;
  readonly grade?: 'A' | 'B' | 'C' | 'D' | 'F';
  readonly coverage: DimensionCoverage;
  readonly penalty: number;
  readonly split: ConfidenceSplit;
  readonly counts: Readonly<Record<Severity, number>>;
  readonly cappedByBlocker: boolean;
}

export interface AuditScore {
  readonly dimensions: readonly DimensionScore[];
  readonly overall?: number;
  readonly grade?: 'A' | 'B' | 'C' | 'D' | 'F';
  readonly weights: Readonly<Partial<Record<Dimension, number>>>;
  readonly assessed: number;
  readonly findings: number;
}

export interface AuditReport {
  readonly runId: RunId;
  readonly target: string;
  readonly generatedAt: string;
  readonly score: AuditScore;
  readonly markdown: string;
  readonly artifact: ArtifactRef;
}

export interface SweepSummary {
  readonly origin: string;
  readonly recorded: number;
  readonly probes: number;
  readonly pages: number;
  readonly templates: number;
  readonly elapsedMs: number;
  readonly dimensions: readonly Dimension[];
}

/** EP.AuditService (one). */
export interface AuditService {
  dimensions(): readonly DimensionInfo[];
  /** T0 — deterministic fetch-and-parse pass; records verified findings and coverage. */
  sweep(runId: RunId, url: string, opts?: { readonly maxPages?: number; readonly perTemplate?: number }): Promise<ModuleResult<SweepSummary>>;
  record(runId: RunId, draft: FindingDraft): Promise<ModuleResult<Finding>>;
  cover(runId: RunId, dimension: Dimension, coverage: DimensionCoverage): ModuleResult<void>;
  findings(runId: RunId): readonly Finding[];
  score(runId: RunId): AuditScore;
  report(runId: RunId, target: string): Promise<ModuleResult<AuditReport>>;
  /** Rehydrate an audit recorded by an earlier process from its JSON snapshot. */
  load(runId: RunId, snapshot: string): Promise<ModuleResult<number>>;
}
