import type { TraceRecord } from '@domia/contracts';

const SECRET_KEY = /(^|_)(api[_-]?key|token|password|passwd|secret|authorization|auth|cookie|credential)s?($|_)/i;
const SECRET_REF = /^secret:\/\//;
const REDACTED = '[redacted]';

function scrub(value: unknown, keyHint?: string): unknown {
  if (typeof value === 'string') {
    if (SECRET_REF.test(value)) return REDACTED;
    if (keyHint && SECRET_KEY.test(keyHint)) return REDACTED;
    return value;
  }
  if (Array.isArray(value)) return value.map((v) => scrub(v));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = SECRET_KEY.test(k) ? REDACTED : scrub(v, k);
    return out;
  }
  return value;
}

/** Strip secret-shaped values before any record reaches a sink (never persist secrets). */
export function redactRecord(record: TraceRecord): TraceRecord {
  switch (record.t) {
    case 'span': return { t: 'span', span: { ...record.span, attrs: scrub(record.span.attrs) as typeof record.span.attrs } };
    case 'event': return { t: 'event', event: { ...record.event, attrs: scrub(record.event.attrs) as typeof record.event.attrs } };
    case 'exchange': return { t: 'exchange', exchange: { ...record.exchange, payload: scrub(record.exchange.payload) } };
    case 'artifact': return record;
  }
}
