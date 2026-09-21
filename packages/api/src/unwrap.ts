import type { ApiResult, DomiaError, ModuleResult, Outcome } from '@domia/contracts';

export const apiOk = <T>(data: T): ApiResult<T> => ({ ok: true, data });
export const apiErr = <T>(e: Pick<DomiaError, 'code' | 'message'>): ApiResult<T> => ({ ok: false, error: { code: e.code, message: e.message } });

/** ModuleResult → wire-safe ApiResult (drops stacks/causes/secrets). */
export const fromResult = <T>(r: ModuleResult<T>): ApiResult<T> => (r.isOk() ? apiOk(r.value) : apiErr(r.error));

/** A ran-but-failed Outcome collapses to an ApiResult error too — the surface only cares ok/not. */
export function fromOutcome<T>(r: ModuleResult<Outcome<T>>): ApiResult<T> {
  if (r.isErr()) return apiErr(r.error);
  const o = r.value;
  return o.status === 'ok' ? apiOk(o.value) : apiErr(o.error);
}

export const mapResult = <T, U>(r: ModuleResult<T>, f: (v: T) => U): ApiResult<U> => (r.isOk() ? apiOk(f(r.value)) : apiErr(r.error));
