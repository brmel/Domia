import type { Dimension, FindingDraft } from '@domia/contracts';
import type { ProbeResult } from '../probe.js';

export interface SweepContext {
  readonly origin: string;
  readonly home: ProbeResult;
  readonly files: ReadonlyMap<string, ProbeResult>;
  readonly httpHome?: ProbeResult;
}

export interface CoverageClaim {
  readonly dimension: Dimension;
  readonly executed: number;
  readonly applicable: number;
  readonly notes?: string;
}

export interface FamilyResult {
  readonly findings: readonly FindingDraft[];
  readonly coverage: readonly CoverageClaim[];
}

export type CheckFamily = (ctx: SweepContext) => FamilyResult;
