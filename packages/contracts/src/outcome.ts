import type { DomiaError } from './errors.js';
import type { ArtifactId, SpanId, TraceId } from './ids.js';

export type OutcomeStatus = 'ok' | 'failed' | 'cancelled' | 'timeout' | 'suspended';

export interface TokenUsage {
  readonly input: number;
  readonly output: number;
  readonly thinking?: number;
  readonly costUsd?: number;
}

export interface ArtifactRef {
  readonly id: ArtifactId;
  readonly kind: 'screenshot' | 'video' | 'snapshot' | 'file' | 'report' | 'recording';
  readonly mime: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly label?: string;
}

export interface OutcomeMeta {
  readonly startedAt: string;
  readonly endedAt: string;
  readonly durationMs: number;
  readonly traceId: TraceId;
  readonly spanId: SpanId;
  readonly artifacts: readonly ArtifactRef[];
  readonly cost?: TokenUsage;
}

/** D1 — discriminated: `value` exists only on the ok arm. */
export type Outcome<T> =
  | { readonly status: 'ok'; readonly value: T; readonly meta: OutcomeMeta; toJSON(): unknown }
  | { readonly status: Exclude<OutcomeStatus, 'ok'>; readonly error: DomiaError; readonly meta: OutcomeMeta; toJSON(): unknown };

export function outcomeOk<T>(value: T, meta: OutcomeMeta): Outcome<T> {
  return { status: 'ok', value, meta, toJSON: () => ({ status: 'ok', value, meta }) };
}

export function outcomeFail<T>(status: Exclude<OutcomeStatus, 'ok'>, error: DomiaError, meta: OutcomeMeta): Outcome<T> {
  return { status, error, meta, toJSON: () => ({ status, error: { ...error, cause: undefined }, meta }) };
}

/** Build an OutcomeMeta from a span's ids and a start time. One source, no casts. */
export function metaSince(
  startedAt: string,
  traceId: TraceId,
  spanId: SpanId,
  extra?: { readonly cost?: TokenUsage; readonly artifacts?: readonly ArtifactRef[] },
): OutcomeMeta {
  const endedAt = new Date().toISOString();
  return {
    startedAt,
    endedAt,
    durationMs: Math.max(0, Date.parse(endedAt) - Date.parse(startedAt)),
    traceId,
    spanId,
    artifacts: extra?.artifacts ?? [],
    ...(extra?.cost ? { cost: extra.cost } : {}),
  };
}
