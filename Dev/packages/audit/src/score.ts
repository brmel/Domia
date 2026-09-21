import type {
  AuditScore, Confidence, ConfidenceSplit, Dimension, DimensionCoverage, DimensionScore, Finding, Severity,
} from '@domia/contracts';
import { DIMENSIONS } from './dimensions.js';

const SEVERITY_WEIGHT: Record<Severity, number> = { blocker: 40, serious: 15, moderate: 5, minor: 1 };
const CONFIDENCE_WEIGHT: Record<Confidence, number> = { verified: 1, probable: 0.6, 'needs-human': 0.3 };
const BLOCKER_CEILING = 49;
const EMPTY_COUNTS: Record<Severity, number> = { blocker: 0, serious: 0, moderate: 0, minor: 0 };

export function reachFactor(affected: number, sampled: number): number {
  if (sampled <= 0) return 1;
  return 0.25 + 0.75 * Math.min(1, affected / sampled);
}

export function findingWeight(f: Finding): number {
  return SEVERITY_WEIGHT[f.severity] * CONFIDENCE_WEIGHT[f.confidence] * reachFactor(f.reach.affected, f.reach.sampled);
}

export function grade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

function split(findings: readonly Finding[]): ConfidenceSplit {
  const sum = (c: Confidence): number => findings.filter((f) => f.confidence === c).reduce((a, f) => a + findingWeight(f), 0);
  return { verified: round(sum('verified')), probable: round(sum('probable')), needsHuman: round(sum('needs-human')) };
}

function counts(findings: readonly Finding[]): Record<Severity, number> {
  return findings.reduce<Record<Severity, number>>(
    (acc, f) => ({ ...acc, [f.severity]: acc[f.severity] + 1 }),
    { ...EMPTY_COUNTS },
  );
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

export function scoreDimension(
  dimension: Dimension,
  title: string,
  k: number,
  findings: readonly Finding[],
  coverage: DimensionCoverage,
): DimensionScore {
  const penalty = findings.reduce((a, f) => a + findingWeight(f), 0);
  const base = Math.round(100 * Math.exp(-penalty / k));
  const cappedByBlocker = findings.some((f) => f.severity === 'blocker' && f.confidence === 'verified');
  const assessed = coverage.executed > 0;
  const score = assessed ? (cappedByBlocker ? Math.min(base, BLOCKER_CEILING) : base) : undefined;
  return {
    dimension, title, coverage, penalty: round(penalty), split: split(findings), counts: counts(findings), cappedByBlocker,
    ...(score !== undefined ? { score, grade: grade(score) } : {}),
  };
}

/**
 * The per-dimension score is the product; `overall` is a convenience roll-up over the
 * dimensions that were actually assessed, weighted by the profile.
 */
export function scoreAudit(
  findings: readonly Finding[],
  coverage: Readonly<Partial<Record<Dimension, DimensionCoverage>>>,
  weights: Readonly<Partial<Record<Dimension, number>>> = {},
): AuditScore {
  const dimensions = DIMENSIONS.map((info) => scoreDimension(
    info.id,
    info.title,
    info.k,
    findings.filter((f) => f.dimension === info.id),
    coverage[info.id] ?? { executed: 0, applicable: 0 },
  ));

  const effectiveWeights = Object.fromEntries(DIMENSIONS.map((d) => [d.id, weights[d.id] ?? d.defaultWeight]));
  const assessed = dimensions.filter((d) => d.score !== undefined);
  const totalWeight = assessed.reduce((a, d) => a + (effectiveWeights[d.dimension] ?? 1), 0);
  const overall = totalWeight > 0
    ? Math.round(assessed.reduce((a, d) => a + (d.score ?? 0) * (effectiveWeights[d.dimension] ?? 1), 0) / totalWeight)
    : undefined;

  return {
    dimensions,
    weights: effectiveWeights,
    assessed: assessed.length,
    findings: findings.length,
    ...(overall !== undefined ? { overall, grade: grade(overall) } : {}),
  };
}
